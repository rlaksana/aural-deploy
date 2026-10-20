import { buildInterviewerPrompt } from "@/lib/ai/prompts/interviewer";
import { getProvider } from "@/lib/ai/registry";
import type { LLMMessage } from "@/lib/ai/types";
import { resolveChatAdvance } from "@/lib/chat-advance";
import { resolveChoiceQuestionFlow } from "@/lib/choice-question-flow";
import { resolveDeterministicFlow } from "@/lib/deterministic-flow";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sessionTokenValid } from "@/lib/session-access";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/chat");

const CODING_CODE_MAX_CHARS = 20_000;
const CODING_OUTPUT_MAX_CHARS = 2_000;

/**
 * Parse the client-supplied coding context (current editor snapshot +
 * last run output) for CODING questions. Anything malformed or oversized
 * is dropped rather than trusted.
 */
function parseCodingContext(
  rawCode: unknown,
  rawLastRun: unknown,
): { language: string; code: string; stdout?: string; stderr?: string } | null {
  if (typeof rawCode !== "string" || !rawCode) return null;
  let parsed: { code?: unknown; language?: unknown };
  try {
    parsed = JSON.parse(rawCode);
  } catch {
    return null;
  }
  if (typeof parsed.code !== "string" || !parsed.code.trim()) return null;

  const coding: { language: string; code: string; stdout?: string; stderr?: string } = {
    language: typeof parsed.language === "string" ? parsed.language : "plaintext",
    code: parsed.code.slice(0, CODING_CODE_MAX_CHARS),
  };
  if (rawLastRun && typeof rawLastRun === "object") {
    const run = rawLastRun as Record<string, unknown>;
    if (typeof run.stdout === "string" && run.stdout.trim()) {
      coding.stdout = run.stdout.slice(0, CODING_OUTPUT_MAX_CHARS);
    }
    if (typeof run.stderr === "string" && run.stderr.trim()) {
      coding.stderr = run.stderr.slice(0, CODING_OUTPUT_MAX_CHARS);
    }
  }
  return coding;
}

export async function POST(req: Request) {
  const { sessionId, interviewId, messages, currentQuestionIndex, manualNavigation, sessionToken, candidateCode, lastRun } =
    await req.json();

  // sessionId is required: the LLM generation must never run without a
  // validated session, or this endpoint is a free LLM oracle.
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  if (!(await sessionTokenValid(supabaseAdmin, sessionId, sessionToken))) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 403 });
  }

  try {
    const { data: interview } = await supabaseAdmin
      .from("interviews")
      .select("*, questions(*)")
      .eq("id", interviewId)
      .order("order", { referencedTable: "questions", ascending: true })
      .single();

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 },
      );
    }

    // All interviews run on MiniMax-M3.1-Flash-Preview; stored llmProvider/llmModel are ignored.
    const provider = getProvider("minimax");

    const conversationHistory: LLMMessage[] = (messages ?? [])
      .filter(
        (m: { role?: string; content?: string }) =>
          typeof m.content === "string" && m.content.trim().length > 0,
      )
      .map((m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content.trim(),
      }));

    // Trust the server, not the client, for which question is active: this
    // route maintains sessions.currentQuestionId on every advance, and the
    // updateCurrentQuestion procedure keeps it in sync for manual navigation.
    // The client-supplied index is only a fallback for legacy sessions whose
    // currentQuestionId no longer resolves — a crafted client can no longer
    // fast-forward the completion guard by claiming to be on the last question.
    const { data: sessionRow } = await supabaseAdmin
      .from("sessions")
      .select("currentQuestionId")
      .eq("id", sessionId)
      .single();
    const questions = (interview.questions ?? []) as { id: string; text: string }[];
    const serverIndex = questions.findIndex(
      (q) =>
        q.id ===
        (sessionRow as { currentQuestionId?: string | null } | null)?.currentQuestionId,
    );
    const questionIndex = serverIndex >= 0 ? serverIndex : (currentQuestionIndex ?? 0);

    // Non-interview kinds (SURVEY/QUIZ/FORM/ASSESSMENT) never call the LLM.
    // Must run BEFORE the choice flow so surveys don't get the rationale probe.
    const detFlow = resolveDeterministicFlow({
      kind: (interview as { kind?: string }).kind,
      questions: (interview.questions ?? []) as { type: string; text: string }[],
      currentQuestionIndex: questionIndex,
      conversationHistory,
      language: interview.language,
    });

    const choiceFlow = detFlow
      ? null
      : resolveChoiceQuestionFlow({
          questions: interview.questions ?? [],
          currentQuestionIndex: questionIndex,
          conversationHistory,
          language: interview.language,
        });

    const response =
      detFlow || choiceFlow
        ? null
        : await provider.generateResponse({
          messages: buildInterviewerPrompt({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            interview: interview as any,
            conversationHistory,
            currentQuestionIndex: questionIndex,
            coding:
              ((interview.questions ?? []) as { type?: string }[])[questionIndex]?.type === "CODING"
                ? parseCodingContext(candidateCode, lastRun)
                : null,
          }),
          temperature: 0.7,
          maxTokens: 1024,
          model: "MiniMax-M3.1-Flash-Preview",
        });

    const responseContent = detFlow?.content ?? choiceFlow?.content ?? response?.content ?? "";
    const isDeterministicChoiceFlow = choiceFlow !== null;

    const { questionAdvanced, isComplete, cleanContent, markerComplete, advancedWithoutMarker } =
      resolveChatAdvance({
        responseContent,
        detFlow,
        choiceFlow,
        manualNavigation,
        currentQuestionIndex: questionIndex,
        questions,
        conversationHistory,
      });

    if (markerComplete && !isComplete) {
      log.info("Suppressed premature [INTERVIEW_COMPLETE] marker", {
        sessionId,
        currentQuestionIndex,
        totalQuestions: (interview.questions ?? []).length,
        conversationLength: conversationHistory.length,
      });
    }

    if (advancedWithoutMarker) {
      log.info("Fallback: detected question advancement without marker", {
        sessionId,
        currentQuestionIndex,
      });
    }

    if (isDeterministicChoiceFlow) {
      log.info("Choice-question flow handled deterministically", {
        sessionId,
        currentQuestionIndex,
        questionAdvanced,
        isComplete,
      });
    }

    // An empty reply carries no transcript value and would trip the
    // summary's non-empty-transcript guard.
    if (cleanContent && typeof sessionId === "string") {
      await supabaseAdmin.from("messages").insert({
        sessionId,
        role: "ASSISTANT" as const,
        content: cleanContent,
        wordCount: cleanContent.split(/\s+/).length,
      });
    }

    if (questionAdvanced) {
      const nextIndex = questionIndex + 1;
      const nextQuestion = questions[nextIndex];
      if (nextQuestion) {
        await supabaseAdmin
          .from("sessions")
          .update({ currentQuestionId: nextQuestion.id })
          .eq("id", sessionId);
      }
    }

    return NextResponse.json({
      content: cleanContent,
      questionAdvanced,
      isComplete,
    });
  } catch (error) {
    log.error("Chat AI error:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}

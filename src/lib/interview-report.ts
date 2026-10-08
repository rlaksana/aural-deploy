import type { SupabaseClient } from "@supabase/supabase-js";
import { parseChoiceSelection } from "./deterministic-flow";
import { getSessionOverallScore } from "./session-score";

/**
 * Aggregate per-candidate rows for the interview-level report.
 * DB access lives in `fetchReportEntries` (server-only); the row building
 * below is pure so it can be unit-tested without a database.
 */

export type ReportRow = {
  sessionId: string;
  name: string;
  email: string | null;
  status: string;
  source: "Invited" | "Walk-in";
  overallScore: number | null;
  /** criteria/question label -> score (0-10) */
  criteria: Record<string, number>;
  summary: string | null;
  completedAt: string | null;
};

export type InterviewReport = {
  interviewTitle: string;
  /** Union of criteria/question labels across candidates, stable order */
  criteriaNames: string[];
  /** "Q1" -> full question text, for column tooltips */
  questionLabels: Record<string, string>;
  /** Sorted by score desc (unscored last), then completion date desc */
  rows: ReportRow[];
};

type InsightsShape = {
  criteriaEvaluations?: { name?: unknown; score?: unknown }[];
  questionEvaluations?: { question?: unknown; score?: unknown }[];
  summary?: unknown;
};

type SessionMessage = {
  role: string;
  content: string;
  questionId: string | null;
};

type SessionLike = {
  id: string;
  status?: string | null;
  insights?: unknown;
  summary?: string | null;
  participantName?: string | null;
  participantEmail?: string | null;
  completedAt?: string | null;
  messages?: SessionMessage[] | null;
} | null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Extract criteria/question scores from a session's insights JSON. */
function extractCriteria(
  insights: unknown,
  questionLabels: Record<string, string>,
): Record<string, number> {
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) {
    return {};
  }
  const data = insights as InsightsShape;
  const out: Record<string, number> = {};

  for (const ce of data.criteriaEvaluations ?? []) {
    if (ce && typeof ce.name === "string" && isFiniteNumber(ce.score)) {
      out[ce.name] = ce.score;
    }
  }

  (data.questionEvaluations ?? []).forEach((qe, i) => {
    if (qe && typeof qe.question === "string" && isFiniteNumber(qe.score)) {
      // "Q{n}" keeps the column narrow; the view shows the full text on hover.
      const label = `Q${i + 1}`;
      out[label] = qe.score;
      if (!questionLabels[label]) questionLabels[label] = qe.question;
    }
  });

  return out;
}

function extractSummary(session: NonNullable<SessionLike>, insights: unknown): string | null {
  if (typeof session.summary === "string" && session.summary) return session.summary;
  if (insights && typeof insights === "object" && !Array.isArray(insights)) {
    const s = (insights as InsightsShape).summary;
    if (typeof s === "string" && s) return s;
  }
  return null;
}

export type ReportEntry = {
  name: string | null;
  email: string | null;
  source: "Invited" | "Walk-in";
  session: SessionLike;
};

/** Build ranked report rows from invited candidates + walk-in sessions. */
export function buildReportRows(
  interviewTitle: string,
  entries: ReportEntry[],
): InterviewReport {
  const criteriaNames: string[] = [];
  const questionLabels: Record<string, string> = {};
  const seenCriteria = new Set<string>();
  const addCriteria = (label: string) => {
    if (!seenCriteria.has(label)) {
      seenCriteria.add(label);
      criteriaNames.push(label);
    }
  };

  const rows: ReportRow[] = [];
  for (const entry of entries) {
    const session = entry.session;
    if (!session) {
      // Invited candidate who never started — keep them visible for the roster.
      if (entry.source === "Invited") {
        rows.push({
          sessionId: "",
          name: entry.name ?? entry.email ?? "Unnamed",
          email: entry.email,
          status: "NOT_STARTED",
          source: entry.source,
          overallScore: null,
          criteria: {},
          summary: null,
          completedAt: null,
        });
      }
      continue;
    }

    const insights = session.insights;
    const criteria = extractCriteria(insights, questionLabels);
    Object.keys(criteria).forEach(addCriteria);

    rows.push({
      sessionId: session.id,
      name:
        entry.name ||
        session.participantName ||
        entry.email ||
        session.participantEmail ||
        "Anonymous",
      email: entry.email ?? session.participantEmail ?? null,
      status: session.status ?? "UNKNOWN",
      source: entry.source,
      overallScore: getSessionOverallScore(
        insights as Parameters<typeof getSessionOverallScore>[0],
      ),
      criteria,
      summary: extractSummary(session, insights),
      completedAt: session.completedAt ?? null,
    });
  }

  rows.sort((a, b) => {
    const scoreDiff = (b.overallScore ?? -1) - (a.overallScore ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
  });

  return { interviewTitle, criteriaNames, questionLabels, rows };
}

/** Server-side fetch: invited candidates + their sessions, plus walk-in sessions. */
export async function fetchReportEntries(
  supabase: SupabaseClient,
  interviewId: string,
): Promise<ReportEntry[]> {
  const { data: candidateData } = await supabase
    .from("candidates")
    .select("name, email, session:sessions(*, messages(role, content, questionId))")
    .eq("interviewId", interviewId)
    .order("createdAt", { ascending: false });

  // Untyped admin client infers the embedded `session` as any[] — reshape via unknown.
  const candidates = (candidateData ?? []) as unknown as {
    name: string | null;
    email: string | null;
    session: SessionLike;
  }[];

  const linkedSessionIds = candidates
    .map((c) => c.session?.id)
    .filter(Boolean) as string[];

  const walkInQuery = supabase
    .from("sessions")
    .select("*, messages(role, content, questionId)")
    .eq("interviewId", interviewId);

  const walkInSessions = linkedSessionIds.length
    ? (await walkInQuery.not("id", "in", `(${linkedSessionIds.join(",")})`)).data
    : (await walkInQuery).data;

  const entries: ReportEntry[] = [
    ...candidates.map((c) => ({
      name: c.name,
      email: c.email,
      source: "Invited" as const,
      session: c.session,
    })),
    ...((walkInSessions ?? []) as SessionLike[]).map((s) => ({
      name: s?.participantName ?? null,
      email: s?.participantEmail ?? null,
      source: "Walk-in" as const,
      session: s,
    })),
  ];

  return entries;
}

/* ------------------------------------------------------------------ */
/*  Survey / form / quiz aggregate                                     */
/* ------------------------------------------------------------------ */

export type AggregateQuestion = {
  id: string;
  text: string;
  type: string;
  options?: { options?: string[]; correctIndices?: number[] } | null;
};

export type SurveyQuestionAggregate = {
  id: string;
  text: string;
  type: string;
  /** Option label → response count (choice/rating questions). */
  tally?: { option: string; count: number }[];
  /** Mean of numeric option labels (Likert/NPS style), 2-decimal rounded. */
  average?: number;
  /** Open answers with respondent name (surveys/forms). */
  textAnswers?: { name: string | null; content: string }[];
  /** Quiz only: share of respondents answering this keyed question correctly. */
  correctRate?: { correct: number; total: number };
};

export type SurveyAggregate = {
  respondentCount: number;
  questions: SurveyQuestionAggregate[];
};

/** USER messages grouped per question, across all sessions. */
function collectAnswers(entries: ReportEntry[]) {
  const byQuestion = new Map<string, { name: string | null; content: string }[]>();
  let respondentCount = 0;

  for (const entry of entries) {
    const session = entry.session;
    if (!session) continue;
    respondentCount++;

    const name =
      entry.name ||
      session.participantName ||
      entry.email ||
      session.participantEmail ||
      null;

    for (const message of session.messages ?? []) {
      if (message.role !== "USER" || !message.content.trim() || !message.questionId) continue;
      const bucket = byQuestion.get(message.questionId) ?? [];
      bucket.push({ name, content: message.content });
      byQuestion.set(message.questionId, bucket);
    }
  }
  return { byQuestion, respondentCount };
}

/**
 * Cross-respondent aggregate for non-interview kinds. Choice answers are
 * tallied from the protocol messages; open answers are listed for forms.
 * Quiz correct-rates come from the deterministic `insights` written at
 * session completion.
 */
export function buildSurveyAggregate(
  entries: ReportEntry[],
  questions: AggregateQuestion[],
): SurveyAggregate {
  const { byQuestion, respondentCount } = collectAnswers(entries);

  const questionAggregates: SurveyQuestionAggregate[] = questions.map((question) => {
    const aggregate: SurveyQuestionAggregate = {
      id: question.id,
      text: question.text,
      type: question.type,
    };
    const answers = byQuestion.get(question.id) ?? [];

    const isChoice =
      question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE";
    const optionLabels = question.options?.options;

    if (isChoice && Array.isArray(optionLabels)) {
      const counts = new Map<string, number>();
      let numericSum = 0;
      let numericCount = 0;
      let allNumeric = optionLabels.length > 0;

      for (const answer of answers) {
        for (const index of parseChoiceSelection(answer.content)) {
          const label = optionLabels[index];
          if (label === undefined) continue;
          counts.set(label, (counts.get(label) ?? 0) + 1);
          const value = Number(label);
          if (Number.isFinite(value)) {
            numericSum += value;
            numericCount++;
          } else {
            allNumeric = false;
          }
        }
      }

      aggregate.tally = optionLabels.map((option) => ({
        option,
        count: counts.get(option) ?? 0,
      }));
      if (allNumeric && numericCount > 0) {
        aggregate.average = Math.round((numericSum / numericCount) * 100) / 100;
      }
    } else if (question.type === "SHORT_TEXT" || question.type === "OPEN_ENDED") {
      aggregate.textAnswers = answers.map((a) => ({ name: a.name, content: a.content }));
    }

    // Quiz correct-rate from the deterministic evaluations (matched by text).
    const hasKey =
      Array.isArray(question.options?.correctIndices) &&
      question.options!.correctIndices!.length > 0;
    if (hasKey) {
      let correct = 0;
      let total = 0;
      for (const entry of entries) {
        const evaluations = (
          (entry.session?.insights as { questionEvaluations?: { question?: string; correct?: boolean }[] } | null)
            ?.questionEvaluations ?? []
        ).filter((e) => e.question === question.text);
        if (evaluations.length === 0) continue;
        total++;
        if (evaluations[0].correct) correct++;
      }
      if (total > 0) aggregate.correctRate = { correct, total };
    }

    return aggregate;
  });

  return { respondentCount, questions: questionAggregates };
}

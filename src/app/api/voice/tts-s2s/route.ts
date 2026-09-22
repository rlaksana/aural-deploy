import { isAbortError } from "@/lib/abort-error";
import { createLogger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { resolveMiniMaxVoiceConfig } from "../../../../../server/minimax-voice";
import { synthesizeCoachAudio } from "./synthesize";

const log = createLogger("api/voice/tts-s2s");

/**
 * POST /api/voice/tts-s2s
 *
 * Coach TTS synthesis via MiniMax sync t2a_v2. Always returns WAV (browser-safe).
 */
export async function POST(req: Request) {
  let body: { text?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const language = typeof body.language === "string" ? body.language : undefined;

  if (!rawText) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const voiceConfig = resolveMiniMaxVoiceConfig();
  if (!voiceConfig.apiKey) {
    return NextResponse.json(
      { error: "MiniMax TTS credentials not configured" },
      { status: 503 }
    );
  }

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  try {
    const startedAt = Date.now();
    const wav = await synthesizeCoachAudio(rawText, voiceConfig, language, abort.signal);

    if (!wav) {
      log.warn(`MiniMax TTS returned no audio (${rawText.length} chars in)`);
      return NextResponse.json(
        { error: "MiniMax TTS returned no audio", fallback: "browser" },
        { status: 502 },
      );
    }

    log.info(
      `MiniMax TTS synthesized wav: ${wav.byteLength}B, ${Date.now() - startedAt}ms`,
    );

    return new Response(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Aural-TTS-Format": "wav",
        "X-Aural-TTS-Provider": "minimax-tts",
      },
    });
  } catch (err) {
    if (abort.signal.aborted || isAbortError(err)) {
      return new Response(null, { status: 499 });
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("MiniMax TTS synthesis failed:", message);
    return NextResponse.json(
      { error: "MiniMax TTS synthesis failed" },
      { status: 502 }
    );
  }
}

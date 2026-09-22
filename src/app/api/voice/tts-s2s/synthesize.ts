import { isAbortError } from "@/lib/abort-error";
import { createLogger } from "@/lib/logger";
import { prepareCoachTtsText } from "@/lib/prep/coach-tts-text";
import {
    synthesizePcm,
    wrapPcmAsWav,
    type MiniMaxVoiceConfig,
} from "../../../../../server/minimax-voice";

const log = createLogger("api/voice/tts-s2s");

/** Synthesize coach speech to a 24 kHz WAV buffer (browser-playable), or null when empty. */
export async function synthesizeCoachAudio(
  rawText: string,
  voiceConfig: MiniMaxVoiceConfig,
  language: string | undefined,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  const text = prepareCoachTtsText(rawText);
  if (!text) return null;

  try {
    const pcm = await synthesizePcm(text, voiceConfig, { language, signal });
    if (pcm.byteLength === 0) {
      log.warn(`MiniMax TTS empty for ${text.length} chars`);
      return null;
    }
    return wrapPcmAsWav(pcm, 24_000);
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) return null;
    throw err;
  }
}

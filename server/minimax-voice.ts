/**
 * MiniMax voice services:
 *  - ASR: one-shot POST /v1/speech_to_text (multipart). Raw PCM is unsupported —
 *    callers must pass PCM already wrapped in a WAV container (wrapPcmAsWav).
 *  - TTS: sync POST /v1/t2a_v2. Returns hex-encoded WAV; decodeWavPcm extracts raw
 *    PCM by walking RIFF chunks (header is not guaranteed to be 44 bytes).
 *
 * Endpoint: https://api.minimax.io/v1 (international).
 */
import { createLogger } from "../src/lib/logger";

const log = createLogger("minimax-voice");

export interface MiniMaxVoiceConfig {
  apiKey: string;
  baseUrl: string;
  ttsModel: string;
  voiceZh: string;
  voiceEn: string;
  speechRate?: number;
}

export function resolveMiniMaxVoiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): MiniMaxVoiceConfig {
  const parsedRate = Number(env.MINIMAX_TTS_SPEECH_RATE);
  const speechRate =
    Number.isFinite(parsedRate) && parsedRate > 0
      ? Math.min(2, Math.max(0.5, parsedRate))
      : 1.0;
  return {
    apiKey: env.MINIMAX_API_KEY || "",
    baseUrl: (env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/$/, ""),
    ttsModel: env.MINIMAX_TTS_MODEL || "speech-2.8-turbo",
    voiceZh: env.MINIMAX_TTS_VOICE_ZH || "male-qn-qingse",
    voiceEn: env.MINIMAX_TTS_VOICE_EN || "English_Trustworth_Man",
    speechRate,
  };
}

// ── WAV helpers ──────────────────────────────────────────────────────

export function wrapPcmAsWav(
  pcm: Buffer,
  sampleRate = 16_000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataBytes = pcm.byteLength - (pcm.byteLength % (bitsPerSample / 8));
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);

  return Buffer.concat([header, pcm.subarray(0, dataBytes)]);
}

/** Walk RIFF chunks to the `data` chunk — never assume a fixed header offset. */
export function decodeWavPcm(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("MiniMax TTS: response is not a RIFF/WAV payload");
  }
  let pos = 12;
  while (pos + 8 <= wav.length) {
    const id = wav.toString("ascii", pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    if (id === "data") {
      const pcm = wav.subarray(pos + 8, Math.min(pos + 8 + size, wav.length));
      if (pcm.byteLength === 0) throw new Error("MiniMax TTS: empty data chunk");
      return Buffer.from(pcm);
    }
    pos += 8 + size + (size % 2); // chunks are word-aligned
  }
  throw new Error("MiniMax TTS: no data chunk in WAV payload");
}

// ── ASR ──────────────────────────────────────────────────────────────

/**
 * One-shot ASR over 16 kHz mono s16le PCM. Returns the recognized text
 * ("" when MiniMax returns nothing usable).
 */
export async function transcribePcm(
  pcm: Buffer,
  cfg: MiniMaxVoiceConfig,
  language?: string,
  signal?: AbortSignal,
): Promise<string> {
  const wav = wrapPcmAsWav(pcm, 16_000);
  const form = new FormData();
  form.append("model", "asr-1.0");
  form.append(
    "file",
    new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    "utterance.wav",
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (language) {
    headers["language"] = language.toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  const res = await fetch(`${cfg.baseUrl}/speech_to_text`, {
    method: "POST",
    headers,
    body: form,
    signal,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`MiniMax ASR HTTP ${res.status}: ${detail}`);
  }
  const json = (await res.json()) as {
    text?: string;
    base_resp?: { status_code?: number; status_msg?: string };
  };
  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax ASR failed (${json.base_resp.status_code}): ${json.base_resp.status_msg}`,
    );
  }
  return (json.text || "").trim();
}

// ── TTS ──────────────────────────────────────────────────────────────

export interface TtsRequestOptions {
  language?: string;
  signal?: AbortSignal;
}

/**
 * Sync TTS → raw 24 kHz mono s16le PCM. Throws on provider errors; callers
 * decide fallback behavior.
 */
export async function synthesizePcm(
  text: string,
  cfg: MiniMaxVoiceConfig,
  opts: TtsRequestOptions = {},
): Promise<Buffer> {
  const isZh = opts.language?.toLowerCase().startsWith("zh");
  const voiceId = isZh ? cfg.voiceZh : cfg.voiceEn;

  const res = await fetch(`${cfg.baseUrl}/t2a_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.ttsModel,
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: cfg.speechRate ?? 1.0,
        vol: 1.0,
        pitch: 0,
        sample_rate: 24_000,
      },
      audio_setting: { sample_rate: 24_000, format: "wav" },
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`MiniMax TTS HTTP ${res.status}: ${detail}`);
  }
  const json = (await res.json()) as {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  };
  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax TTS failed (${json.base_resp.status_code}): ${json.base_resp.status_msg}`,
    );
  }
  const audioHex = json.data?.audio;
  if (!audioHex) throw new Error("MiniMax TTS: no audio in response");
  const wav = Buffer.from(audioHex, "hex");
  log.debug(`TTS ${text.length} chars -> ${wav.byteLength}B wav (${voiceId})`);
  return decodeWavPcm(wav);
}

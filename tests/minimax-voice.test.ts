import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeWavPcm,
  resolveMiniMaxVoiceConfig,
  wrapPcmAsWav,
} from "../server/minimax-voice";

// ── wrapPcmAsWav: canonical 44-byte PCM WAV header ──

test("wrapPcmAsWav writes the exact 44-byte PCM header", () => {
  const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const wav = wrapPcmAsWav(pcm, 16_000, 1, 16);
  assert.equal(wav.length, 48);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), 36 + 4); // riffSize = 36 + dataBytes
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.toString("ascii", 12, 16), "fmt ");
  assert.equal(wav.readUInt32LE(16), 16); // fmt chunk size
  assert.equal(wav.readUInt16LE(20), 1); // PCM format
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 16_000); // sample rate
  assert.equal(wav.readUInt32LE(28), 32_000); // byteRate = rate * blockAlign
  assert.equal(wav.readUInt16LE(32), 2); // blockAlign
  assert.equal(wav.readUInt16LE(34), 16); // bits per sample
  assert.equal(wav.toString("ascii", 36, 40), "data");
  assert.equal(wav.readUInt32LE(40), 4); // data size
  assert.deepEqual(wav.subarray(44), pcm);
});

test("wrapPcmAsWav truncates an odd trailing byte to the sample boundary", () => {
  const wav = wrapPcmAsWav(Buffer.alloc(5, 7)); // 16-bit samples need even bytes
  assert.equal(wav.length, 44 + 4);
  assert.equal(wav.readUInt32LE(40), 4);
});

test("wrapPcmAsWav round-trips through decodeWavPcm", () => {
  const pcm = Buffer.alloc(100, 0x42);
  assert.deepEqual(decodeWavPcm(wrapPcmAsWav(pcm)), pcm);
});

// ── decodeWavPcm: walk RIFF chunks, never assume a fixed header offset ──

/** Builds a real RIFF/WAV container: every odd-size chunk body gets its
 *  word-alignment pad byte, exactly as MiniMax's responses are formed. */
function riffWav(chunks: Array<{ id: string; body: Buffer }>): Buffer {
  const parts: Buffer[] = [
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WAVE", "ascii"),
  ];
  for (const chunk of chunks) {
    parts.push(Buffer.from(chunk.id, "ascii"));
    const size = Buffer.alloc(4);
    size.writeUInt32LE(chunk.body.length);
    parts.push(size, chunk.body);
    if (chunk.body.length % 2) parts.push(Buffer.alloc(1));
  }
  const wav = Buffer.concat(parts);
  wav.writeUInt32LE(wav.length - 8, 4);
  return wav;
}

test("decodeWavPcm skips a LIST metadata chunk placed before data", () => {
  const pcm = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const wav = riffWav([
    { id: "LIST", body: Buffer.from("INFOzzzzzzzzzzzz", "ascii") }, // even size, clears the 44-byte guard
    { id: "data", body: pcm },
  ]);
  assert.deepEqual(decodeWavPcm(wav), pcm);
});

test("decodeWavPcm respects word-alignment padding after odd-size chunks", () => {
  const pcm = Buffer.from([0x55, 0x66]);
  const wav = riffWav([
    { id: "LIST", body: Buffer.alloc(31, 0x78) }, // size 31 → 1 pad byte before "data"
    { id: "data", body: pcm },
  ]);
  assert.deepEqual(decodeWavPcm(wav), pcm);
});

test("decodeWavPcm throws on an empty data chunk", () => {
  // A leading LIST chunk clears the <44-byte header guard so the failure comes
  // from the empty data chunk itself.
  assert.throws(
    () =>
      decodeWavPcm(
        riffWav([
          { id: "LIST", body: Buffer.alloc(40, 0x49) },
          { id: "data", body: Buffer.alloc(0) },
        ]),
      ),
    /empty data chunk/,
  );
});

test("decodeWavPcm throws on non-RIFF payloads and buffers shorter than a header", () => {
  assert.throws(() => decodeWavPcm(Buffer.from("OggS-not-a-wav-payload-!!")), /not a RIFF/);
  assert.throws(() => decodeWavPcm(Buffer.alloc(10, 0x52)), /not a RIFF/);
});

test("decodeWavPcm throws when the container has no data chunk", () => {
  // Body long enough to clear the <44-byte header guard so the failure comes
  // from the chunk walk itself.
  assert.throws(
    () => decodeWavPcm(riffWav([{ id: "LIST", body: Buffer.alloc(26, 0x49) }])),
    /no data chunk/,
  );
});

// ── resolveMiniMaxVoiceConfig: defaults + speech-rate clamp ──

/** Minimal env fixture — Next.js augments ProcessEnv with a required NODE_ENV. */
function cfgEnv(over: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...over } as NodeJS.ProcessEnv;
}

test("resolveMiniMaxVoiceConfig applies defaults when env is empty", () => {
  assert.deepEqual(resolveMiniMaxVoiceConfig(cfgEnv({})), {
    apiKey: "",
    baseUrl: "https://api.minimax.io/v1",
    ttsModel: "speech-2.8-turbo",
    voiceZh: "male-qn-qingse",
    voiceEn: "English_Trustworth_Man",
    speechRate: 1.0,
  });
});

test("resolveMiniMaxVoiceConfig strips a trailing slash from baseUrl", () => {
  const cfg = resolveMiniMaxVoiceConfig(cfgEnv({ MINIMAX_BASE_URL: "https://api.minimax.io/v1/" }));
  assert.equal(cfg.baseUrl, "https://api.minimax.io/v1");
});

test("resolveMiniMaxVoiceConfig clamps the speech rate into [0.5, 2]", () => {
  assert.equal(resolveMiniMaxVoiceConfig(cfgEnv({ MINIMAX_TTS_SPEECH_RATE: "5" })).speechRate, 2);
  assert.equal(resolveMiniMaxVoiceConfig(cfgEnv({ MINIMAX_TTS_SPEECH_RATE: "0.1" })).speechRate, 0.5);
  assert.equal(
    resolveMiniMaxVoiceConfig(cfgEnv({ MINIMAX_TTS_SPEECH_RATE: "0" })).speechRate,
    1.0,
    "non-positive values fall back to the default, not the clamp floor",
  );
  assert.equal(
    resolveMiniMaxVoiceConfig(cfgEnv({ MINIMAX_TTS_SPEECH_RATE: "abc" })).speechRate,
    1.0,
    "non-numeric values fall back to the default",
  );
  assert.equal(resolveMiniMaxVoiceConfig(cfgEnv({ MINIMAX_TTS_SPEECH_RATE: "1.25" })).speechRate, 1.25);
});

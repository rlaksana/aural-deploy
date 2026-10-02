import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHeuristicFeedback,
  buildNonSubstantiveFeedback,
  resolvePrepResponseLanguage,
} from "../src/lib/prep/answer-quality";
import { buildVoiceDeliveryMetrics } from "../src/lib/prep/voice-delivery";

test("resolvePrepResponseLanguage keeps Indonesian instead of falling back to en", () => {
  assert.equal(resolvePrepResponseLanguage("id"), "id");
  assert.equal(resolvePrepResponseLanguage("id-ID"), "id");
  assert.equal(resolvePrepResponseLanguage("ID"), "id");
});

test("resolvePrepResponseLanguage keeps zh detection and en default", () => {
  assert.equal(resolvePrepResponseLanguage("zh"), "zh");
  assert.equal(resolvePrepResponseLanguage("en"), "en");
  assert.equal(resolvePrepResponseLanguage(""), "en");
  // CJK answer overrides the interview language.
  assert.equal(resolvePrepResponseLanguage("id", "我叫张伟，我有三年经验"), "zh");
  // Latin text must NOT override an Indonesian interview language.
  assert.equal(resolvePrepResponseLanguage("id", "halo selamat pagi"), "id");
});

test("heuristic feedback renders in Indonesian for id sessions", () => {
  const answer =
    "Selamat pagi, saya senang bisa mengikuti sesi wawancara ini hari ini dan berharap mendapat banyak pengalaman baru.";
  const fb = buildHeuristicFeedback(answer, "id");
  // Either the "too brief" or the "solid start" branch — both must be Indonesian.
  assert.ok(
    fb.verdict === "Jawaban terlalu singkat" || fb.verdict === "Sudah bagus, bisa diasah",
    `unexpected verdict: ${fb.verdict}`,
  );
  assert.equal(fb.score >= 4, true);
  assert.match(fb.summary, /jawabanmu|Struktur|susun/i);
  assert.ok(fb.improvements.every((s) => !/^Add |^Explain |^Include /.test(s)));
});

test("non-substantive feedback renders in Indonesian for id sessions", () => {
  const fb = buildNonSubstantiveFeedback("halo, bisa dengar?", "id");
  assert.equal(fb.verdict, "Tidak menjawab pertanyaan");
  assert.match(fb.summary, /cek koneksi/);
  assert.ok(fb.improvements.length > 0);
});

test("voice delivery tips render in Indonesian for id sessions", async () => {
  // No window in Node → samples fall back to defaults; 2 words in 5s ≈ 24 wpm
  // triggers the slow-pace tip only.
  const metrics = await buildVoiceDeliveryMetrics(
    new Blob([]),
    "halo halo",
    5000,
    "id",
  );
  assert.ok(metrics.tips.length > 0);
  assert.ok(metrics.tips.every((t) => /Tempo|Suara|Nada|jeda|kata pengisi/i.test(t)));
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  segmentAnswerHighlights,
  splitSuggestedAnswerParagraphs,
  stripVerifyBlocks,
  stripVerifyMarkers,
} from "../src/lib/prep/sanitize-hint";
import { parseHintLayers } from "../src/lib/prep/hint-layers";
import {
  PREP_FEEDBACK_TOKEN_COST,
  PREP_SUGGESTED_ANSWER_TOKEN_COST,
  prepInsufficientTokensMessage,
} from "../src/lib/prep/token-costs";
import { parsePrepFeedbackRequest } from "../src/lib/prep/parse-prep-feedback-request";
import { SILENT_MP3_DATA_URL } from "../src/lib/prep/silent-audio";
import {
  countSpeakableUnits,
  estimateSpeakMinutes,
  inferSuggestedAnswerStructure,
  prepSampleAnswerRulesBlock,
  prepScoringRubricBlock,
  structureTagLabel,
} from "../src/lib/prep/answer-rubric";

// ── sanitize-hint ──

test("stripVerifyMarkers removes inline VERIFY markers and cleans up spacing", () => {
  const cleaned = stripVerifyMarkers("Nilai 35% [VERIFY: dari laporan Q3] meningkat.");
  assert.equal(cleaned, "Nilai 35% meningkat.");
  const multiline = stripVerifyMarkers("Baris satu [verify: sumber]\nBaris dua\n\n\n\nBaris tiga");
  assert.ok(!multiline.toLowerCase().includes("verify"));
  assert.ok(!/\n{3,}/.test(multiline), "triple newlines collapse to double");
});

test("stripVerifyBlocks dedupes an exact duplicated paragraph", () => {
  const cleaned = stripVerifyBlocks("Para pembuka utuh.\n\nPara pembuka utuh.\n\nParagraf penutup.");
  assert.equal(cleaned, "Para pembuka utuh.\n\nParagraf penutup.");
});

test("stripVerifyBlocks trims an overlap-suffix duplicate to its continuation", () => {
  const first = "Fokus utama saya adalah reliability sistem pembayaran.";
  const second = "Fokus utama saya adalah reliability sistem pembayaran. Untuk observability, saya menambah tracing.";
  const cleaned = stripVerifyBlocks(`${first}\n\n${second}`);
  assert.ok(cleaned.includes("Untuk observability"), `continuation kept: ${cleaned}`);
  assert.equal(cleaned.split("Fokus utama saya").length - 1, 1, "the duplicated opener appears once");
});

test("stripVerifyBlocks trims a short repeated zh opener via the first-sentence path", () => {
  // The shared prefix (7 CJK chars) is below the 10-char suffix loop threshold,
  // so this exercises the first-sentence opener fallback.
  const cleaned = stripVerifyBlocks(
    "我负责这项工作。后续细节如下。\n\n我负责这项工作，并且交付了完整方案。",
  );
  assert.ok(cleaned.includes("后续细节如下"), `first paragraph kept: ${cleaned}`);
  assert.ok(cleaned.includes("并且交付了完整方案"), `continuation kept: ${cleaned}`);
  assert.equal(cleaned.split("我负责这项工作").length - 1, 1);
});

test("segmentAnswerHighlights highlights numbers and zh claim keywords", () => {
  const segments = segmentAnswerHighlights("Meningkatkan konversi 35% dan 负责整个迁移项目。");
  const highlights = segments.filter((s) => s.highlight).map((s) => s.text);
  assert.ok(highlights.includes("35%"), `percent highlighted: ${JSON.stringify(highlights)}`);
  assert.ok(
    highlights.some((h) => h.startsWith("负责")),
    `zh claim keyword highlighted: ${JSON.stringify(highlights)}`,
  );
  assert.ok(segments.some((s) => !s.highlight && s.text.includes("Meningkatkan")));
});

test("segmentAnswerHighlights keeps unmarked text plain and returns empty for empty input", () => {
  assert.deepEqual(segmentAnswerHighlights("Ceria dan tekun setiap hari."), [
    { text: "Ceria dan tekun setiap hari." },
  ]);
  assert.deepEqual(segmentAnswerHighlights("   "), []);
});

test("splitSuggestedAnswerParagraphs strips markers then splits into clean paragraphs", () => {
  const paragraphs = splitSuggestedAnswerParagraphs(
    "Satu [VERIFY: data internal]\n\nDua\n\n\n\nTiga",
  );
  assert.deepEqual(paragraphs, ["Satu", "Dua", "Tiga"]);
});

// ── hint-layers ──

test("parseHintLayers parses English OUTLINE/ANSWER markers with bullets", () => {
  const layers = parseHintLayers(
    "OUTLINE:\n- Poin satu\n* Poin dua\nANSWER:\nJawaban lengkap di sini.",
  );
  assert.deepEqual(layers.outline, ["Poin satu", "Poin dua"]);
  assert.equal(layers.answer, "Jawaban lengkap di sini.");
});

test("parseHintLayers parses zh markers 大纲/回答 and numbered bullets", () => {
  const layers = parseHintLayers("大纲：\n· 要点一\n1、要点二\n回答：\n完整回答内容。");
  assert.deepEqual(layers.outline, ["要点一", "要点二"]);
  assert.equal(layers.answer, "完整回答内容。");
});

test("parseHintLayers with only an outline yields an empty answer", () => {
  const layers = parseHintLayers("OUTLINE:\n- A\n- B");
  assert.deepEqual(layers.outline, ["A", "B"]);
  assert.equal(layers.answer, "");
});

test("parseHintLayers with only an ANSWER marker yields no outline", () => {
  const layers = parseHintLayers("ANSWER:\nSemua teks ini adalah jawaban.");
  assert.deepEqual(layers.outline, []);
  assert.equal(layers.answer, "Semua teks ini adalah jawaban.");
});

test("parseHintLayers degrades marker-free text to everything-is-the-answer", () => {
  assert.deepEqual(parseHintLayers("Paragraf biasa tanpa marker."), {
    outline: [],
    answer: "Paragraf biasa tanpa marker.",
  });
  assert.deepEqual(parseHintLayers("  \n  "), { outline: [], answer: "" });
});

test("parseHintLayers is case-insensitive on markers", () => {
  const layers = parseHintLayers("outline:\n- a\nfull answer:\nbody");
  assert.deepEqual(layers.outline, ["a"]);
  assert.equal(layers.answer, "body");
});

// ── token-costs ──

test("prep token cost constants stay at 10/5 (hosted-compat drift guard)", () => {
  assert.equal(PREP_FEEDBACK_TOKEN_COST, 10);
  assert.equal(PREP_SUGGESTED_ANSWER_TOKEN_COST, 5);
});

test("prepInsufficientTokensMessage embeds balance and need", () => {
  assert.equal(
    prepInsufficientTokensMessage(3, 10),
    "AI token budget exceeded (3 remaining, 10 needed).",
  );
});

// ── parse-prep-feedback-request ──

function jsonReq(body: unknown): Request {
  return new Request("https://prep.example.test/api/prep/feedback", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function multipartReq(
  metadata: Record<string, unknown> | null,
  audio?: Blob,
): Request {
  const form = new FormData();
  if (metadata !== null) form.append("metadata", JSON.stringify(metadata));
  if (audio) form.append("audio", audio, "answer.webm");
  return new Request("https://prep.example.test/api/prep/feedback", {
    method: "POST",
    body: form,
  });
}

const validMetadata = {
  sessionId: "s1",
  questionId: "q1",
  answerText: "Jawaban kandidat",
  inputMode: "VOICE",
  durationSeconds: 12.5,
};

async function expectError(req: Request, status: number, messagePart: string) {
  const result = await parsePrepFeedbackRequest(req);
  assert.ok("error" in result, `expected an error result for ${messagePart}`);
  assert.equal(result.error.status, status);
  const body = (await result.error.json()) as { error: string };
  assert.ok(body.error.includes(messagePart), `got: ${body.error}`);
}

test("parsePrepFeedbackRequest parses a valid JSON payload", async () => {
  const result = await parsePrepFeedbackRequest(jsonReq(validMetadata));
  assert.ok(!("error" in result));
  assert.equal(result.parseMethod, "json");
  assert.equal(result.sessionId, "s1");
  assert.equal(result.durationSeconds, 12.5);
  assert.equal(result.answerAudio, undefined);
});

test("parsePrepFeedbackRequest rejects JSON without the required fields", async () => {
  await expectError(jsonReq({ ...validMetadata, questionId: undefined }), 400, "sessionId, questionId");
  await expectError(jsonReq({ ...validMetadata, answerText: "   " }), 400, "non-empty answer");
});

test("parsePrepFeedbackRequest rejects oversized JSON bodies with the multipart hint", async () => {
  // Undici does not compute content-length when constructing a local Request,
  // so the oversized length is declared explicitly; the route must refuse
  // before parsing.
  const req = new Request("https://prep.example.test/api/prep/feedback", {
    method: "POST",
    body: "{}",
    headers: {
      "content-type": "application/json",
      "content-length": String(7 * 1024 * 1024),
    },
  });
  await expectError(req, 413, "multipart/form-data");
});

test("parsePrepFeedbackRequest attaches base64 audio only in practice mode", async () => {
  const withAudio = await parsePrepFeedbackRequest(
    jsonReq({ ...validMetadata, practiceMode: true, answerAudioBase64: " aGVsbG8= " }),
  );
  assert.ok(!("error" in withAudio));
  assert.deepEqual(withAudio.answerAudio, { mimeType: "audio/webm", base64: "aGVsbG8=" });

  const withoutPractice = await parsePrepFeedbackRequest(
    jsonReq({ ...validMetadata, answerAudioBase64: "aGVsbG8=" }),
  );
  assert.ok(!("error" in withoutPractice));
  assert.equal(withoutPractice.answerAudio, undefined);
});

test("parsePrepFeedbackRequest rejects oversized base64 audio with 413", async () => {
  // Decoded size = 5.7M * 3/4 ≈ 4.27MB > 4MB, while the JSON body stays under
  // the 6MB JSON ceiling so the audio check is what fires.
  const base64 = "A".repeat(5_700_000);
  await expectError(
    jsonReq({ ...validMetadata, practiceMode: true, answerAudioBase64: base64 }),
    413,
    "Answer audio is too large",
  );
});

test("parsePrepFeedbackRequest parses multipart with audio as base64", async () => {
  const bytes = Buffer.from("fake-webm-bytes");
  const result = await parsePrepFeedbackRequest(
    multipartReq(validMetadata, new Blob([bytes], { type: "audio/webm" })),
  );
  assert.ok(!("error" in result));
  assert.equal(result.parseMethod, "multipart");
  assert.equal(result.answerAudio?.mimeType, "audio/webm", "blob type wins over metadata");
  assert.equal(result.answerAudio?.base64, bytes.toString("base64"));
});

test("parsePrepFeedbackRequest rejects multipart without metadata or with broken metadata", async () => {
  await expectError(multipartReq(null), 400, "metadata field is required");
  await expectError(multipartReq({ sessionId: "s1" }, undefined), 400, "sessionId, questionId");
  const form = new FormData();
  form.append("metadata", "bukan-json{{{");
  const req = new Request("https://prep.example.test/x", { method: "POST", body: form });
  await expectError(req, 400, "Invalid metadata JSON");
});

test("parsePrepFeedbackRequest rejects oversized multipart audio and uses the blob mime", async () => {
  await expectError(
    multipartReq(validMetadata, new Blob([Buffer.alloc(4 * 1024 * 1024 + 1)])),
    413,
    "Answer audio is too large",
  );

  // A Blob appended through FormData never arrives with an empty type — undici
  // fills in "application/octet-stream" — so the blob type (or that default),
  // not the metadata hint, is what the route ends up sending.
  const noType = await parsePrepFeedbackRequest(
    multipartReq(
      { ...validMetadata, answerAudioMimeType: "audio/mp4" },
      new Blob([Buffer.from("bytes")]),
    ),
  );
  assert.ok(!("error" in noType));
  assert.equal(noType.answerAudio?.mimeType, "application/octet-stream");
});

// ── silent-audio ──

test("SILENT_MP3_DATA_URL is a data URL carrying ID3-tagged MPEG audio", () => {
  assert.ok(SILENT_MP3_DATA_URL.startsWith("data:audio/mpeg;base64,"));
  const base64 = SILENT_MP3_DATA_URL.slice("data:audio/mpeg;base64,".length);
  const decoded = Buffer.from(base64, "base64");
  assert.equal(decoded.subarray(0, 3).toString("ascii"), "ID3", "unmute hack needs a real MP3 container");
});

// ── answer-rubric ──

test("prepScoringRubricBlock switches language by zh prefix", () => {
  assert.ok(prepScoringRubricBlock("zh").includes("统一评分标准"));
  assert.ok(prepScoringRubricBlock("zh-CN").includes("统一评分标准"));
  assert.ok(prepScoringRubricBlock("en").includes("Shared scoring criteria"));
  assert.ok(prepScoringRubricBlock("id").includes("Shared scoring criteria"));
});

test("prepSampleAnswerRulesBlock switches language by zh prefix", () => {
  assert.ok(prepSampleAnswerRulesBlock("zh").includes("参考答案要求"));
  assert.ok(prepSampleAnswerRulesBlock("en").includes("Sample answer requirements"));
});

test("inferSuggestedAnswerStructure maps question types to structures", () => {
  assert.equal(inferSuggestedAnswerStructure("SINGLE_CHOICE", ""), "Choice");
  assert.equal(inferSuggestedAnswerStructure("MULTIPLE_CHOICE", ""), "Choice");
  assert.equal(inferSuggestedAnswerStructure("BEHAVIORAL", ""), "STAR");
  assert.equal(inferSuggestedAnswerStructure("TECHNICAL", ""), "PAR");
  assert.equal(inferSuggestedAnswerStructure("SYSTEM_DESIGN", ""), "PAR");
  assert.equal(inferSuggestedAnswerStructure("KNOWLEDGE", ""), "Knowledge");
  assert.equal(inferSuggestedAnswerStructure("ROLEPLAY", ""), "Service");
  assert.equal(inferSuggestedAnswerStructure("INTRO", ""), "Intro");
});

test("inferSuggestedAnswerStructure infers from question text without a type", () => {
  assert.equal(inferSuggestedAnswerStructure(null, "Tell me about a time you failed"), "STAR");
  assert.equal(inferSuggestedAnswerStructure(null, "Bagaimana pendekatan system design untuk pembayaran"), "PAR");
  assert.equal(inferSuggestedAnswerStructure(null, "A customer complains about a refund"), "Service");
  assert.equal(inferSuggestedAnswerStructure(null, "Tell me about yourself"), "Intro");
  assert.equal(inferSuggestedAnswerStructure(null, "Anything else you would like to share?"), "WrapUp");
});

test("inferSuggestedAnswerStructure falls back to STAR for unknown shapes", () => {
  assert.equal(inferSuggestedAnswerStructure(null, "Lorem ipsum dolor sit amet"), "STAR");
  assert.equal(inferSuggestedAnswerStructure("", ""), "STAR");
});

test("structureTagLabel localizes labels for id and en", () => {
  assert.deepEqual(structureTagLabel("STAR", "id"), {
    label: "Cerita STAR",
    hint: "Situasi → tindakan → hasil",
  });
  assert.equal(structureTagLabel("STAR", "en").label, "STAR story");
  assert.equal(structureTagLabel("PAR", "id").label, "Studi kasus");
  assert.equal(structureTagLabel("PAR").label, "Case walkthrough");
});

test("countSpeakableUnits counts latin words plus CJK characters", () => {
  assert.equal(countSpeakableUnits("hello world"), 2);
  assert.equal(countSpeakableUnits("你好世界"), 4);
  assert.equal(countSpeakableUnits("don't stop"), 2, "apostrophe stays inside one word");
  assert.equal(countSpeakableUnits("Saya punya 3 tahun"), 4, "digits count as their own unit");
  assert.equal(countSpeakableUnits("  "), 0);
});

test("estimateSpeakMinutes is monotonic, ceil-based, with a 1-minute floor", () => {
  assert.equal(estimateSpeakMinutes(0), 0);
  assert.equal(estimateSpeakMinutes(-5), 0);
  assert.equal(estimateSpeakMinutes(1), 1);
  assert.equal(estimateSpeakMinutes(120), 1);
  assert.equal(estimateSpeakMinutes(121), 2);
  assert.equal(estimateSpeakMinutes(240), 2);
  assert.equal(estimateSpeakMinutes(241), 3);
});

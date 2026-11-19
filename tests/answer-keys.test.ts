import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnswerKeysMod = typeof import("../src/lib/answer-keys");
type QuestionMod = typeof import("../src/server/routers/question");
type CandidateMod = typeof import("../src/server/routers/candidate");
type CustomTemplateMod = typeof import("../src/server/routers/custom-template");
let answerKeys: AnswerKeysMod;
let questionRouter: QuestionMod["questionRouter"];
let candidateRouter: CandidateMod["candidateRouter"];
let customTemplateRouter: CustomTemplateMod["customTemplateRouter"];

before(async () => {
  answerKeys = await import("../src/lib/answer-keys");
  const mod = await import("../src/server/routers/question");
  questionRouter = mod.questionRouter;
  const cand = await import("../src/server/routers/candidate");
  candidateRouter = cand.candidateRouter;
  const ctMod = await import("../src/server/routers/custom-template");
  customTemplateRouter = ctMod.customTemplateRouter;
});

test("splitChoiceKey separates correctIndices from storable options", () => {
  const { options, correctIndices } = answerKeys.splitChoiceKey({
    options: ["a", "b", "c"],
    allowMultiple: false,
    correctIndices: [1],
  });
  assert.deepEqual(options, { options: ["a", "b", "c"], allowMultiple: false });
  assert.deepEqual(correctIndices, [1]);

  const open = answerKeys.splitChoiceKey({ options: ["x"] });
  assert.deepEqual(open.options, { options: ["x"] });
  assert.equal(open.correctIndices, null);

  const none = answerKeys.splitChoiceKey(null);
  assert.equal(none.options, null);
  assert.equal(none.correctIndices, null);
});

test("withAnswerKeys merges key-table rows onto key-free questions", async () => {
  const db = fakeDb({
    question_answer_keys: [
      { questionId: "q1", expectedAnswer: "kunci A", correctIndices: null },
      { questionId: "q2", expectedAnswer: null, correctIndices: [0, 2] },
      // Explicitly cleared key + stale questions-row copy: the key row is
      // authoritative — the cleared state must win (ship-audit finding).
      { questionId: "q4", expectedAnswer: null, correctIndices: null },
    ],
  });
  const questions = [
    { id: "q1", text: "A", options: { options: ["a", "b"] } as any, expectedAnswer: null as string | null },
    { id: "q2", text: "B", options: { options: ["x", "y", "z"] } as any, expectedAnswer: null as string | null },
    { id: "q3", text: "C", options: null, expectedAnswer: null as string | null },
    {
      id: "q4",
      text: "D",
      options: { options: ["p", "q"], correctIndices: [0] } as any,
      expectedAnswer: "kunci lama" as string | null,
    },
  ];
  const merged = await answerKeys.withAnswerKeys(questions, db.client);
  assert.equal(merged[0].expectedAnswer, "kunci A");
  assert.deepEqual(merged[1].options?.correctIndices, [0, 2]);
  // Open-ended question has no key row — untouched.
  assert.equal(merged[2].expectedAnswer, null);
  assert.equal(merged[2].options, null);
  // Key row explicitly null → the stale questions-row copy is NOT resurrected.
  assert.equal(merged[3].expectedAnswer, null);
  assert.equal((merged[3].options as any).correctIndices, undefined);
  // Input array objects are not mutated.
  assert.equal((questions[1].options as any).correctIndices, undefined);
  assert.equal(questions[3].expectedAnswer, "kunci lama");
});

test("upsertAnswerKeys writes explicit nulls on create and omits undefined fields on partial update", async () => {
  const db = fakeDb({ question_answer_keys: [] });
  await answerKeys.upsertAnswerKeys(
    [{ questionId: "q1", expectedAnswer: "kunci", correctIndices: [1] }],
    db.client,
  );
  await answerKeys.upsertAnswerKeys(
    [
      // Create semantics: everything explicit — blank key clears the column.
      { questionId: "q2", expectedAnswer: null, correctIndices: null },
      // Partial-update semantics: only correctIndices was sent.
      { questionId: "q3", correctIndices: [0] },
    ],
    db.client,
  );

  const keyWrites = db.writes.filter(
    (w) => w.op === "insert" && w.table === "question_answer_keys",
  );
  // fakeDb records one write per upsert call with the row array as payload.
  const payloads = keyWrites.flatMap(
    (w) => w.payload as Record<string, unknown>[],
  );
  assert.equal(payloads.length, 3, "one upsert payload per row");

  assert.equal(payloads[0].questionId, "q1");
  assert.equal(payloads[0].expectedAnswer, "kunci");
  assert.deepEqual(payloads[0].correctIndices, [1]);

  assert.equal(payloads[1].expectedAnswer, null, "explicit null clears");
  assert.equal(payloads[1].correctIndices, null);

  assert.equal(payloads[2].questionId, "q3");
  assert.deepEqual(payloads[2].correctIndices, [0]);
  assert.equal(
    "expectedAnswer" in payloads[2],
    false,
    "omitted field must not reach PostgREST (supabase-js drops undefined)",
  );
  for (const p of payloads) {
    assert.ok(typeof p.updatedAt === "string");
  }
});

const INTERVIEW = { id: "i1", projectId: "p1", project: { organizationId: "org1" } };
const ORG_ROW = { workspaceId: "org1", userId: "u-owner", role: "OWNER" };

function questionCaller(tables: Record<string, any[]>) {
  const db = fakeDb(tables);
  const call = questionRouter.createCaller({
    user: { id: "u-owner" } as any,
    supabase: db.client,
  });
  return { db, call };
}

// fakeDb returns insert payloads verbatim (no generated ids), so question.id
// and the matching key-row questionId are both undefined — alignment still
// proves the router writes and reads the same id end-to-end.
test("question.create stores keys only in question_answer_keys and rehydrates the response", async () => {
  const { db, call } = questionCaller({
    interviews: [INTERVIEW],
    organization_members: [ORG_ROW],
    project_members: [],
    questions: [],
    question_answer_keys: [],
  });

  const created = (await call.create({
    interviewId: "i1",
    text: "Pilih ibu kota",
    type: "SINGLE_CHOICE",
    options: { options: ["Jakarta", "Bandung"], correctIndices: [0] },
  })) as any;

  // Question row: key-free.
  const qRows = db.tables.questions;
  assert.equal(qRows.length, 1);
  assert.equal("expectedAnswer" in qRows[0], false);
  assert.equal((qRows[0].options as any).correctIndices, undefined);
  assert.deepEqual((qRows[0].options as any).options, ["Jakarta", "Bandung"]);

  // Key row: carries the key (fakeDb upsert payload is a row array).
  const keyPayload = (
    db.writes.find((w) => w.op === "insert" && w.table === "question_answer_keys")!
      .payload as Record<string, unknown>[]
  )[0];
  assert.deepEqual(keyPayload.correctIndices, [0]);

  // Response: rehydrated for the editor.
  assert.deepEqual(created.options.correctIndices, [0]);
});

test("question.create stores an open-ended expectedAnswer in the key table, not the question row", async () => {
  const { db, call } = questionCaller({
    interviews: [INTERVIEW],
    organization_members: [ORG_ROW],
    project_members: [],
    questions: [],
    question_answer_keys: [],
  });

  const created = (await call.create({
    interviewId: "i1",
    text: "Jelaskan closure",
    type: "OPEN_ENDED",
    expectedAnswer: "closure = fungsi yang mengakses scope luar",
  })) as any;

  assert.equal("expectedAnswer" in db.tables.questions[0], false);
  const keyPayload = (
    db.writes.find((w) => w.op === "insert" && w.table === "question_answer_keys")!
      .payload as Record<string, unknown>[]
  )[0];
  assert.equal(keyPayload.expectedAnswer, "closure = fungsi yang mengakses scope luar");
  assert.equal(created.expectedAnswer, "closure = fungsi yang mengakses scope luar");
});

test("upsertAnswerKeys surfaces a write failure instead of dropping the key silently", async () => {
  const db = fakeDb(
    { question_answer_keys: [] },
    { insertErrors: { question_answer_keys: "db unavailable" } },
  );
  // The questions row is already key-free at this point: swallowing the error
  // would lose the rubric permanently (ship-audit finding).
  await assert.rejects(
    answerKeys.upsertAnswerKeys([{ questionId: "q1", expectedAnswer: "kunci" }], db.client),
    /Answer key write failed: db unavailable/,
  );
});

test("candidate.getByToken returns a key-free interview payload (invite surface)", async () => {
  const db = fakeDb({
    candidates: [
      {
        id: "c1",
        inviteToken: "tok",
        interview: {
          id: "i1",
          title: "T",
          questions: [
            {
              id: "q1",
              text: "Pilih",
              type: "SINGLE_CHOICE",
              expectedAnswer: "kunci pilihan",
              options: { options: ["a", "b"], correctIndices: [1] },
            },
            { id: "q2", text: "Terbuka", type: "OPEN_ENDED", expectedAnswer: "rubrik", options: null },
          ],
        },
      },
    ],
  });
  const call = candidateRouter.createCaller({
    user: null as any,
    supabase: db.client,
  });
  const out = (await call.getByToken({ token: "tok" })) as any;
  const questions = out.interview.questions;
  assert.equal("expectedAnswer" in questions[0], false);
  assert.equal((questions[0].options as any).correctIndices, undefined);
  assert.deepEqual((questions[0].options as any).options, ["a", "b"]);
  assert.equal("expectedAnswer" in questions[1], false);
});

test("custom-template.createFromInterview snapshots the rubric into the template config", async () => {
  const db = fakeDb({
    interviews: [
      {
        id: "i1",
        projectId: "p1",
        project: { organizationId: "org1" },
        title: "T",
        description: null,
        objective: null,
        aiTone: "PROFESSIONAL",
        followUpDepth: "MODERATE",
        assessmentCriteria: null,
        chatEnabled: true,
        voiceEnabled: false,
        videoEnabled: false,
        timeLimitMinutes: null,
        language: "id",
        questions: [
          { id: "q1", text: "Terbuka", type: "OPEN_ENDED", order: 0, expectedAnswer: null, options: null },
        ],
      },
    ],
    organization_members: [{ workspaceId: "org1", userId: "u-owner", role: "OWNER" }],
    project_members: [],
    projects: [{ id: "p1", organizationId: "org1" }],
    question_answer_keys: [{ questionId: "q1", expectedAnswer: "rubric terbuka", correctIndices: null }],
    custom_templates: [],
  });
  const call = customTemplateRouter.createCaller({
    user: { id: "u-owner" } as any,
    supabase: db.client,
  });
  await call.createFromInterview({ interviewId: "i1" });
  const insert = db.writes.find((w) => w.op === "insert" && w.table === "custom_templates");
  assert.ok(insert, "template snapshot written");
  // fakeDb normalizes single-row payloads into arrays.
  const inserted = Array.isArray(insert!.payload) ? (insert!.payload as any[])[0] : insert!.payload;
  const config = inserted.config;
  // Post-migration the questions row is key-free — the snapshot must still
  // carry the rubric or templates would mint rubric-less interviews.
  assert.equal(config.questions[0].expectedAnswer, "rubric terbuka");
});

test("question.update persists only the key fields the caller sent", async () => {
  const { db, call } = questionCaller({
    interviews: [INTERVIEW],
    organization_members: [ORG_ROW],
    project_members: [],
    questions: [
      {
        id: "q1",
        interviewId: "i1",
        type: "SINGLE_CHOICE",
        text: "Q",
        options: { options: ["a", "b"] },
      },
    ],
    question_answer_keys: [],
  });

  const updated = (await call.update({
    id: "q1",
    options: { options: ["a", "b"], correctIndices: [1] },
  })) as any;

  // Question row: options updated without correctIndices, text untouched.
  const qRow = db.tables.questions.find((r) => r.text === "Q");
  assert.ok(qRow);
  assert.equal((qRow!.options as any).correctIndices, undefined);

  // Key payload: correctIndices written, expectedAnswer absent (untouched).
  const keyPayload = (
    db.writes.find((w) => w.op === "insert" && w.table === "question_answer_keys")!
      .payload as Record<string, unknown>[]
  )[0];
  assert.deepEqual(keyPayload.correctIndices, [1]);
  assert.equal("expectedAnswer" in keyPayload, false);

  // Response rehydrates the fresh key.
  assert.deepEqual(updated.options.correctIndices, [1]);
});

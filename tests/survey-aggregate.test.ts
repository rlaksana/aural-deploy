import assert from "node:assert";
import { describe, it } from "node:test";
import { buildSurveyAggregate, type ReportEntry } from "../src/lib/interview-report";
import type { AggregateQuestion } from "../src/lib/interview-report";

function makeEntry(
  messages: { role: string; content: string; questionId: string | null }[],
  insights: unknown = null,
  name: string | null = null,
): ReportEntry {
  return {
    name,
    email: null,
    source: "Walk-in",
    session: {
      id: `s-${Math.random().toString(36).slice(2)}`,
      status: "COMPLETED",
      insights,
      messages,
      participantName: name,
    },
  };
}

const CHOICE_Q: AggregateQuestion = {
  id: "q1",
  text: "Favorite color?",
  type: "SINGLE_CHOICE",
  options: { options: ["Red", "Green", "Blue"] },
};

describe("buildSurveyAggregate", () => {
  it("tallies choice answers from the selection protocol", () => {
    const entries = [
      makeEntry([{ role: "USER", content: "Selected option B", questionId: "q1" }]),
      makeEntry([{ role: "USER", content: "Selected option B", questionId: "q1" }]),
      makeEntry([{ role: "USER", content: "Selected option A", questionId: "q1" }]),
    ];
    const agg = buildSurveyAggregate(entries, [CHOICE_Q]);
    assert.equal(agg.respondentCount, 3);
    assert.deepEqual(agg.questions[0].tally, [
      { option: "Red", count: 1 },
      { option: "Green", count: 2 },
      { option: "Blue", count: 0 },
    ]);
  });

  it("computes a numeric average when all option labels are numbers", () => {
    const ratingQ: AggregateQuestion = {
      id: "q2",
      text: "Rate us",
      type: "SINGLE_CHOICE",
      options: { options: ["1", "2", "3", "4", "5"] },
    };
    const entries = [
      makeEntry([{ role: "USER", content: "Selected option A", questionId: "q2" }]),
      makeEntry([{ role: "USER", content: "Selected option E", questionId: "q2" }]),
    ];
    const agg = buildSurveyAggregate(entries, [ratingQ]);
    assert.equal(agg.questions[0].average, 3);
  });

  it("skips the average when option labels are not numeric", () => {
    const entries = [
      makeEntry([{ role: "USER", content: "Selected option A", questionId: "q1" }]),
    ];
    const agg = buildSurveyAggregate(entries, [CHOICE_Q]);
    assert.equal(agg.questions[0].average, undefined);
  });

  it("handles the Indonesian protocol and multiple selections", () => {
    const multiQ: AggregateQuestion = {
      id: "q3",
      text: "Pick toppings",
      type: "MULTIPLE_CHOICE",
      options: { options: ["Cheese", "Mushroom", "Onion"] },
    };
    const entries = [
      makeEntry([{ role: "USER", content: "Memilih opsi: A, C", questionId: "q3" }]),
    ];
    const agg = buildSurveyAggregate(entries, [multiQ]);
    assert.deepEqual(agg.questions[0].tally, [
      { option: "Cheese", count: 1 },
      { option: "Mushroom", count: 0 },
      { option: "Onion", count: 1 },
    ]);
  });

  it("lists open answers with respondent names", () => {
    const textQ: AggregateQuestion = {
      id: "q4",
      text: "Any feedback?",
      type: "SHORT_TEXT",
    };
    const entries = [
      makeEntry([{ role: "USER", content: "Great!", questionId: "q4" }], null, "Budi"),
      makeEntry([{ role: "USER", content: "OK", questionId: "q4" }]),
    ];
    const agg = buildSurveyAggregate(entries, [textQ]);
    assert.deepEqual(agg.questions[0].textAnswers, [
      { name: "Budi", content: "Great!" },
      { name: null, content: "OK" },
    ]);
  });

  it("computes quiz correct rates from insights evaluations", () => {
    const quizQ: AggregateQuestion = {
      id: "q5",
      text: "2+2?",
      type: "SINGLE_CHOICE",
      options: { options: ["3", "4"], correctIndices: [1] },
    };
    const evals = (correct: boolean) => ({
      questionEvaluations: [{ question: "2+2?", score: correct ? 10 : 0, correct }],
    });
    const entries = [
      makeEntry([{ role: "USER", content: "Selected option B", questionId: "q5" }], evals(true)),
      makeEntry([{ role: "USER", content: "Selected option A", questionId: "q5" }], evals(false)),
    ];
    const agg = buildSurveyAggregate(entries, [quizQ]);
    assert.deepEqual(agg.questions[0].correctRate, { correct: 1, total: 2 });
  });

  it("counts every session as a respondent even without answers", () => {
    const agg = buildSurveyAggregate([makeEntry([]), makeEntry([])], [CHOICE_Q]);
    assert.equal(agg.respondentCount, 2);
    assert.deepEqual(agg.questions[0].tally?.map((t) => t.count), [0, 0, 0]);
  });

  it("ignores ASSISTANT messages and non-choice types", () => {
    const entries = [
      makeEntry([
        { role: "ASSISTANT", content: "Selected option B", questionId: "q1" },
        { role: "USER", content: "Selected option B", questionId: null },
      ]),
    ];
    const agg = buildSurveyAggregate(entries, [CHOICE_Q]);
    assert.deepEqual(agg.questions[0].tally?.map((t) => t.count), [0, 0, 0]);
    assert.equal(agg.questions[0].textAnswers, undefined);
  });
});

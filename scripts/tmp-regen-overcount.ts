/**
 * One-off: force-regenerate the 4 overstated sessions in interview
 * e95c0ef2 whose stored questionEvaluations included follow-up probes
 * as extra questions. Clears summary + stored evaluations, then reruns
 * the production generation path (canonical prompt + guards).
 */
import { generateSessionSummary } from "../src/lib/ai/session-summary";
import { supabaseAdmin } from "../src/lib/supabase/admin";

const SESSIONS = [
  "1d46ba24-2e67-43c0-8668-eb7de3c8439f", // Marlisa Gunawan
  "c0e56ef1-84cf-4f39-bf37-98b32d003fe8", // Abyan Luthfi
  "95b02809-34e5-4326-8621-57ca70ab5585", // Muhammad Daffa Fathoni Siregar
];

async function main() {
  for (const id of SESSIONS) {
    const { data: before } = await supabaseAdmin
      .from("sessions")
      .select("insights")
      .eq("id", id)
      .single();
    const insights = {
      ...(((before?.insights as Record<string, unknown>) ?? {}) as Record<string, unknown>),
    };
    delete insights.questionEvaluations;
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({ summary: null, insights })
      .eq("id", id);
    if (error) {
      console.log(`${id}: clear FAILED ${error.message}`);
      continue;
    }

    await generateSessionSummary(id);

    const { data: after } = await supabaseAdmin
      .from("sessions")
      .select("insights, summary")
      .eq("id", id)
      .single();
    const evals = (
      (after?.insights as { questionEvaluations?: unknown[] } | null)
        ?.questionEvaluations ?? []
    ) as { question?: string }[];
    const followUps = evals.filter((e) =>
      /follow[- ]?up/i.test(String(e?.question ?? "")),
    );
    console.log(
      `${id}: evals=${evals.length} followUps=${followUps.length} summary=${after?.summary ? "ok" : "MISSING"}`,
    );
  }
  console.log("all done");
}

main();

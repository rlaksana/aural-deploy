import { createLogger } from "@/lib/logger";
import { runDueAiJobs } from "@/lib/ai/ai-jobs";

const log = createLogger("api/cron/ai-jobs");

// Hobby plan caps serverless functions at 60s. Production drains this queue
// through the long-running VPS deployment (pinged by the GitHub Actions
// ai-jobs-cron workflow), where this cap does not apply; on Vercel the runner
// is simply budget-limited (see runDueAiJobs) and unfinished jobs requeue.
export const maxDuration = 60;

/**
 * Authed queue-drain endpoint (Authorization: Bearer CRON_SECRET; GET for
 * manual checks, POST for the GitHub Actions cron). Drains ai_jobs while the
 * 17:00–07:00 WIB window is open.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await runDueAiJobs();
    return Response.json({ ok: true, ...stats });
  } catch (error) {
    log.error("AI job runner error:", error);
    return Response.json({ error: "AI job runner failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

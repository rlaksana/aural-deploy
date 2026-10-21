import { createLogger } from "@/lib/logger";
import { runDueAiJobs } from "@/lib/ai/ai-jobs";

const log = createLogger("api/cron/ai-jobs");

// In-window generations take minutes; the runner is additionally budgeted to
// 240s internally (see runDueAiJobs).
export const maxDuration = 300;

/**
 * Vercel cron entry (GET, Authorization: Bearer CRON_SECRET) + manual trigger
 * (POST). Drains the ai_jobs queue while the 17:00–07:00 WIB window is open.
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

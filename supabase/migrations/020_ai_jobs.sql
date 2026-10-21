-- Deferred batch AI jobs for the 17:00–07:00 WIB operating window.
-- Only server code (service_role) touches this table; RLS blocks clients.
CREATE TABLE ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL CHECK ("kind" IN ('GENERATE_INTERVIEW','REFINE','PARSE_QUESTIONS','SUMMARY','ANALYSIS')),
  "status" text NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','RUNNING','DONE','FAILED')),
  "userId" uuid,
  "dedupeKey" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "result" jsonb,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- One pending job per (kind, entity) — repeated out-of-window clicks coalesce.
CREATE UNIQUE INDEX ai_jobs_active_dedupe_key
  ON ai_jobs ("kind", "dedupeKey")
  WHERE "status" IN ('QUEUED', 'RUNNING');
CREATE INDEX ai_jobs_claim_idx ON ai_jobs ("status", "createdAt");

ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

-- Atomically claim due jobs (safe under concurrent cron invocations). A stale
-- RUNNING lock from a crashed invocation becomes claimable again after
-- p_lock_minutes — that is the crash-recovery path.
CREATE OR REPLACE FUNCTION claim_ai_jobs(p_limit int, p_lock_minutes int)
RETURNS SETOF ai_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE ai_jobs SET
    "status" = 'RUNNING',
    "lockedUntil" = now() + make_interval(mins => p_lock_minutes),
    "attempts" = "attempts" + 1,
    "updatedAt" = now()
  WHERE id IN (
    SELECT id FROM ai_jobs
    WHERE "status" = 'QUEUED'
       OR ("status" = 'RUNNING' AND "lockedUntil" < now())
    ORDER BY "createdAt"
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION claim_ai_jobs(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_ai_jobs(int, int) TO service_role;

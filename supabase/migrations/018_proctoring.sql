-- Proctoring: recruiter opt-in flag + atomic anti-cheating log append.
-- The previous write path was read-modify-write on sessions."antiCheatingLog",
-- which loses violations when the candidate client races itself (tab switch
-- during a copy event). Only server code appends (revoke from clients).

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "proctoringEnabled" boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION append_anti_cheating_log(
  p_session_id uuid,
  p_entry      jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sessions
  SET "antiCheatingLog" = COALESCE("antiCheatingLog", '[]'::jsonb) || p_entry
  WHERE id = p_session_id;
$$;

REVOKE ALL ON FUNCTION append_anti_cheating_log(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION append_anti_cheating_log(uuid, jsonb) TO service_role;

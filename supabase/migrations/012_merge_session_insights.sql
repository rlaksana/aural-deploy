-- Merge insights JSON without clobbering concurrent writes: summary
-- generation runs on a different serverless instance than quiz grading, so a
-- whole-object overwrite could silently drop freshly written
-- "questionEvaluations". Only service code calls this (revoke from clients).
CREATE OR REPLACE FUNCTION merge_session_insights(
  p_session_id uuid,
  p_insights   jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sessions
  SET insights = COALESCE(insights, '{}'::jsonb) || p_insights
  WHERE id = p_session_id;
$$;

REVOKE ALL ON FUNCTION merge_session_insights(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_session_insights(uuid, jsonb) TO service_role;

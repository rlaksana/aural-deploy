-- Session-scoped capability token. Interviewees are anonymous, so possession
-- of the session id alone must not authorize session writes — the session
-- create RPCs now also hand out this token and the mutation endpoints check
-- it. Legacy rows are backfilled, but clients that pre-date the token keep
-- working because the guard only rejects when the stored token is present
-- (see src/server/routers/session.ts).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "accessToken" text;

UPDATE sessions SET "accessToken" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') WHERE "accessToken" IS NULL;

CREATE OR REPLACE FUNCTION create_interview_session(
  p_interview_id       uuid,
  p_participant_name   text DEFAULT NULL,
  p_participant_email  text DEFAULT NULL,
  p_mode_used          "InterviewMode" DEFAULT 'CHAT',
  p_current_question_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session sessions;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM interviews
    WHERE id = p_interview_id
      AND "publicSlug" IS NOT NULL
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Interview not found or inactive';
  END IF;

  INSERT INTO sessions ("interviewId", "participantName", "participantEmail", "modeUsed", "currentQuestionId", "accessToken")
  VALUES (p_interview_id, p_participant_name, p_participant_email, p_mode_used, p_current_question_id, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  RETURNING * INTO v_session;

  RETURN row_to_json(v_session);
END;
$$;

CREATE OR REPLACE FUNCTION create_invite_session(
  p_invite_token        text,
  p_mode_used           "InterviewMode" DEFAULT 'CHAT',
  p_current_question_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate candidates;
  v_interview interviews;
  v_session   sessions;
BEGIN
  SELECT * INTO v_candidate FROM candidates WHERE "inviteToken" = p_invite_token;
  IF v_candidate IS NULL THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  IF v_candidate."sessionId" IS NOT NULL THEN
    SELECT * INTO v_session FROM sessions WHERE id = v_candidate."sessionId";
    RETURN row_to_json(v_session);
  END IF;

  SELECT * INTO v_interview FROM interviews WHERE id = v_candidate."interviewId";
  IF v_interview IS NULL THEN
    RAISE EXCEPTION 'Interview not found';
  END IF;

  INSERT INTO sessions ("interviewId", "participantName", "participantEmail", "modeUsed", "currentQuestionId", "accessToken")
  VALUES (v_interview.id, v_candidate.name, v_candidate.email, coalesce(p_mode_used, v_interview.mode), p_current_question_id, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  RETURNING * INTO v_session;

  UPDATE candidates SET "sessionId" = v_session.id, "updatedAt" = now() WHERE id = v_candidate.id;

  RETURN row_to_json(v_session);
END;
$$;

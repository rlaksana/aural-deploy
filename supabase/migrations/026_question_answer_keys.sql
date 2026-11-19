-- ============================================================
-- 026_question_answer_keys.sql
--
-- Move answer keys (expectedAnswer + options.correctIndices) into a
-- dedicated table. RLS is enabled with NO policies: anon/authenticated
-- callers are denied by default, so the key is unreadable over direct
-- REST regardless of the interviews public branch. The app reads and
-- writes keys with the service-role key only (src/lib/answer-keys.ts).
--
-- Transition safety: create_interview_with_questions is rewritten to
-- ALSO copy each key into the new table while keeping the existing
-- questions-row copies, so the previously deployed code keeps grading
-- freshly created interviews until it is replaced. A follow-up
-- migration strips the questions-row copies.
--
-- PRECONDITION FOR THE FOLLOW-UP MIGRATION (027): the code that reads
-- keys from question_answer_keys must be deployed and verified first,
-- and 027 must re-run the copy step below BEFORE stripping rows —
-- questions created/edited by the still-deployed old code during this
-- window carry their keys ONLY on the questions row.
-- ============================================================

CREATE TABLE IF NOT EXISTS question_answer_keys (
  "questionId" uuid PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  "expectedAnswer" text,
  "correctIndices" jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE question_answer_keys ENABLE ROW LEVEL SECURITY;

-- No policies follow on purpose: deny-by-default is the point.

-- Copy existing keys (rows only; the questions-row copies are stripped by
-- the follow-up migration after the new code is deployed).
INSERT INTO question_answer_keys ("questionId", "expectedAnswer", "correctIndices")
SELECT q.id,
       NULLIF(btrim(q."expectedAnswer"), ''),
       CASE WHEN q.options ? 'correctIndices' THEN q.options->'correctIndices' END
FROM questions q
WHERE (q."expectedAnswer" IS NOT NULL AND btrim(q."expectedAnswer") <> '')
   OR (q.options ? 'correctIndices')
ON CONFLICT ("questionId") DO UPDATE
SET "expectedAnswer" = EXCLUDED."expectedAnswer",
    "correctIndices" = EXCLUDED."correctIndices",
    "updatedAt" = now();

CREATE OR REPLACE FUNCTION public.create_interview_with_questions(
  p_interview jsonb,
  p_questions jsonb
)
RETURNS TABLE (
  interview jsonb,
  questions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interview_id uuid;
  v_question jsonb;
  v_questions jsonb;
  v_i int := 0;
  v_qid uuid;
BEGIN
  -- Insert the interview and capture the generated id.
  INSERT INTO interviews (
    title,
    description,
    objective,
    "assessmentCriteria",
    "userId",
    "projectId",
    "aiPersona",
    "aiName",
    "aiTone",
    "followUpDepth",
    language,
    "timeLimitMinutes",
    "customBranding",
    "requireInvite",
    "invitedEmails",
    "chatEnabled",
    "voiceEnabled",
    "videoEnabled",
    "antiCheatingEnabled"
  )
  VALUES (
    p_interview->>'title',
    p_interview->>'description',
    p_interview->>'objective',
    CASE WHEN p_interview ? 'assessmentCriteria' THEN (p_interview->'assessmentCriteria')::jsonb ELSE NULL END,
    (p_interview->>'userId')::uuid,
    CASE WHEN p_interview ? 'projectId' AND p_interview->>'projectId' IS NOT NULL
         THEN (p_interview->>'projectId')::uuid ELSE NULL END,
    p_interview->>'aiPersona',
    COALESCE(p_interview->>'aiName', 'Aural'),
    COALESCE(p_interview->>'aiTone', 'PROFESSIONAL')::"ToneLevel",
    COALESCE(p_interview->>'followUpDepth', 'MODERATE')::"FollowUpDepth",
    COALESCE(p_interview->>'language', 'en'),
    CASE WHEN p_interview ? 'timeLimitMinutes' AND p_interview->>'timeLimitMinutes' IS NOT NULL
         THEN (p_interview->>'timeLimitMinutes')::int ELSE NULL END,
    CASE WHEN p_interview ? 'customBranding' THEN (p_interview->'customBranding')::jsonb ELSE NULL END,
    COALESCE((p_interview->>'requireInvite')::boolean, false),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_interview->'invitedEmails')),
      '{}'::text[]
    ),
    COALESCE((p_interview->>'chatEnabled')::boolean, true),
    COALESCE((p_interview->>'voiceEnabled')::boolean, false),
    COALESCE((p_interview->>'videoEnabled')::boolean, false),
    COALESCE((p_interview->>'antiCheatingEnabled')::boolean, false)
  )
  RETURNING id INTO v_interview_id;

  -- Insert each question and mirror its answer key into the private
  -- table. The function runs inside a single transaction; any insert
  -- failure rolls back the interview insert as well.
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    INSERT INTO questions (
      "interviewId",
      "order",
      text,
      description,
      type,
      options,
      "starterCode",
      "expectedAnswer",
      "timeLimitSeconds",
      "isRequired"
    )
    VALUES (
      v_interview_id,
      COALESCE((v_question->>'order')::int, v_i),
      v_question->>'text',
      v_question->>'description',
      COALESCE(v_question->>'type', 'OPEN_ENDED')::"QuestionType",
      CASE WHEN v_question ? 'options' THEN (v_question->'options')::jsonb ELSE NULL END,
      CASE WHEN v_question ? 'starterCode' THEN (v_question->'starterCode')::jsonb ELSE NULL END,
      v_question->>'expectedAnswer',
      CASE WHEN v_question ? 'timeLimitSeconds' AND v_question->>'timeLimitSeconds' IS NOT NULL
           THEN (v_question->>'timeLimitSeconds')::int ELSE NULL END,
      COALESCE((v_question->>'isRequired')::boolean, true)
    )
    RETURNING id INTO v_qid;

    INSERT INTO question_answer_keys ("questionId", "expectedAnswer", "correctIndices")
    VALUES (
      v_qid,
      NULLIF(v_question->>'expectedAnswer', ''),
      CASE WHEN v_question->'options' ? 'correctIndices'
           THEN v_question->'options'->'correctIndices' END
    )
    ON CONFLICT ("questionId") DO UPDATE
    SET "expectedAnswer" = EXCLUDED."expectedAnswer",
        "correctIndices" = EXCLUDED."correctIndices",
        "updatedAt" = now();

    v_i := v_i + 1;
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(q.*) ORDER BY q."order"), '[]'::jsonb)
    INTO v_questions
    FROM questions q WHERE q."interviewId" = v_interview_id;

  RETURN QUERY
  SELECT to_jsonb(i.*), v_questions
    FROM interviews i WHERE i.id = v_interview_id;
END;
$$;

-- Allow authenticated callers to invoke the RPC.
GRANT EXECUTE ON FUNCTION public.create_interview_with_questions(jsonb, jsonb) TO authenticated;

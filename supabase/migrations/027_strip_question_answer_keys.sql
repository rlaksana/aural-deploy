-- ============================================================
-- 027_strip_question_answer_keys.sql
--
-- CONTRACT MIGRATION — requires the key-table code (e53eac6) deployed
-- and verified BEFORE it runs; npx supabase db push applies every local
-- migration at once, so this file was only added after that deploy went
-- READY.
--
-- The deployed code now reads keys exclusively from
-- question_answer_keys (src/lib/answer-keys.ts), so the copies on
-- questions rows can be erased and the column dropped.
-- create_interview_with_questions is rewritten to the private-table
-- form: no expectedAnswer column write, options stored without
-- correctIndices, keys go only to the key table.
--
-- RACE GUARD (run FIRST): interviews/questions written by the still-
-- deployed old code during the dual-write window carry their keys ONLY
-- on the questions row. Re-copy those into the key table before
-- stripping, or they are lost permanently.
--
-- ROLLBACK NOTE: after the column DROP, reverting the code alone is not
-- enough — restoring requires re-adding the column, not a plain revert.
-- ============================================================

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

-- Erase legacy copies (columns still exist until the DROP below).
UPDATE questions
SET options = options - 'correctIndices'
WHERE options ? 'correctIndices';

UPDATE questions
SET "expectedAnswer" = NULL
WHERE "expectedAnswer" IS NOT NULL;

-- RPC v2: private-table-only (body identical to 024/026 minus the
-- expectedAnswer column and minus correctIndices inside options).
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
      "timeLimitSeconds",
      "isRequired"
    )
    VALUES (
      v_interview_id,
      COALESCE((v_question->>'order')::int, v_i),
      v_question->>'text',
      v_question->>'description',
      COALESCE(v_question->>'type', 'OPEN_ENDED')::"QuestionType",
      CASE WHEN v_question ? 'options'
           THEN (v_question->'options')::jsonb - 'correctIndices'
           ELSE NULL END,
      CASE WHEN v_question ? 'starterCode' THEN (v_question->'starterCode')::jsonb ELSE NULL END,
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

GRANT EXECUTE ON FUNCTION public.create_interview_with_questions(jsonb, jsonb) TO authenticated;

ALTER TABLE questions DROP COLUMN IF EXISTS "expectedAnswer";

-- ============================================================
-- 006_create_interview_with_questions.sql
--
-- Adds an atomic RPC that creates an interview row plus its
-- questions in a single transaction. The Next.js caller previously
-- ran these as two separate mutations, which could leave a
-- parent interview behind if any question insert failed.
-- ============================================================

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

  -- Insert each question. The function runs inside a single transaction;
  -- any insert failure rolls back the interview insert as well.
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
      CASE WHEN v_question ? 'options' THEN (v_question->'options')::jsonb ELSE NULL END,
      CASE WHEN v_question ? 'starterCode' THEN (v_question->'starterCode')::jsonb ELSE NULL END,
      CASE WHEN v_question ? 'timeLimitSeconds' AND v_question->>'timeLimitSeconds' IS NOT NULL
           THEN (v_question->>'timeLimitSeconds')::int ELSE NULL END,
      COALESCE((v_question->>'isRequired')::boolean, true)
    );
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
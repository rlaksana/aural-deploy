-- ============================================================
-- 022_session_candidate_analysis.sql
--
-- Per-candidate deep analysis inputs/outputs on the session:
-- extracted resume text (no file storage — matches the
-- interviews."resumeText" precedent) and the cached 3-section
-- AI analysis. Attached to the session so walk-in sessions
-- (which have no candidates row) work too.
-- ============================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "resumeText" text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "resumeFileName" text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "candidateAnalysis" jsonb;

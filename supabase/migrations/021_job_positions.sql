-- ============================================================
-- 021_job_positions.sql
--
-- Job Position layer: a position owns a job description and a
-- resume bank (position_candidates). Interviews can belong to a
-- position (interviews."jobPositionId", NULL = standalone).
-- position_candidate_interviews is the N:M junction between bank
-- candidates and interviews — one row per invite; candidateId
-- points at the minted interviews.candidates row and CASCADEs so
-- a deleted candidate leaves the junction clean for re-invite.
-- RLS is an owner-only floor; the app enforces org/project access
-- in tRPC (ctx.supabase is service-role, mirrors interviews).
-- ============================================================

CREATE TABLE job_positions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  "jobDescription" text,
  "userId"         uuid NOT NULL REFERENCES auth.users(id),
  "projectId"      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON job_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE position_candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobPositionId"  uuid NOT NULL REFERENCES job_positions(id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text,
  "resumeText"     text,
  "resumeFileName" text,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON position_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- One bank entry per email per position (the app coerces '' to NULL).
CREATE UNIQUE INDEX position_candidates_email_unique
  ON position_candidates ("jobPositionId", lower(email))
  WHERE email IS NOT NULL;


CREATE TABLE position_candidate_interviews (
  "positionCandidateId" uuid NOT NULL REFERENCES position_candidates(id) ON DELETE CASCADE,
  "interviewId"         uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  "candidateId"         uuid REFERENCES candidates(id) ON DELETE CASCADE,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("positionCandidateId", "interviewId")
);


ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "jobPositionId"
  uuid REFERENCES job_positions(id) ON DELETE SET NULL;


ALTER TABLE job_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view own positions" ON job_positions FOR SELECT
  USING ("userId" = (SELECT auth.uid()));
CREATE POLICY "Owners can insert own positions" ON job_positions FOR INSERT
  WITH CHECK ("userId" = (SELECT auth.uid()));
CREATE POLICY "Owners can update own positions" ON job_positions FOR UPDATE
  USING ("userId" = (SELECT auth.uid()))
  WITH CHECK ("userId" = (SELECT auth.uid()));
CREATE POLICY "Owners can delete own positions" ON job_positions FOR DELETE
  USING ("userId" = (SELECT auth.uid()));

ALTER TABLE position_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage position candidates" ON position_candidates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM job_positions p
      WHERE p.id = "jobPositionId" AND p."userId" = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_positions p
      WHERE p.id = "jobPositionId" AND p."userId" = (SELECT auth.uid())
    )
  );

ALTER TABLE position_candidate_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage position invites" ON position_candidate_interviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM position_candidates pc
      JOIN job_positions p ON p.id = pc."jobPositionId"
      WHERE pc.id = "positionCandidateId" AND p."userId" = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM position_candidates pc
      JOIN job_positions p ON p.id = pc."jobPositionId"
      WHERE pc.id = "positionCandidateId" AND p."userId" = (SELECT auth.uid())
    )
  );

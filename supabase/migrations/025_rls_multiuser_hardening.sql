-- ════════════════════════════════════════════════════════════
-- 025 — RLS multi-user hardening
-- ════════════════════════════════════════════════════════════
-- The 001 policies were written for a single-owner model while the app
-- enforces org/project RBAC at the tRPC layer (service-role client, so RLS
-- is bypassed there). Because the anon key ships in the browser bundle, RLS
-- is the real boundary for direct REST access — and 001 leaked across
-- tenants: every candidate row was readable (inviteToken IS NOT NULL), any
-- session row was updatable (USING (true)), and recordings/screenshots were
-- readable by any authenticated user.
--
-- These policies mirror src/server/trpc.ts: access = org member with
-- project access. Walk-in public paths (published interview via publicSlug)
-- stay open. Candidate flows never touch these tables directly — all their
-- reads/writes run server-side with the service-role key.

-- Mirror of hasProjectAccess (src/server/trpc.ts): empty project_members =
-- every org member has access; once populated, only listed members do.
CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    JOIN organization_members om
      ON om."workspaceId" = p."organizationId"
     AND om."userId" = (SELECT auth.uid())
    WHERE p.id = p_project_id
      AND (
        NOT EXISTS (
          SELECT 1 FROM project_members pm WHERE pm."projectId" = p.id
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = (SELECT auth.uid())
        )
      )
  );
$func$;


-- ── INTERVIEWS ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Interviews readable by owner or public" ON interviews;
DROP POLICY IF EXISTS "Owners can insert own interviews" ON interviews;
DROP POLICY IF EXISTS "Owners can update own interviews" ON interviews;
DROP POLICY IF EXISTS "Owners can delete own interviews" ON interviews;

CREATE POLICY "Interviews readable by project members or public"
  ON interviews FOR SELECT
  USING (
    public.can_access_project("projectId")
    OR ("publicSlug" IS NOT NULL AND "isActive" = true)
  );

CREATE POLICY "Project members can insert interviews"
  ON interviews FOR INSERT
  WITH CHECK (public.can_access_project("projectId"));

CREATE POLICY "Project members can update interviews"
  ON interviews FOR UPDATE
  USING (public.can_access_project("projectId"))
  WITH CHECK (public.can_access_project("projectId"));

CREATE POLICY "Project members can delete interviews"
  ON interviews FOR DELETE
  USING (public.can_access_project("projectId"));


-- ── QUESTIONS ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Questions readable by owner or public interview" ON questions;
DROP POLICY IF EXISTS "Interview owners can insert questions" ON questions;
DROP POLICY IF EXISTS "Interview owners can update questions" ON questions;
DROP POLICY IF EXISTS "Interview owners can delete questions" ON questions;

CREATE POLICY "Questions readable by project members or public interview"
  ON questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = questions."interviewId"
        AND (
          public.can_access_project(i."projectId")
          OR (i."publicSlug" IS NOT NULL AND i."isActive" = true)
        )
    )
  );

CREATE POLICY "Project members can insert questions"
  ON questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = questions."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );

CREATE POLICY "Project members can update questions"
  ON questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = questions."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );

CREATE POLICY "Project members can delete questions"
  ON questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = questions."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );


-- ── SESSIONS ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Interview owners can read sessions" ON sessions;
DROP POLICY IF EXISTS "Anyone can create sessions for public interviews" ON sessions;
DROP POLICY IF EXISTS "Session participants can update own session" ON sessions;

CREATE POLICY "Project members can read sessions"
  ON sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = sessions."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );

CREATE POLICY "Project members or public can create sessions"
  ON sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = sessions."interviewId"
        AND (
          public.can_access_project(i."projectId")
          OR (i."publicSlug" IS NOT NULL AND i."isActive" = true)
        )
    )
  );

-- Replaces 001's USING (true): only project members may modify sessions
-- over a direct DB connection.
CREATE POLICY "Project members can update sessions"
  ON sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = sessions."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );


-- ── MESSAGES ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Interview owners can read messages" ON messages;
DROP POLICY IF EXISTS "Anyone can insert messages into active sessions" ON messages;

CREATE POLICY "Project members can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM sessions s
      JOIN interviews i ON i.id = s."interviewId"
      WHERE s.id = messages."sessionId"
        AND public.can_access_project(i."projectId")
    )
  );

CREATE POLICY "Project members can insert messages"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM sessions s
      JOIN interviews i ON i.id = s."interviewId"
      WHERE s.id = messages."sessionId"
        AND public.can_access_project(i."projectId")
    )
  );


-- ── CANDIDATES ──────────────────────────────────────────────
-- 001's "inviteToken IS NOT NULL" made every candidate (all of them carry a
-- token) readable by anyone with the anon key — PII across every org.

DROP POLICY IF EXISTS "Candidates readable by owner or invite token" ON candidates;
DROP POLICY IF EXISTS "Interview owners can insert candidates" ON candidates;
DROP POLICY IF EXISTS "Interview owners can update candidates" ON candidates;
DROP POLICY IF EXISTS "Interview owners can delete candidates" ON candidates;

CREATE POLICY "Project members can read candidates"
  ON candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = candidates."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );

CREATE POLICY "Project members can insert candidates"
  ON candidates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = candidates."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );

CREATE POLICY "Project members can update candidates"
  ON candidates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = candidates."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );

CREATE POLICY "Project members can delete candidates"
  ON candidates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM interviews i
      WHERE i.id = candidates."interviewId"
        AND public.can_access_project(i."projectId")
    )
  );


-- ── STORAGE ─────────────────────────────────────────────────
-- Uploads and playback run server-side (service-role key + signed URLs), so
-- the bucket-level "any authenticated user" policies only served cross-org
-- reads. Drop them; support-attachments keeps its per-user-folder policies.

DROP POLICY IF EXISTS "Authenticated users can upload whiteboards" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read whiteboards" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload recordings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read recordings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read screenshots" ON storage.objects;

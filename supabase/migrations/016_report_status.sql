-- Draft → Finalize report workflow. AI-generated summaries start as DRAFT
-- and the recruiter publishes them per candidate; public share-link reads
-- only surface FINAL sessions for AI-judged kinds (INTERVIEW, ASSESSMENT).
-- Objective kinds (SURVEY, QUIZ, FORM) ignore the status entirely.
-- kind lives on interviews, so the grandfathering join is mandatory.
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'FINAL');

ALTER TABLE sessions
  ADD COLUMN "reportStatus" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "finalizedAt" timestamptz,
  ADD COLUMN "finalizedBy" uuid REFERENCES profiles(id);

-- Grandfather: everything already visible to recruiters today (a summary
-- exists) stays visible on share links after this ships.
UPDATE sessions s
SET "reportStatus" = 'FINAL',
    "finalizedAt" = now()
FROM interviews i
WHERE s."interviewId" = i.id
  AND i.kind IN ('INTERVIEW', 'ASSESSMENT')
  AND s.summary IS NOT NULL;

# Implementation Plan: Psikotes + Proctoring + Draft→Finalize + Granular Scoring

## Context

A prospect's email (2026-10-20) compared Aural against their hiring needs and named gaps: psikotes (psychometric testing) with proctoring, where AI only assists and the recruiter owns the final report ("laporan final tetap di recruiter agar tidak melanggar kode etik"). Richard confirmed the gap analysis against the codebase and locked these decisions:

1. **Psikotes (full feature)** — built-in banks: Big Five, DISC, Reasoning (numerical/logical/verbal), plus a combined package. Deterministic objective scoring, rule-based interpretation bands (no clinical norms — stated honestly in UI).
2. **Proctoring (full feature)** — tab/focus violation detection + periodic webcam snapshots (with explicit candidate consent), surfaced as an integrity summary in reports.
3. **Draft → Finalize workflow (full feature)** — AI summaries are DRAFTS, recruiter-only until approved; the share link `/r/[token]` shows only FINAL reports for AI-judged kinds.
4. **Granular scoring (complete the partial feature)** — per-criteria weights in `assessmentCriteria` + manual recruiter score override with note.

Deliverable order is driven by dependency + risk: finalize workflow first (smallest, unlocks the ethics requirement), then scoring adjustments (feeds the finalize review flow), then proctoring, then psikotes (largest).

## Architecture Decisions

- **Report status lives on `sessions`** (`"reportStatus" 'DRAFT'|'FINAL'` + `"finalizedAt"`/`"finalizedBy"`), not on `interview_report_links` — finalization is per candidate. Applies only to kinds `INTERVIEW` and `ASSESSMENT` (AI-judged); `SURVEY`/`QUIZ`/`FORM` stay implicitly final. Migration grandfathers existing INTERVIEW/ASSESSMENT sessions that already have a summary as FINAL, so today's behavior doesn't change on upgrade.
- **Weights stay inside `assessmentCriteria` jsonb** (optional `weight`, default 1) — no new table; `interview.update` zod + prompt + score math are the only touch points. Existing call sites keep current behavior when no weights are set.
- **Manual overrides live in `insights.adjustments`** written via the existing `merge_session_insights` RPC — no schema change; read paths prefer adjusted values and mark them.
- **Proctoring reuses the existing violation transport** (`session.reportAntiCheatingViolation` + `sessions.antiCheatingLog`), the existing screenshot upload plumbing (`/api/session/upload` → `screenshots` bucket), and adds an append-safe Postgres RPC to replace the race-prone read-modify-write. New `interviews."proctoringEnabled"` flag gates: missing violation emitters, chat-mode webcam snapshots, consent step, recruiter integrity summary.
- **Psikotes is an `ASSESSMENT`-kind interview** driven by a new `src/lib/psychometric/` module (banks + scoring) and `interviews."psychometricConfig"` jsonb. Likert items are plain SINGLE_CHOICE questions — the existing deterministic flow (`src/lib/deterministic-flow.ts`) and quiz grading (`src/lib/quiz-grading.ts`) work unchanged; only dimension aggregation + interpretation are new. Report rows carry dimension names through the existing `ReportRow.criteria` map — no report schema change.

## Key files (from exploration)

| Area | Files |
|---|---|
| Scoring | `src/lib/session-score.ts`, `src/lib/interview-report.ts`, `src/lib/ai/prompts/summary.ts`, `src/lib/ai/session-summary.ts`, `src/lib/quiz-grading.ts` |
| Reports read/write | `src/server/routers/report.ts`, `src/components/interview/reports-tab.tsx`, `src/components/interview/report-view.tsx`, `src/app/r/[token]/page.tsx`, `src/app/r/[token]/session/page.tsx` |
| Proctoring | `src/hooks/use-anti-cheating.ts`, `src/components/session/anti-cheating-banner.tsx`, `src/server/routers/session.ts:690-724`, `src/hooks/use-interview-recording.ts`, `src/components/session/interviewee-onboarding.tsx`, `src/components/interview/interview-results.tsx` |
| Settings/config | `src/app/(dashboard)/interviews/[id]/edit/settings/page.tsx`, `src/server/routers/interview.ts` (update zod ~852-920), `src/components/interview/question-builder.tsx` (criteria editor) |
| Psikotes | `src/lib/psychometric/` (new), `src/lib/interview-templates.ts`, `src/lib/deterministic-flow.ts`, `src/server/routers/session.ts` (complete path ~638-681) |
| Migration | `supabase/migrations/016_report_status_proctoring_psychometric.sql` |

## Task List

Gates for EVERY task: `npx tsc --noEmit` → `npm run lint` → `npm run test:web`. Migrations 016–019, one per phase. After approval, first implementation step copies this plan to `tasks/plan.md` + writes `tasks/todo.md` (skill's required task-list target; plan mode forbids writing them now).

### Phase A — Draft→Finalize (F3)
- **A1. Migration 016** (`016_report_status.sql`): enum `"ReportStatus"('DRAFT','FINAL')`; `sessions."reportStatus"` default DRAFT + `"finalizedAt"`/`"finalizedBy"`; grandfather UPDATE joins `interviews` (kind lives there, not on sessions) → INTERVIEW/ASSESSMENT sessions with a summary become FINAL. [S]
- **A2. Public reads filter FINAL**: pure `filterFinalForAiKinds(entries, kind)` in `src/lib/interview-report.ts`; applied in BOTH `report.getByToken` and the `/r/[token]/page.tsx` server component (it fetches via `supabaseAdmin`, bypasses tRPC — the leak path). ASSESSMENT aggregate respondent count uses filtered entries. Test: `tests/report-finalize.test.ts`. [S]
- **A3. Finalize UI + mutations**: `report.finalizeSessions({interviewId, sessionIds})` + `report.finalizeAll` (single UPDATE, `verifyInterviewAccess`); `reportStatus` on `ReportRow`; badges + per-row Finalize + "Finalize all (N)" in `reports-tab.tsx`/`report-view.tsx`. [M]
- **Checkpoint A**: gates green, 016 applied, manual: finalize one candidate → `/r/[token]` shows only them.

### Phase B — Granular scoring (F4)
- **B1. Criteria weights**: `assessmentCriteria` entries gain optional `weight` (zod in `interview.update`); summary prompt renders weight; `getSessionOverallScore(insights, totalQuestions?, weights?)` — weights present & any ≠1 → weighted criteria average; else legacy path verbatim. **Widen all 6 score call-site selects** with `assessmentCriteria` (`interview-report.ts`, `interview-results.tsx`, `r/[token]/session/page.tsx`, `candidates/page.tsx`, `candidate-manager.tsx`, `interview.ts` embed) or the same session shows different scores per page. Test: `tests/session-score-weights.test.ts` (all-1 ≡ legacy number). [M]
- **B2. Score overrides (storage/read)**: new `session.adjustScore` mutation (overall + per-criteria, optional note; merges full `adjustments` object in JS then ONE `merge_session_insights` call — shallow merge replaces the key); pure `applyScoreAdjustments(insights)` in `session-score.ts` applied inside `getSessionOverallScore` so every call site sees adjusted values free. Test: `tests/score-adjustments.test.ts`. [M]
- **B3. Override UI + "Adjusted" markers**: edit dialog in `interview-results.tsx`; markers in `interview-results.tsx`, `report-view.tsx`, `/r/[token]/session/page.tsx`; XLSX export inherits adjusted scores automatically. [M]
- **Checkpoint B**: gates green; manual: weighted interview differs from unweighted; override survives reload + appears in XLSX.

### Phase C — Proctoring (F2)
- **C1. Migration 018 + plumbing** (`018_proctoring.sql`): `interviews."proctoringEnabled"` bool; RPC `append_anti_cheating_log` (atomic `||` append, SECURITY DEFINER, REVOKE PUBLIC/anon/authenticated, GRANT service_role per 012 pattern); create path + `createFromTemplate` passthrough. [S]
- **C2. Consent + violation emitters**: webcam-consent step in `interviewee-onboarding.tsx` (capture strictly after consent; denied permission degrades to disabled, never crashes); `use-anti-cheating.ts` gains `proctoring` option emitting the 4 missing types (`tab_switch` on hidden, `focus_lost` on blur expiry, `copy`/`cut`) — event→violation mapping extracted to a pure function for `tests/anti-cheating-emission.test.ts`. [M]
- **C3. Append-safe write + chat-mode webcam**: `reportAntiCheatingViolation` switches to the RPC + optional `snapshotPath` on violations; new `src/hooks/use-proctoring-camera.ts` (~60 lines, reuses `/api/session/upload` verbatim — zero server route change); mounted in chat/voice sessions only when `proctoringEnabled && consented`; violation-moment snapshot correlated by ms timestamp. Do NOT touch `use-interview-recording.ts` (MediaRecorder-coupled). [M]
- **C4. Integrity summary**: `src/lib/proctoring-summary.ts` (`summarizeLog` → counts by type, `flagged = tab_switch >= 3`, snapshot count); rendered in the existing Integrity card (`interview-results.tsx`). Flagged does NOT affect score ranking — context for the recruiter, not a score input. Test: `tests/proctoring-summary.test.ts`. [S]
- **Checkpoint C**: gates green; manual: chat session with proctoring → tab switch + copy → integrity card counts + snapshot in storage.

### Phase D — Psikotes (F1)
- **D1. Banks + scoring module**: `src/lib/psychometric/banks.ts` (Big Five ~30 Likert-1-5 items → 5 dims; DISC ~24 adjective items → 4 dims; Reasoning ~15 keyed SINGLE_CHOICE across numerical/logical/verbal); `scoring.ts` (`scorePsychometric` → dimension averages 0–100 + band lookup + `criteriaEvaluations` at 0–10 = dim/10 + summary string; reuses `parseChoiceSelection` + `gradeSelection`). Test: `tests/psychometric-scoring.test.ts` (dimension coverage, option counts, keys, band edges). [M]
- **D2. Migration 019 + templates** (`019_psychometric.sql`): `interviews."psychometricConfig"` jsonb + create-RPC update; 3 new templates (Big Five, DISC, Reasoning package) in `interview-templates.ts` with `kind: "ASSESSMENT"`, `aiSummaryEnabled: false` (no LLM billing on completion), `psychometricConfig` set; rendered by the existing template grid generically. [M]
- **D3. Deterministic scoring at complete**: `session.complete` branches on `psychometricConfig` → `scorePsychometric` → `merge_session_insights` (`questionEvaluations`, `criteriaEvaluations`, `dimensionScores`, `interpretation`); sets `reportStatus = 'FINAL'` at completion (deterministic, nothing to approve — consistent with the objective-kinds rule). Test: `tests/psychometric-session.test.ts`. [M]
- **D4. Dimension bars**: new pure `src/components/interview/dimension-bars.tsx` (0–100 bars + band label + caption "rule-based interpretation, not clinical norms"); mounted in `interview-results.tsx`, `report-view.tsx`, `/r/[token]/session/page.tsx`. Report rows sort on the 0–10 `criteriaEvaluations` with zero `ReportRow` changes. [S/M]
- **Checkpoint D**: gates green; manual: create DISC interview → complete as candidate → dimensions + band render; share link shows the FINAL report with bars.

## Resolved decisions (owner-locked or derived 2026-10-20)

- Psikotes sessions complete as **FINAL** (deterministic scoring = objective kind, same rule as QUIZ/SURVEY).
- Weighted criteria average **replaces** question-average only when any weight ≠ 1; absent weights = byte-identical legacy math.
- Score overrides allowed on any completed session, FINAL included; markers state "adjusted", never claim weighted.
- Proctoring flag threshold starts at `tab_switch >= 3`; "Flagged" is informational only.
- Integrity card shows counts + snapshot gallery reusing the existing signed-URL screenshot pattern.

## Verification

Per task: `npx tsc --noEmit` → `npm run lint` → `npm run test:web`, plus targeted `node --import tsx --test tests/<file>.test.ts` for each new pure-logic module. Each phase ends with: migration push (`npx supabase db push` for that phase's migration), commit → push `origin` + `deploy` → `npm run deploy:vercel` → READY check (standing directive), plus the manual runtime check listed at the phase checkpoint.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Weighted score changes existing scores on old interviews | Med | Weights opt-in; absent → exact current math; tests pin both paths |
| Draft gating hides reports recruiters already share | High | Grandfather migration marks existing summaries FINAL |
| Regenerating an AI summary on a FINAL session rewrites approved content | Med | Confirm dialog on regenerate already exists; note in UI when status is FINAL |
| Webcam consent/privacy | High | Explicit consent gate; capture strictly after; denied permission = capture disabled |
| `antiCheatingLog` concurrent writes corrupt the log | Med | Atomic append RPC replaces read-modify-write |
| Psikotes read as clinical assessment | Med | Rule-based bands, explicit "not clinical norms" caption; DISC-via-Likert approximation disclosed |
| Same session shows different scores per page after B1 | High | Widening all 6 call-site selects is an explicit B1 acceptance criterion |

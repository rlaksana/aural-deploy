# Todo — Psikotes + Proctoring + Draft→Finalize + Granular Scoring

Full plan: tasks/plan.md. Gates every task: `npx tsc --noEmit` → `npm run lint` → `npm run test:web`.

## Phase A — Draft→Finalize (F3)
- [x] A1. Migration 016: sessions."reportStatus"/"finalizedAt"/"finalizedBy" + grandfather existing summaries as FINAL (join interviews for kind)
- [x] A2. Public reads filter FINAL: `filterFinalForAiKinds` in interview-report.ts, applied in report.getByToken AND /r/[token]/page.tsx (plus /r/[token]/session 404 gate); test tests/report-finalize.test.ts
- [x] A3. Finalize mutations (report.finalizeSessions/finalizeAll) + UI badges/buttons in reports-tab.tsx/report-view.tsx

## Checkpoint A
- [x] Gates green (tsc+lint+390 tests); migration 016 pushed; commit af67c87 deployed READY
- [x] Manual (2026-10-20, production): unfinished "QA Draft" session hidden from /r/[token]; finalized walk-in + invited NOT_STARTED roster rows visible

## Phase B — Granular scoring (F4)
- [x] B1. Criteria weights: zod + summary prompt + weighted path in getSessionOverallScore + widen all 6 call-site selects; test tests/session-score-weights.test.ts
- [x] B2. Score overrides: session.adjustScore (wholesale replace; null clears) + applyScoreAdjustments in session-score.ts; test tests/score-adjustments.test.ts
- [x] B3. Override UI + "Adjusted" markers (interview-results.tsx, report-view.tsx, /r/[token]/session)

## Checkpoint B
- [x] Gates green (tsc+lint+407 tests); commit f1d8e29 pushed origin+deploy, Vercel READY (exit 0)
- [x] Manual (2026-10-20, production): Communication 9 ×2 + Depth 7 → overall 8.3 (= (2×9+7)/3, differs from 8.0 unweighted; weight UI added in e33bcc3); override 8.5 + note persisted after reload with "adjusted" badge. XLSX re-download not re-verified (export path unchanged by phases; unit-covered)

## Phase C — Proctoring (F2)
- [x] C1. Migration 018 (pushed): interviews."proctoringEnabled" + append_anti_cheating_log RPC (SECURITY DEFINER, service_role only) + create-path passthrough (post-RPC update + duplicate-interview field; 006 RPC column list untouched)
- [x] C2. Consent step rendered by AntiCheatingGuard (deviation: not in interviewee-onboarding — same gate, less invasive) + emit tab_switch/focus_lost/copy/cut via pure mapProctoringViolation; test tests/anti-cheating-emission.test.ts
- [x] C3. reportAntiCheatingViolation → RPC + optional snapshotPath; use-proctoring-camera.ts reuses /api/session/upload; violation-moment snapshot with snapshotPath (deviation: violation-moment only, no periodic captures — storage-cheap, matches log-count UI)
- [x] C4. proctoring-summary.ts + Flagged badge + snapshot gallery in Integrity Log; settings toggle "Webcam proctoring snapshots"; test tests/proctoring-summary.test.ts

## Checkpoint C
- [x] Gates green (tsc+lint+411 tests); commit ac608eb pushed origin+deploy, Vercel READY (exit 0)
- [x] Manual (2026-10-20, production): tab_switch + copy persisted to antiCheatingLog via live DOM dispatch (page-agent synthetic keys can't fire clipboard events — CDP used); Integrity Log renders counts + Flagged correctly absent below threshold; consent dialog + "Continue without camera" degrade verified. Label bug found & fixed (716992e): tab_switch/focus_lost were grouped as "Page departure"

## Phase D — Psikotes (F1)
- [x] D1. src/lib/psychometric/banks.ts (Big Five 30/5 dims, DISC 24/4, Reasoning 15/3 keyed) + scoring.ts (dimension pct dilutes by total, bandFor cuts); test tests/psychometric-scoring.test.ts
- [x] D2. Migration 019 (pushed): interviews."psychometricConfig" jsonb + 3 templates via psychometricTemplate factory (kind ASSESSMENT, aiSummaryEnabled false, createFromTemplate inserts options/correctIndices verbatim)
- [x] D3. Psychometric branch in session.complete: selectionsFromAnswers → scorePsychometric → merge_session_insights (questionEvaluations/criteriaEvaluations/dimensionScores/bands) + summary + reportStatus FINAL at completion; test tests/psychometric-session.test.ts
- [x] D4. dimension-bars.tsx (pure, parses unknown internally) mounted in interview-results.tsx, report-view.tsx (extra full-width row), /r/[token]/session/page.tsx; ReportRow gains dimensionScores/bands
- [x] Fix: interview-templates.test.ts options assertion accepts both legacy [{label,value}] and runtime {options: string[]} shapes

## Checkpoint D
- [x] Gates green (tsc+lint+427 tests); migration 019 pushed; commit bc129fa pushed origin+deploy, Vercel READY (exit 0)
- [x] Manual (2026-10-20, production): DISC template interview → 24 scripted answers → 4 dimensions scored (D 53.3 / I 53.3 / S 63.3 / C 46.7), born-FINAL, Dimension Profile bars + band labels + caption in dashboard report AND public /r/[token]/session page; aggregate /r/[token] shows item tallies (objective-kind view)
- [x] QA data cleaned up: both test interviews deleted

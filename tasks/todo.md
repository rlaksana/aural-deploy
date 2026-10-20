# Todo — Psikotes + Proctoring + Draft→Finalize + Granular Scoring

Full plan: tasks/plan.md. Gates every task: `npx tsc --noEmit` → `npm run lint` → `npm run test:web`.

## Phase A — Draft→Finalize (F3)
- [x] A1. Migration 016: sessions."reportStatus"/"finalizedAt"/"finalizedBy" + grandfather existing summaries as FINAL (join interviews for kind)
- [x] A2. Public reads filter FINAL: `filterFinalForAiKinds` in interview-report.ts, applied in report.getByToken AND /r/[token]/page.tsx (plus /r/[token]/session 404 gate); test tests/report-finalize.test.ts
- [x] A3. Finalize mutations (report.finalizeSessions/finalizeAll) + UI badges/buttons in reports-tab.tsx/report-view.tsx

## Checkpoint A
- [x] Gates green (tsc+lint+390 tests); migration 016 pushed; commit af67c87 deployed READY
- [ ] Manual: finalize one candidate → /r/[token] shows only them

## Phase B — Granular scoring (F4)
- [x] B1. Criteria weights: zod + summary prompt + weighted path in getSessionOverallScore + widen all 6 call-site selects; test tests/session-score-weights.test.ts
- [ ] B2. Score overrides: session.adjustScore mutation + applyScoreAdjustments in session-score.ts; test tests/score-adjustments.test.ts
- [ ] B3. Override UI + "Adjusted" markers (interview-results.tsx, report-view.tsx, /r/[token]/session)

## Checkpoint B
- [x] Gates green (tsc+lint+407 tests); commit f1d8e29 pushed origin+deploy, Vercel READY (exit 0)
- [ ] Manual: weighted differs from unweighted; override survives reload + XLSX

## Phase C — Proctoring (F2)
- [x] C1. Migration 018: interviews."proctoringEnabled" + append_anti_cheating_log RPC (SECURITY DEFINER, service_role only) + create-path passthrough (post-RPC update + duplicate-interview field; 006 RPC column list untouched)
- [x] C2. Consent step rendered by AntiCheatingGuard (deviation: not in interviewee-onboarding — same gate, less invasive) + emit tab_switch/focus_lost/copy/cut via pure mapProctoringViolation; test tests/anti-cheating-emission.test.ts
- [x] C3. reportAntiCheatingViolation → RPC + optional snapshotPath; use-proctoring-camera.ts reuses /api/session/upload; violation-moment snapshot with snapshotPath (deviation: violation-moment only, no periodic captures — storage-cheap, matches log-count UI)
- [x] C4. proctoring-summary.ts + Flagged badge + snapshot gallery in Integrity Log; settings toggle "Webcam proctoring snapshots"; test tests/proctoring-summary.test.ts

## Checkpoint C
- [ ] Gates green; manual: chat session with proctoring → violations + snapshot in storage; commit+push+deploy READY

## Phase D — Psikotes (F1)
- [ ] D1. src/lib/psychometric/banks.ts (Big Five, DISC, Reasoning) + scoring.ts; test tests/psychometric-scoring.test.ts
- [ ] D2. Migration 019: interviews."psychometricConfig" + 3 templates (kind ASSESSMENT, aiSummaryEnabled false)
- [ ] D3. Deterministic scoring at session.complete + born-FINAL reportStatus; test tests/psychometric-session.test.ts
- [ ] D4. dimension-bars.tsx mounted in interview-results, report-view, /r/[token]/session

## Checkpoint D
- [ ] Gates green; manual: DISC interview → complete → dimensions render; share link FINAL; commit+push+deploy READY

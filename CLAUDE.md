# CLAUDE.md — Aural (aural-oss)

Open-source AI interview platform supporting Voice, Chat, and Video.

## Tech Stack & Architecture

- **Frontend/API**: Next.js 16 (App Router, React 19, Tailwind CSS, Radix UI)
- **API Layer**: tRPC v10 (`src/server/routers/`) + Next.js App Router API Routes (`src/app/api/`)
- **Database**: Supabase PostgreSQL (`supabase/migrations/`)
- **AI Infrastructure**: All text LLMs route through the LiteLLM gateway (`src/lib/ai/providers/litellm.ts` — env `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY`, default model `minimax-m3.1`); malformed structured output is repaired deterministically then via OpenRouter repair calls (`z-ai/glm-5.3-flash`, `src/lib/ai/repair.ts`) — never a blind re-run. Heavy batch work (generate/refine/parse/summary/analysis) runs only inside the 17:00–07:00 WIB operating window (`src/lib/ai/ai-window.ts`); outside it requests are queued in `ai_jobs` and drained by the `ai-drain` sidecar in the compose stack, which POSTs `/api/cron/ai-jobs` on the compose network every 5 minutes. The executor must run on the VPS (long-running): GitHub Actions cron was removed (Cloudflare blocks runner IPs) and Vercel Hobby caps functions at 60s. Live interviewer chat/voice/prep is not gated. `MINIMAX_API_KEY` is voice-only (ASR/TTS)
- **Voice Relay**: Standalone Node.js WebSocket server (`server/voice-relay.ts`) with MiniMax one-shot ASR + MiniMax TTS (`server/minimax-voice.ts`); browser uplink/downlink audio frames unchanged

## Essential Commands

### First-Time Setup
```bash
npm install                            # Install dependencies before any other command
```

### Development & Build
```bash
npm run dev           # Start Next.js development server
npm run dev:voice     # Start MiniMax voice relay (run in a separate terminal)
npm run build         # Production build (Next.js)
npm run lint          # Run ESLint check
```

### Testing
```bash
npm run test:web      # Run main web test suite (Node.js test runner)
npm run test:functional # Run functional tests (concurrency=1)

# Run a single test file:
node --import tsx --test tests/generated-schema.test.ts
```

### Local Environment
`.env.local` (gitignored) is the canonical local env and must always contain the full set:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `CRON_SECRET`, `MINIMAX_API_KEY` (voice-only), `OPENROUTER_API_KEY` (repair model + transport fallback).

- Ops/one-off scripts run with `node --env-file=.env.local --import tsx <script.ts>` — no env injection on the command line.
- Recovery when vars go missing: `npx vercel env pull <tmpfile> --environment=production --yes` returns 4 values as `[SENSITIVE]` placeholders (`DATABASE_URL`, `MINIMAX_BASE_URL`, `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — keep the real lines, drop `VERCEL_*`/`NX_*`/`TURBO_*` noise, then restore `OPENROUTER_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (`npx supabase projects api-keys --project-ref <ref> --reveal --output json`, entry with `name: "service_role"`). `MINIMAX_BASE_URL` and `DATABASE_URL` have code/CLI defaults and can be omitted. Never commit or print the values.

### Database & Supabase
```bash
npx supabase db push                   # Push pending migrations to linked remote DB
npx supabase db diff                   # Review schema changes before pushing
npx supabase migration list            # Check local vs remote migration status
npx supabase db query --linked "SQL"   # Execute SQL against linked remote database
npm run db:types                       # Regenerate Supabase TypeScript types
```

## Key Engineering Conventions & Gotchas

1. **Supabase Schema (camelCase)**:
   - Database tables use camelCase column names (e.g., `"userId"`, `"projectId"`, `"createdAt"`).
   - In raw SQL migrations and RPCs, always wrap column names in double quotes (`"userId"`).

2. **Atomic Entity Creation**:
   - Prefer atomic server procedures / RPCs over client-side multi-request creation to prevent partial/orphaned records.
   - Canonical reference: `supabase/migrations/006_create_interview_with_questions.sql` + `interview.createWithQuestions` tRPC procedure (validates per-question invariants before delegating to the RPC; everything happens in one DB transaction).
   - When adding a new entity with children, follow this pattern: 1) write migration with `CREATE OR REPLACE FUNCTION ... RETURNS TABLE (...)`, 2) `GRANT EXECUTE ... TO authenticated`, 3) expose via tRPC procedure with explicit input validation, 4) call via `ctx.supabase.rpc(...)`.

3. **AI Generation & Fallbacks**:
   - AI generation and refinement routes (`src/app/api/ai/generate`, `src/app/api/ai/refine`) use `streamGeneratorWithFallback()` and `resolveGeneratorModel()` from `src/lib/ai/generator-run.ts`.
   - Validate all LLM output JSON structures using Zod schemas defined in `src/lib/ai/generated-schema.ts`.
   - Always validate BOTH request payload and parsed LLM output before sending SSE `done`.

4. **Standalone Voice Relay Servers**:
   - Real-time voice servers in `server/` run as independent Node.js processes outside the Next.js lifecycle.
   - Voice relays need a separate terminal/process from `npm run dev` to function correctly.

5. **Test Runner**:
   - Tests use the native Node.js test runner (`node --import tsx --test`). Use `node --import tsx --test tests/<name>.test.ts` for targeted test execution.
   - The full suite (`npm run test:web`) runs many tests concurrently — for one-off debugging prefer single-file invocation.

## Workflow (before commit)

```bash
npm run lint                                   # Lint must be clean
npm run test:web                               # Tests must pass (pre-existing failures documented separately)
git pull --rebase origin main                  # Resolve conflicts before pushing
git push origin main                           # Push when ready
git push deploy main                           # ALWAYS mirror to deploy remote — must never diverge from origin/main
```

**Deploy pipelines** (run only after the push steps above; both require a clean `main` synced with `origin/main`):

```bash
npm run deploy:vercel                              # Vercel production via CLI
AURAL_DEPLOY_HOST=user@vps npm run deploy:docker   # remote compose stack (git pull + compose up --build)
```

**Dual-remote rule:** `origin` (aural-oss) and `deploy` (aural-deploy) must always point to the same commit on `main`. Every push to `origin` must be immediately followed by a push to `deploy`. Vercel deployments are CLI-driven (`vercel --prod`, or `npm run deploy:vercel`), not git-triggered, so the `deploy` remote is a mirror only — but it must never fall behind.
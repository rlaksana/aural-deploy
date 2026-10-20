-- Psychometric testing: interviews can reference a built-in instrument bank.
-- Config shape: { "bankId": "BIG_FIVE" | "DISC" | "REASONING" } — scoring
-- lives in src/lib/psychometric (deterministic, no LLM).

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "psychometricConfig" jsonb;

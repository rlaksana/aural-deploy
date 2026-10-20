-- Org-wide reusable interview templates saved by users from existing
-- interviews. `config` is a full snapshot (tone, depth, criteria, channels,
-- questions) so later edits to the source interview never mutate the
-- template. RLS enabled with no policies — access goes exclusively through
-- the server (service role), which enforces org membership in tRPC.
CREATE TABLE IF NOT EXISTS custom_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "createdBy" uuid NOT NULL,
  title text NOT NULL,
  description text,
  config jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE custom_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS custom_templates_org_idx
  ON custom_templates ("organizationId", "createdAt" DESC);

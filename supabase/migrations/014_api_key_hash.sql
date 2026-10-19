-- Store API keys as SHA-256 hashes: a dump of api_keys must not yield live
-- credentials. "keyPrefix" keeps a displayable fragment for the settings UI.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS "keyPrefix" text;

-- Raw keys are exactly "dlv_" + 32 chars; hashed rows are 64 hex chars, so
-- the length guard keeps this idempotent.
UPDATE api_keys
SET "keyPrefix" = left(key, 12),
    key = encode(sha256(convert_to(key, 'utf8')), 'hex')
WHERE length(key) = 36 AND key LIKE 'dlv_%';

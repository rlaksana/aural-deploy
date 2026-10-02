-- Interviews default to Indonesian: the product's primary audience expects id
-- interviews, and the old 'en' default made manually/API-created interviews run
-- (and report) in English. Existing rows keep their stored value.
ALTER TABLE interviews
    ALTER COLUMN language SET DEFAULT 'id';

-- ============================================================
-- 011_question_short_text.sql
--
-- Adds SHORT_TEXT (single-line form field) to QuestionType.
-- Kept as its own migration: ALTER TYPE ADD VALUE must not share
-- a transaction with statements that use the new value.
-- ============================================================

ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'SHORT_TEXT';

-- ============================================================
-- Migration: Add liability support (credit cards / debt)
-- Run this in: Supabase Dashboard → SQL Editor
--
-- Safe to run on a live database:
--   - No tables are dropped
--   - No data is deleted
--   - net_worth_summary is dropped and recreated (no dependents)
--   - All existing balance rows are preserved
-- ============================================================


-- ── Step 1: account_type constraint ──────────────────────────
-- Add 'credit_card' to the allowed values.
-- PostgreSQL auto-names inline CHECK constraints as {table}_{col}_check.
ALTER TABLE public.balances DROP CONSTRAINT IF EXISTS balances_account_type_check;
ALTER TABLE public.balances
  ADD CONSTRAINT balances_account_type_check
  CHECK (account_type IN ('saving', 'term_deposit', 'investment', 'cash', 'credit_card'));


-- ── Step 2: drop net_worth_summary ───────────────────────────
-- CREATE OR REPLACE VIEW cannot rename existing columns, so we
-- must drop and recreate. CASCADE is declared but will not
-- remove any other objects — no view in this schema depends on
-- net_worth_summary.
DROP VIEW IF EXISTS public.net_worth_summary CASCADE;


-- ── Step 3: recreate net_worth_summary with liability columns ─
-- Positive balance  = asset
-- Negative balance  = liability / debt (e.g. credit card)
--
-- New columns vs old:
--   assets_total  – SUM of positive balances only          (new)
--   debt          – ABS(SUM of negative balances)           (new)
--   debt_pct      – debt as % of assets_total              (new)
--   liquid        – positive liquid balances only          (fixed: was all liquid)
--   long_term     – positive long-term balances only       (fixed: was all long_term)
--   liquid_pct    – now relative to assets_total           (fixed denominator)
--   long_term_pct – now relative to assets_total           (fixed denominator)
--   liquidity_warning – true when liquid_pct<20 OR debt_pct>20 (extended)
CREATE VIEW public.net_worth_summary
  WITH (security_invoker = true)
AS
SELECT
  user_id,
  month,

  -- Net worth = all assets minus all liabilities
  SUM(balance)::numeric(12, 2)
    AS net_worth,

  -- Total assets (positive balances only)
  SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END)::numeric(12, 2)
    AS assets_total,

  -- Total debt (absolute value of negative balances)
  ABS(SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END))::numeric(12, 2)
    AS debt,

  -- Liquid assets (positive balances with liquidity_type = 'liquid')
  SUM(CASE WHEN liquidity_type = 'liquid'    AND balance > 0 THEN balance ELSE 0 END)::numeric(12, 2)
    AS liquid,

  -- Long-term assets (positive balances with liquidity_type = 'long_term')
  SUM(CASE WHEN liquidity_type = 'long_term' AND balance > 0 THEN balance ELSE 0 END)::numeric(12, 2)
    AS long_term,

  -- liquid_pct = liquid / assets_total * 100
  ROUND(
    SUM(CASE WHEN liquidity_type = 'liquid' AND balance > 0 THEN balance ELSE 0 END)
    / NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100,
    1
  ) AS liquid_pct,

  -- long_term_pct = long_term / assets_total * 100
  ROUND(
    SUM(CASE WHEN liquidity_type = 'long_term' AND balance > 0 THEN balance ELSE 0 END)
    / NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100,
    1
  ) AS long_term_pct,

  -- debt_pct = debt / assets_total * 100
  ROUND(
    ABS(SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END))
    / NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100,
    1
  ) AS debt_pct,

  -- liquidity_warning: flag when liquid coverage is low OR debt load is high
  (
    ROUND(
      SUM(CASE WHEN liquidity_type = 'liquid' AND balance > 0 THEN balance ELSE 0 END)
      / NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100,
      1
    ) < 20
    OR
    ROUND(
      ABS(SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END))
      / NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100,
      1
    ) > 20
  ) AS liquidity_warning

FROM public.balances
GROUP BY user_id, month
ORDER BY user_id, month;

-- ============================================================
-- Migration: Add liability support (credit cards / debt)
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Allow credit_card as an account_type
--    (drop the old check, re-add with the new value)
ALTER TABLE balances DROP CONSTRAINT IF EXISTS balances_account_type_check;
ALTER TABLE balances ADD CONSTRAINT balances_account_type_check
  CHECK (account_type IN ('saving', 'term_deposit', 'investment', 'cash', 'credit_card'));

-- 2. Allow negative balances (credit card debt stored as negative)
--    Remove any >=0 check and replace with != 0
ALTER TABLE balances DROP CONSTRAINT IF EXISTS balances_balance_check;
ALTER TABLE balances ADD CONSTRAINT balances_balance_check
  CHECK (balance <> 0);

-- 3. Replace net_worth_summary view to support liabilities
CREATE OR REPLACE VIEW net_worth_summary
  WITH (security_invoker = true)
AS
SELECT
  user_id,
  month,
  -- Net worth = assets minus all liabilities
  SUM(balance)::numeric(12, 2)                                                                           AS net_worth,
  -- Total positive balances (assets)
  SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END)::numeric(12, 2)                                    AS assets_total,
  -- Total debt (absolute value of negative balances)
  ABS(SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END))::numeric(12, 2)                               AS debt,
  -- Liquid assets (positive liquid balances only)
  SUM(CASE WHEN liquidity_type = 'liquid'    AND balance > 0 THEN balance ELSE 0 END)::numeric(12, 2)   AS liquid,
  -- Long-term assets (positive long-term balances only)
  SUM(CASE WHEN liquidity_type = 'long_term' AND balance > 0 THEN balance ELSE 0 END)::numeric(12, 2)   AS long_term,
  -- liquid_pct = liquid / assets_total
  ROUND(
    SUM(CASE WHEN liquidity_type = 'liquid'    AND balance > 0 THEN balance ELSE 0 END) /
    NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100, 1
  )                                                                                                       AS liquid_pct,
  -- long_term_pct = long_term / assets_total
  ROUND(
    SUM(CASE WHEN liquidity_type = 'long_term' AND balance > 0 THEN balance ELSE 0 END) /
    NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100, 1
  )                                                                                                       AS long_term_pct,
  -- debt_pct = debt / assets_total
  ROUND(
    ABS(SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END)) /
    NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100, 1
  )                                                                                                       AS debt_pct,
  -- liquidity_warning = true when liquid_pct < 20 OR debt_pct > 20
  (
    ROUND(
      SUM(CASE WHEN liquidity_type = 'liquid' AND balance > 0 THEN balance ELSE 0 END) /
      NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100, 1
    ) < 20
    OR
    ROUND(
      ABS(SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END)) /
      NULLIF(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) * 100, 1
    ) > 20
  )                                                                                                       AS liquidity_warning
FROM balances
GROUP BY user_id, month
ORDER BY user_id, month;

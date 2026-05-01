-- ============================================================
-- Finance App – Supabase Schema  (v2)
-- ============================================================
-- HOW TO USE
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste and run SECTIONS 1–4 to create tables, indexes,
--      RLS policies, and views.
--   3. To load demo data:
--      a. Create a user via your app (or Auth → Add user)
--      b. Copy the UUID from Auth → Users → UID column
--      c. Replace <<YOUR_USER_UUID>> in SECTION 5 (keep quotes)
--      d. Select and run SECTION 5 only
-- ============================================================


-- ============================================================
-- SECTION 1 – TABLES
-- ============================================================

-- ── transactions ─────────────────────────────────────────────
-- Core ledger.  'month' is auto-derived from 'date' via trigger –
-- never supply it on INSERT or UPDATE; the trigger sets it.
-- Amounts are signed:  income > 0,  expense < 0.
-- 'type' column is retained for UI display only; all view
-- calculations use the sign of amount, not the type column.
create table if not exists transactions (
  id          uuid           primary key default gen_random_uuid(),
  user_id     uuid           not null references auth.users (id) on delete cascade,
  date        date           not null,
  month       text           not null,
  type        text           not null check (type in ('income', 'expense')),
  category    text           not null,
  amount      numeric(12, 2) not null check (amount != 0),
  note        text,
  created_at  timestamptz    not null default now()
);

comment on column transactions.month is
  'Set automatically by trigger trg_set_transaction_month: to_char(date, ''YYYY-MM''). Never supply on INSERT or UPDATE.';
comment on column transactions.amount is
  'Signed value: positive = income, negative = expense. The type column is for UI only.';

-- ── budgets ──────────────────────────────────────────────────
-- Monthly budget targets per category.
-- actual spend + usage_percent are computed in the budget_actuals view.
create table if not exists budgets (
  id          uuid           primary key default gen_random_uuid(),
  user_id     uuid           not null references auth.users (id) on delete cascade,
  month       text           not null,              -- 'YYYY-MM'
  category    text           not null,
  budget      numeric(12, 2) not null check (budget > 0),
  unique (user_id, month, category)
);

comment on table budgets is
  'Budget targets only. Actuals derived via budget_actuals view.';

-- ── balances ─────────────────────────────────────────────────
-- Monthly account balance snapshots entered by the user.
-- Net Worth = SUM(balance) per (user_id, month).
create table if not exists balances (
  id             uuid           primary key default gen_random_uuid(),
  user_id        uuid           not null references auth.users (id) on delete cascade,
  month          text           not null,              -- 'YYYY-MM'
  account        text           not null,
  liquidity_type text           not null check (liquidity_type in ('liquid', 'long_term')),
  account_type   text           not null check (account_type in ('saving', 'term_deposit', 'investment', 'cash')),
  balance        numeric(12, 2) not null default 0,
  unique (user_id, month, account)
);

comment on column balances.liquidity_type is
  'liquid = easily accessible (savings, cash). long_term = locked-in (term deposit, investments).';
comment on column balances.account_type is
  'Specific account category: saving | term_deposit | investment | cash.';

-- ── goals ────────────────────────────────────────────────────
-- Financial saving goals (e.g. property deposit).
-- Forecasting computed in the goal_progress view.
create table if not exists goals (
  id              uuid           primary key default gen_random_uuid(),
  user_id         uuid           not null references auth.users (id) on delete cascade,
  name            text           not null,
  target_amount   numeric(12, 2) not null check (target_amount > 0),
  current_amount  numeric(12, 2) not null default 0 check (current_amount >= 0),
  start_date      date           not null default current_date,
  created_at      timestamptz    not null default now()
);

comment on column goals.start_date is
  'Base date for estimated_completion_date calculation in goal_progress view.';


-- ── Trigger: auto-populate transactions.month from date ──────
-- to_char() is not immutable so it cannot be used in a generated
-- stored column.  A BEFORE trigger is the correct alternative:
-- it fires before constraint checks, so NOT NULL is satisfied.
create or replace function set_transaction_month()
returns trigger
language plpgsql
as $$
begin
  new.month := to_char(new.date, 'YYYY-MM');
  return new;
end;
$$;

create or replace trigger trg_set_transaction_month
  before insert or update of date
  on transactions
  for each row
  execute function set_transaction_month();


-- ============================================================
-- SECTION 2 – INDEXES
-- ============================================================

create index if not exists transactions_user_month_idx
  on transactions (user_id, month);

create index if not exists transactions_user_type_idx
  on transactions (user_id, type);

create index if not exists transactions_user_category_idx
  on transactions (user_id, category);

create index if not exists budgets_user_month_idx
  on budgets (user_id, month);

create index if not exists balances_user_month_idx
  on balances (user_id, month);


-- ============================================================
-- SECTION 3 – ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Each user can only read/write their own rows.
-- Policies are named descriptively so they appear clearly
-- in the Supabase Auth dashboard.
-- ============================================================

-- ── transactions ─────────────────────────────────────────────
alter table transactions enable row level security;

create policy "transactions: select own"
  on transactions for select
  using (auth.uid() = user_id);

create policy "transactions: insert own"
  on transactions for insert
  with check (auth.uid() = user_id);

create policy "transactions: update own"
  on transactions for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transactions: delete own"
  on transactions for delete
  using (auth.uid() = user_id);

-- ── budgets ──────────────────────────────────────────────────
alter table budgets enable row level security;

create policy "budgets: select own"
  on budgets for select
  using (auth.uid() = user_id);

create policy "budgets: insert own"
  on budgets for insert
  with check (auth.uid() = user_id);

create policy "budgets: update own"
  on budgets for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budgets: delete own"
  on budgets for delete
  using (auth.uid() = user_id);

-- ── balances ─────────────────────────────────────────────────
alter table balances enable row level security;

create policy "balances: select own"
  on balances for select
  using (auth.uid() = user_id);

create policy "balances: insert own"
  on balances for insert
  with check (auth.uid() = user_id);

create policy "balances: update own"
  on balances for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "balances: delete own"
  on balances for delete
  using (auth.uid() = user_id);

-- ── goals ────────────────────────────────────────────────────
alter table goals enable row level security;

create policy "goals: select own"
  on goals for select
  using (auth.uid() = user_id);

create policy "goals: insert own"
  on goals for insert
  with check (auth.uid() = user_id);

create policy "goals: update own"
  on goals for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "goals: delete own"
  on goals for delete
  using (auth.uid() = user_id);


-- ============================================================
-- SECTION 4 – COMPUTED VIEWS
-- ============================================================
-- All views use:  WITH (security_invoker = true)
-- This means the view runs as the *calling* user, so RLS on
-- the underlying tables applies automatically – users see
-- only their own rows even through the view layer.
-- ============================================================

-- ── budget_actuals ───────────────────────────────────────────
-- Joins budget targets with summed transaction actuals.
-- Expenses are identified by amount < 0 (signed amounts).
-- actual is always returned as a positive value for comparison with budget.
-- Columns:
--   actual        – total absolute spend in that category/month
--   usage_percent – actual / budget × 100  (can exceed 100)
--   status        – 'ok' | 'over'
create or replace view budget_actuals
  with (security_invoker = true)
as
select
  b.id,
  b.user_id,
  b.month,
  b.category,
  b.budget,
  abs(coalesce(sum(t.amount), 0))::numeric(12, 2)         as actual,
  round(
    abs(coalesce(sum(t.amount), 0)) / b.budget * 100,
    1
  )                                                        as usage_percent,
  case
    when abs(coalesce(sum(t.amount), 0)) >= b.budget then 'over'
    else 'ok'
  end                                                      as status
from budgets b
left join transactions t
  on  t.user_id   = b.user_id
  and t.month     = b.month
  and t.category  = b.category
  and t.amount    < 0                                      -- expenses only; sign, not type
group by
  b.id, b.user_id, b.month, b.category, b.budget;

-- ── monthly_summary ──────────────────────────────────────────
-- Aggregates transactions into per-month financial summary.
-- Uses amount sign, not the type column:
--   income   = SUM of positive amounts
--   expenses = SUM of absolute values of negative amounts (always positive)
--   savings  = SUM(amount)  – the natural signed net
-- Columns:
--   income, expenses, savings    – totals for the month
--   saving_rate                  – savings / income × 100
create or replace view monthly_summary
  with (security_invoker = true)
as
select
  user_id,
  month,
  sum(case when amount > 0 then  amount       else 0 end)::numeric(12, 2) as income,
  sum(case when amount < 0 then  abs(amount)  else 0 end)::numeric(12, 2) as expenses,
  sum(amount)::numeric(12, 2)                                              as savings,
  case
    when sum(case when amount > 0 then amount else 0 end) = 0
      then 0
    else round(
      sum(amount) /
      sum(case when amount > 0 then amount else 0 end) * 100,
      1
    )
  end                                                                      as saving_rate
from transactions
group by user_id, month
order by user_id, month;

-- ── net_worth_summary ────────────────────────────────────────
-- Aggregates balance snapshots per month into net worth + allocation.
-- Columns:
--   net_worth                   – SUM of all account balances
--   liquid, long_term           – split by account type
--   liquid_pct, long_term_pct   – allocation percentages
--   liquidity_warning           – true when liquid_pct < 20 %
create or replace view net_worth_summary
  with (security_invoker = true)
as
select
  user_id,
  month,
  sum(balance)::numeric(12, 2)                                                       as net_worth,
  sum(case when liquidity_type = 'liquid'    then balance else 0 end)::numeric(12, 2) as liquid,
  sum(case when liquidity_type = 'long_term' then balance else 0 end)::numeric(12, 2) as long_term,
  round(
    sum(case when liquidity_type = 'liquid'    then balance else 0 end) /
    nullif(sum(balance), 0) * 100,
    1
  )                                                                                    as liquid_pct,
  round(
    sum(case when liquidity_type = 'long_term' then balance else 0 end) /
    nullif(sum(balance), 0) * 100,
    1
  )                                                                                    as long_term_pct,
  (
    round(
      sum(case when liquidity_type = 'liquid' then balance else 0 end) /
      nullif(sum(balance), 0) * 100,
      1
    ) < 20
  )                                                                                    as liquidity_warning
from balances
group by user_id, month
order by user_id, month;

-- ── goal_progress ────────────────────────────────────────────
-- Combines goal targets with the user's average monthly saving
-- (from monthly_summary) to forecast time to completion.
--
-- Columns:
--   progress_pct              – current_amount / target × 100
--   remaining_amount          – how much more needs to be saved
--   monthly_avg_saving        – average of trailing 6 months with savings > 0
--                               (falls back to all available months if < 6)
--   months_to_goal            – ceil(remaining / avg_saving); 0 if reached
--   estimated_completion_date – projected date goal will be reached
--
-- Note: monthly_summary is also security_invoker, so the lateral
-- subquery is automatically scoped to the calling user's data.
create or replace view goal_progress
  with (security_invoker = true)
as
select
  g.id,
  g.user_id,
  g.name,
  g.target_amount,
  g.current_amount,
  (g.target_amount - g.current_amount)::numeric(12, 2)                   as remaining_amount,
  g.start_date,
  round(
    g.current_amount / nullif(g.target_amount, 0) * 100,
    1
  )                                                                        as progress_pct,
  coalesce(agg.monthly_avg_saving, 0)::numeric(12, 2)                    as monthly_avg_saving,
  case
    when g.current_amount >= g.target_amount
      then 0
    when coalesce(agg.monthly_avg_saving, 0) > 0
      then ceil(
             (g.target_amount - g.current_amount) /
             agg.monthly_avg_saving
           )::int
    else null                                                              -- no saving history
  end                                                                      as months_to_goal,
  case
    when g.current_amount >= g.target_amount
      then current_date
    when coalesce(agg.monthly_avg_saving, 0) > 0
      then (
        current_date +
        (
          ceil(
            (g.target_amount - g.current_amount) /
            agg.monthly_avg_saving
          )::int * interval '1 month'
        )
      )::date
    else null
  end                                                                      as estimated_completion_date
from goals g
left join lateral (
  -- Use the trailing 6 months with positive savings.
  -- If fewer than 6 such months exist, avg over all available ones.
  select round(avg(savings)::numeric, 2) as monthly_avg_saving
  from (
    select savings
    from   monthly_summary ms
    where  ms.user_id = g.user_id
      and  ms.savings  > 0
    order by ms.month desc
    limit  6
  ) recent
) agg on true;


-- ============================================================
-- SECTION 5 – SEED / DEMO DATA
-- ============================================================
-- BEFORE RUNNING THIS SECTION:
--   1. Create a user (via app sign-up or Auth → Add user)
--   2. Copy their UUID from: Auth → Users → UID column
--   3. Replace <<YOUR_USER_UUID>> below  (keep the quotes)
--   4. Run this section in isolation (highlight + Run)
--
-- Data covers Feb – May 2026 across all four tables.
-- Transactions do NOT include 'month' – it is auto-generated.
-- ============================================================

do $$
declare
  uid uuid := '<<YOUR_USER_UUID>>';          -- ← replace this value
begin

  -- ── Goals ──────────────────────────────────────────────────
  insert into goals (user_id, name, target_amount, current_amount, start_date)
  values
    (uid, 'Property Deposit', 100000.00, 24500.00, '2025-01-01')
  on conflict do nothing;

  -- ── Balances – monthly snapshots ───────────────────────────
  -- Columns: liquidity_type | account_type
  --   Savings Account  → liquid      | saving
  --   Emergency Fund   → liquid      | saving
  --   Term Deposit     → long_term   | term_deposit
  --   Index Fund (ETF) → long_term   | investment
  insert into balances (user_id, month, account, liquidity_type, account_type, balance)
  values
    -- May 2026
    (uid, '2026-05', 'Savings Account',  'liquid',    'saving',       8500.00),
    (uid, '2026-05', 'Emergency Fund',   'liquid',    'saving',       6000.00),
    (uid, '2026-05', 'Term Deposit',     'long_term', 'term_deposit', 18000.00),
    (uid, '2026-05', 'Index Fund (ETF)', 'long_term', 'investment',   12400.00),
    -- April 2026
    (uid, '2026-04', 'Savings Account',  'liquid',    'saving',       7200.00),
    (uid, '2026-04', 'Emergency Fund',   'liquid',    'saving',       6000.00),
    (uid, '2026-04', 'Term Deposit',     'long_term', 'term_deposit', 16000.00),
    (uid, '2026-04', 'Index Fund (ETF)', 'long_term', 'investment',   11800.00),
    -- March 2026
    (uid, '2026-03', 'Savings Account',  'liquid',    'saving',       6100.00),
    (uid, '2026-03', 'Emergency Fund',   'liquid',    'saving',       6000.00),
    (uid, '2026-03', 'Term Deposit',     'long_term', 'term_deposit', 14000.00),
    (uid, '2026-03', 'Index Fund (ETF)', 'long_term', 'investment',   11200.00),
    -- February 2026
    (uid, '2026-02', 'Savings Account',  'liquid',    'saving',       5200.00),
    (uid, '2026-02', 'Emergency Fund',   'liquid',    'saving',       6000.00),
    (uid, '2026-02', 'Term Deposit',     'long_term', 'term_deposit', 12000.00),
    (uid, '2026-02', 'Index Fund (ETF)', 'long_term', 'investment',   10800.00)
  on conflict (user_id, month, account) do nothing;

  -- ── Budgets – May 2026 ─────────────────────────────────────
  insert into budgets (user_id, month, category, budget)
  values
    (uid, '2026-05', 'Rent',          1800.00),
    (uid, '2026-05', 'Groceries',      600.00),
    (uid, '2026-05', 'Transport',      200.00),
    (uid, '2026-05', 'Dining Out',     300.00),
    (uid, '2026-05', 'Entertainment',  150.00),
    (uid, '2026-05', 'Utilities',      180.00),
    (uid, '2026-05', 'Health',         100.00),
    (uid, '2026-05', 'Shopping',       250.00)
  on conflict (user_id, month, category) do nothing;

  -- ── Transactions ───────────────────────────────────────────
  -- 'month' column is omitted – it is auto-generated from 'date'.
  -- Amounts are signed: income > 0, expense < 0.

  -- May 2026
  insert into transactions (user_id, date, type, category, amount, note)
  values
    (uid, '2026-05-01', 'income',  'Salary',         5800.00, 'May salary'),
    (uid, '2026-05-12', 'income',  'Freelance',        800.00, 'Web project'),
    (uid, '2026-05-02', 'expense', 'Rent',           -1800.00, 'Monthly rent'),
    (uid, '2026-05-03', 'expense', 'Groceries',        -120.00, 'Weekly shop'),
    (uid, '2026-05-05', 'expense', 'Transport',         -45.00, 'Train pass'),
    (uid, '2026-05-07', 'expense', 'Dining Out',        -85.00, 'Dinner with friends'),
    (uid, '2026-05-08', 'expense', 'Groceries',        -110.00, 'Weekly shop'),
    (uid, '2026-05-10', 'expense', 'Entertainment',     -60.00, 'Cinema'),
    (uid, '2026-05-14', 'expense', 'Utilities',        -165.00, 'Electricity + internet'),
    (uid, '2026-05-15', 'expense', 'Health',            -90.00, 'Physio'),
    (uid, '2026-05-17', 'expense', 'Groceries',         -95.00, 'Weekly shop'),
    (uid, '2026-05-19', 'expense', 'Shopping',         -230.00, 'Shoes'),
    (uid, '2026-05-20', 'expense', 'Dining Out',        -72.00, 'Lunch'),
    (uid, '2026-05-22', 'expense', 'Transport',         -38.00, 'Uber'),
    (uid, '2026-05-24', 'expense', 'Groceries',        -105.00, 'Weekly shop'),
    (uid, '2026-05-25', 'expense', 'Entertainment',     -45.00, 'Streaming subs');

  -- April 2026
  insert into transactions (user_id, date, type, category, amount, note)
  values
    (uid, '2026-04-01', 'income',  'Salary',         5800.00, 'April salary'),
    (uid, '2026-04-25', 'income',  'Freelance',        500.00, 'Side project'),
    (uid, '2026-04-02', 'expense', 'Rent',           -1800.00, 'Monthly rent'),
    (uid, '2026-04-05', 'expense', 'Groceries',        -430.00, 'Groceries'),
    (uid, '2026-04-10', 'expense', 'Dining Out',       -190.00, 'Restaurants'),
    (uid, '2026-04-15', 'expense', 'Transport',        -120.00, 'Transport'),
    (uid, '2026-04-20', 'expense', 'Utilities',        -170.00, 'Utilities'),
    (uid, '2026-04-22', 'expense', 'Entertainment',    -200.00, 'Concert tickets');

  -- March 2026
  insert into transactions (user_id, date, type, category, amount, note)
  values
    (uid, '2026-03-01', 'income',  'Salary',         5800.00, 'March salary'),
    (uid, '2026-03-02', 'expense', 'Rent',           -1800.00, 'Monthly rent'),
    (uid, '2026-03-08', 'expense', 'Groceries',        -460.00, 'Groceries'),
    (uid, '2026-03-12', 'expense', 'Dining Out',       -140.00, 'Restaurants'),
    (uid, '2026-03-15', 'expense', 'Transport',        -110.00, 'Transport'),
    (uid, '2026-03-18', 'expense', 'Utilities',        -155.00, 'Utilities'),
    (uid, '2026-03-20', 'expense', 'Shopping',         -310.00, 'Clothes'),
    (uid, '2026-03-25', 'expense', 'Health',            -80.00, 'Dentist');

  -- February 2026
  insert into transactions (user_id, date, type, category, amount, note)
  values
    (uid, '2026-02-01', 'income',  'Salary',         5800.00, 'Feb salary'),
    (uid, '2026-02-02', 'expense', 'Rent',           -1800.00, 'Monthly rent'),
    (uid, '2026-02-08', 'expense', 'Groceries',        -390.00, 'Groceries'),
    (uid, '2026-02-12', 'expense', 'Dining Out',       -210.00, 'Valentines dinner'),
    (uid, '2026-02-15', 'expense', 'Transport',         -95.00, 'Transport'),
    (uid, '2026-02-18', 'expense', 'Utilities',        -160.00, 'Utilities'),
    (uid, '2026-02-22', 'expense', 'Shopping',         -180.00, 'Gifts');

end $$;

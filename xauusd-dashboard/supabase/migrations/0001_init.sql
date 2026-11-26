-- XAUUSD live dashboard schema
-- Public, read-only data: anon + authenticated roles get SELECT only.
-- All writes happen via the service_role key inside the sync-exness edge function,
-- which bypasses RLS by design (never expose the service_role key to the browser).

create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  exness_account_id text not null unique,
  label text not null default 'Main',
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table if not exists account_snapshots (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  balance numeric not null,
  equity numeric not null,
  used_margin numeric not null default 0,
  free_margin numeric not null default 0,
  unrealized_pnl numeric not null default 0,
  captured_at timestamptz not null default now()
);
create index if not exists account_snapshots_account_time
  on account_snapshots (account_id, captured_at desc);

create table if not exists positions (
  id text primary key, -- Exness position id
  account_id uuid not null references accounts(id) on delete cascade,
  instrument text not null,
  direction text not null check (direction in ('buy', 'sell')),
  volume numeric not null,
  open_price numeric not null,
  current_price numeric,
  unrealized_pnl numeric,
  opened_at timestamptz not null,
  is_open boolean not null default true,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists positions_account_open
  on positions (account_id, is_open);

create table if not exists deals (
  id text primary key, -- Exness deal id
  account_id uuid not null references accounts(id) on delete cascade,
  deal_type text not null check (deal_type in
    ('open', 'close', 'balance', 'null_compensation', 'admin_fee',
     'swap_fee', 'dividend', 'exness_dollar')),
  instrument text,
  direction text check (direction in ('buy', 'sell')),
  volume numeric,
  price numeric,
  profit numeric not null default 0,
  swap numeric not null default 0,
  commission numeric not null default 0,
  executed_at timestamptz not null
);
create index if not exists deals_account_time
  on deals (account_id, executed_at desc);

create table if not exists sync_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'error')),
  detail text
);

-- Row Level Security: public can read, nobody but service_role can write.
alter table accounts enable row level security;
alter table account_snapshots enable row level security;
alter table positions enable row level security;
alter table deals enable row level security;
alter table sync_log enable row level security;

create policy "public read accounts" on accounts
  for select using (true);
create policy "public read account_snapshots" on account_snapshots
  for select using (true);
create policy "public read positions" on positions
  for select using (true);
create policy "public read deals" on deals
  for select using (true);
-- sync_log is operational detail, not for the public dashboard: no select policy,
-- so only service_role (which bypasses RLS) can read or write it.

-- Scheduling the sync via pg_cron + pg_net is left commented out until the project
-- is provisioned and the edge function is deployed (see docs/OPEN_QUESTIONS.md).
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'sync-exness-every-minute',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/sync-exness',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--       'Content-Type', 'application/json'
--     )
--   );
--   $$
-- );

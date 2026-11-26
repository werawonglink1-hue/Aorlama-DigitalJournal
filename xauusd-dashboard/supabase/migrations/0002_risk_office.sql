-- Agent Office: account risk-watch center.
-- Scope, by design: this only OBSERVES and ALERTS. Nothing here ever modifies the
-- trading account (no SL/TP changes, no closing positions, no order placement).
-- Public read-only, same as the rest of this dashboard (see docs/SOP.md).

create table if not exists risk_rules (
  id text primary key,
  label text not null,
  description text not null,
  metric text not null,              -- machine name the evaluator understands
  comparator text not null check (comparator in ('lt', 'lte', 'gt', 'gte')),
  threshold numeric not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists risk_events (
  id bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  rule_id text not null references risk_rules(id),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  metric_value numeric,
  message text not null,
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists risk_events_account_open
  on risk_events (account_id, resolved_at);

alter table risk_rules enable row level security;
alter table risk_events enable row level security;

create policy "public read risk_rules" on risk_rules
  for select using (true);
create policy "public read risk_events" on risk_events
  for select using (true);

-- Default rules. Thresholds are generic starting points, not tuned to any
-- particular account size — adjust via a follow-up migration once there's real
-- trading history to calibrate against.
insert into risk_rules (id, label, description, metric, comparator, threshold, severity) values
  ('margin_level_warning', 'Margin level', 'Margin level has dropped below a safe buffer.', 'margin_level_pct', 'lt', 150, 'warning'),
  ('margin_level_critical', 'Margin level', 'Margin level is near margin-call territory.', 'margin_level_pct', 'lt', 100, 'critical'),
  ('drawdown_warning', 'Drawdown (30D)', 'Equity has fallen notably from its recent peak.', 'drawdown_pct_30d', 'gte', 10, 'warning'),
  ('drawdown_critical', 'Drawdown (30D)', 'Equity has fallen sharply from its recent peak.', 'drawdown_pct_30d', 'gte', 20, 'critical'),
  ('daily_loss_warning', 'Daily realized loss', 'Closed trades today are net negative beyond the default watch level.', 'daily_realized_pnl', 'lte', -100, 'warning')
on conflict (id) do nothing;

-- Scheduling evaluate-risk via pg_cron + pg_net, fully inside Supabase (cloud-only).
-- The function has verify_jwt = false (see supabase/config.toml) specifically so this
-- schedule never needs a secret embedded in a migration file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'evaluate-risk-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://vxwczzxrsxpgapffbzkj.supabase.co/functions/v1/evaluate-risk',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);

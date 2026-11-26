# Architecture

## Goal

A public, read-only "live trading room" style dashboard for one Exness account,
showing live positions, recent deals, an equity curve, and a 30-day results
breakdown — all served from cloud infrastructure only.

## Data flow

```
Exness (trading API)
      │  server-to-server only, credentials in Supabase secrets
      ▼
Supabase Edge Function  (supabase/functions/sync-exness)
  - runs on a schedule (pg_cron, see "Scheduling" below)
  - reads account overview / open positions / deals history
  - upserts into Postgres tables below, using the service_role key
      │
      ▼
Supabase Postgres (supabase/migrations/0001_init.sql)
  - accounts, account_snapshots, positions, deals, sync_log
  - Row Level Security: anon/authenticated roles get SELECT only
      │  Supabase Realtime (Postgres changes) + anon key, HTTPS only
      ▼
Static web dashboard (web/)
  - no backend of its own, no secrets, no server-rendering
  - reads via the Supabase JS client (anon key is safe to expose: RLS makes it
    read-only)
  - nothing persisted client-side: no localStorage/sessionStorage/IndexedDB;
    in-memory state only, discarded on tab close
```

Nothing in this chain touches a local machine. The only two cloud services involved
are GitHub (code, CI, and static hosting via GitHub Pages — live at
https://werawonglink1-hue.github.io/Aorlama-DigitalJournal/, deployed by
`.github/workflows/deploy-pages.yml` on every push to `web/`) and Supabase (database,
secrets, compute, realtime).

## Why Supabase

- One provider covers Postgres (persistent cloud storage), Edge Functions (serverless
  compute with secret environment variables — the "cloud secret manager"), Realtime
  (push updates to the browser without polling or client-side state), and Row Level
  Security (lets the anon key be public while still being read-only).
- Avoids standing up a separate always-on server, which would be another thing to
  secure and pay for.

## Scheduling the sync

Two cloud-only options, no local cron needed:

1. **pg_cron + pg_net inside Supabase** (recommended): a scheduled Postgres job calls
   the edge function's HTTPS URL directly. Fully contained in Supabase, nothing else to
   provision.
2. **GitHub Actions scheduled workflow**: a `schedule:` trigger calls the edge function
   URL. Still cloud-only (GitHub's hosted runners), useful if finer control over retries/
   alerting is wanted later.

`sync-exness` isn't deployed yet (it needs real Exness credentials — see
`OPEN_QUESTIONS.md`), so nothing is scheduled for it yet. `evaluate-risk` (below) is
deployed and scheduled via option 1.

## Agent Office (risk watch)

A second, independent piece: `supabase/functions/evaluate-risk` + `web/office.html`.

**Scope, by design: observe and alert only.** This never places, modifies, or closes
an order, and never touches SL/TP — it only reads rows already in Postgres
(`account_snapshots`, `positions`, `deals`) and writes `risk_events`. That boundary
was a deliberate choice (not a current limitation) when this was scoped, to keep any
account-watching agent strictly read-only, consistent with the rest of this project.

- `risk_rules` (seeded by `supabase/migrations/0002_risk_office.sql`): margin level,
  30-day drawdown, and daily realized loss, each with a warning/critical threshold.
  Generic starting points — recalibrate once there's real trading history.
- `evaluate-risk` runs every 5 minutes via the same pg_cron + pg_net pattern as above,
  computes each rule's metric from existing data, and opens/resolves rows in
  `risk_events` accordingly (one open event per breached rule at a time).
- `web/office.html` is a public read-only page (linked from the main dashboard) showing
  current rule status, the latest evaluation time, and alert history — no edit
  controls, since the site has no auth layer yet.

To change a threshold or add a rule, use a new migration (`insert`/`update` on
`risk_rules`) rather than an in-app editor, until this project has an authenticated
admin surface.

## Security notes

- The Exness API key/secret used by the edge function is **separate** from the OAuth
  connection Claude uses inside this chat (that one is scoped to the chat session and
  can't be reused by a standalone deployed function). See `OPEN_QUESTIONS.md`.
- `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) is only ever used inside the edge function,
  never shipped to the browser.
- `web/` only ever uses the anon key, which is safe to expose publicly because RLS
  policies restrict it to `SELECT`.
- No PII is collected; only the one authorized trading account's activity is mirrored.

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
are GitHub (code + CI) and Supabase (database, secrets, compute, realtime, and static
hosting via Supabase's own hosting or any static host the owner prefers — e.g. Vercel/
Netlify/Cloudflare Pages, all cloud).

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

The migration in this repo leaves the `cron.schedule(...)` call commented out until the
project is actually provisioned (see `OPEN_QUESTIONS.md`) and the edge function is
deployed.

## Security notes

- The Exness API key/secret used by the edge function is **separate** from the OAuth
  connection Claude uses inside this chat (that one is scoped to the chat session and
  can't be reused by a standalone deployed function). See `OPEN_QUESTIONS.md`.
- `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) is only ever used inside the edge function,
  never shipped to the browser.
- `web/` only ever uses the anon key, which is safe to expose publicly because RLS
  policies restrict it to `SELECT`.
- No PII is collected; only the one authorized trading account's activity is mirrored.

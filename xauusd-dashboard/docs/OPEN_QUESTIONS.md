# Open questions (blocking a fully live dashboard)

Per the SOP, these are things Claude Code would be guessing at, so they're left for the
project owner to decide. Everything else in the repo is usable/reviewable now.

## 1. GitHub repository — resolved

Using `werawonglink1-hue/aorlama-digitaljournal`, this project lives under
`xauusd-dashboard/` so the repo root stays free for other Aorlama projects.

## 2. Supabase project — resolved

Using the existing project `vxwczzxrsxpgapffbzkj` ("Aorlama-DigitalJournal Public",
region `ap-northeast-1`). The schema in `supabase/migrations/0001_init.sql` has been
applied. `web/config.js` is already wired to this project's URL and public
(read-only, RLS-enforced) key.

## 3. Exness integration for the *standalone* app — partly resolved

- **Account**: confirmed on `28000175334` (not `109915000` — that account was never
  authorized on this Claude.ai Exness connection, and attempting to switch to it broke
  the connection's Trading API scope entirely, temporarily leaving only Partner/IB
  tools available; reconnecting restored `trading.all:read` on `28000175334`). This is
  the account the dashboard is wired to. It currently has balance `0`, equity `0`, no
  open positions or deals — real data, just an inactive account for now. One manual
  snapshot was seeded (`accounts` + `account_snapshots` rows) via `execute_sql` on
  2026-11-26 to prove the schema/RLS/frontend pipeline end-to-end; the dashboard will
  show $0 / no activity until the account actually trades.
- **Still open: the deployed edge function needs its own Exness credentials**, separate
  from the OAuth connection this chat uses (that one is scoped to the chat session and
  can't be reused by a standalone deployed function — it also appears to only support
  one active scope, Trading *or* Partner, at a time, per the incident above). Needed:
  the Exness API base URL/auth scheme, and an API key/secret for account
  `28000175334`, to be stored only as a Supabase secret (`supabase secrets set` or the
  `create_edge_function_secret` tool) — never in code or the repo.
  `supabase/functions/sync-exness/index.ts` is structured so this is a single,
  clearly-marked block (`fetchAccountOverview` / `fetchOpenPositions` /
  `fetchRecentDeals`) to fill in once these are confirmed. The function has not been
  deployed yet since it would only fail until this is filled in — until then, the
  dashboard only reflects whatever was last manually seeded, not live data.

## What's already done

- GitHub repo + Supabase project wired together (see above)
- Postgres schema + RLS policies, applied to the live project
- Static read-only dashboard frontend (`web/`), pointed at the real project
- One real (zero-activity) snapshot seeded for account `28000175334`
- Edge function skeleton with the Exness call site clearly marked as TODO
- Docs: architecture, SOP, collaboration workflow
- Codespaces dev container config, CI secret-leak check

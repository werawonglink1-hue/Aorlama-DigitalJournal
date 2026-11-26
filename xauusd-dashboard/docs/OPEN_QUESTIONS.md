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

## 3. Exness integration for the *standalone* app — still open

- **Account switch to #109915000 ("FOCUS") is not possible yet.** This chat's Exness
  connection is only authorized for account `28000175334` (which has zero balance and
  no activity). `trading_get_authorized_accounts` does not list `109915000`. To use
  that account, the Exness connector authorization for this Claude.ai connection needs
  to be updated/re-consented to include it (connector settings → Exness → update
  authorized accounts). Once it shows up in `trading_get_authorized_accounts`, Claude
  Code can re-check the live data shape against it.
- **The deployed edge function still needs its own Exness credentials**, separate from
  the OAuth connection this chat uses (that one is scoped to the chat session and can't
  be reused by a standalone deployed function). Needed: the Exness API base URL/auth
  scheme, and an API key/secret for account `109915000`, to be stored only as a
  Supabase secret (`supabase secrets set` or the `create_edge_function_secret` tool) —
  never in code or the repo. `supabase/functions/sync-exness/index.ts` is structured so
  this is a single, clearly-marked block (`fetchAccountOverview` /
  `fetchOpenPositions` / `fetchRecentDeals`) to fill in once these are confirmed.
  The function has not been deployed yet since it would only fail until this is filled
  in.

## What's already done

- GitHub repo + Supabase project wired together (see above)
- Postgres schema + RLS policies, applied to the live project
- Static read-only dashboard frontend (`web/`), pointed at the real project
- Edge function skeleton with the Exness call site clearly marked as TODO
- Docs: architecture, SOP, collaboration workflow
- Codespaces dev container config, CI secret-leak check

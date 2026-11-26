# Working with Codex GPT + Claude Code

This repo is the shared source of truth between Codex GPT and Claude Code, because
neither assistant sees the other's conversation history.

- **Codex GPT**: planning, architecture decisions, task breakdown, acceptance criteria,
  reviewing changes.
- **Claude Code**: implementing and fixing code against assigned tasks/issues.
- Decisions and work status are recorded in this `docs/` folder and in GitHub
  issues/PRs — not left in chat.
- Work is split into issues/branches. Codex GPT reviews the diff/PR before merge.
  Don't edit the same files at the same time without coordinating through an issue.

## Current state (2026-11-26)

No Codex GPT session has touched this repo yet. Claude Code did the initial planning
*and* implementation in one pass, since no Codex GPT session was available when this
was scaffolded — see `OPEN_QUESTIONS.md` for what's still undecided. When Codex GPT
picks this up, start by reading `docs/ARCHITECTURE.md` and `docs/OPEN_QUESTIONS.md`.

## Suggested issue/branch breakdown going forward

1. `infra/supabase-project` — provision + configure the Supabase project (blocked, see
   open questions)
2. `infra/exness-sync` — fill in the real Exness API integration in the edge function
3. `feat/dashboard-ui` — iterate on the frontend beyond the initial scaffold
4. `ops/scheduling` — wire up the sync schedule (pg_cron vs. external scheduler)

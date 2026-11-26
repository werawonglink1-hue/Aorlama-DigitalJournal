# XAUUSD Live Dashboard (cloud-only)

A read-only live monitoring dashboard for XAUUSD (gold) trading activity, inspired by
the "trading room" style of xauusd.lifehacktrader.com, backed by a connected Exness
account.

**Everything in this project runs in cloud services only.** No project files, trading
data, or credentials are ever stored on a local machine or in browser storage. See
[`docs/SOP.md`](docs/SOP.md) for the full policy and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for how the pieces fit together.

## Status

This repo was scaffolded by Claude Code. Several things are **blocked on the project
owner** before this becomes a live, deployed dashboard — see
[`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md). Everything else (schema, edge
function skeleton, frontend, docs, dev workflow) is ready for review.

## Layout

```
docs/                   Architecture, SOP, collaboration workflow, open questions
supabase/migrations/    Postgres schema (accounts, snapshots, positions, deals)
supabase/functions/     Edge Function that syncs Exness -> Supabase on a schedule
web/                    Static, read-only dashboard (no build step, no local storage)
.devcontainer/          Cloud dev workspace config (GitHub Codespaces)
```

## Working with this repo (Codex GPT + Claude Code)

See [`docs/COLLABORATION.md`](docs/COLLABORATION.md). Short version: GitHub issues/PRs
and the `docs/` folder are the shared source of truth, because the two assistants don't
see each other's chat history.

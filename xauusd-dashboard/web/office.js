// Agent Office — risk-watch client. Read-only, same rules as app.js (no
// localStorage/sessionStorage/IndexedDB, in-memory state only, anon key is
// read-only via RLS). This page never calls anything that modifies the account —
// it only displays risk_rules / risk_events / sync_log already written by the
// evaluate-risk edge function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let config;
try {
  config = await import("./config.js");
} catch {
  console.warn("config.js not found — see config.example.js.");
}

const el = (id) => document.getElementById(id);
const fmtUsd = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function tickClock() {
  const bkk = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  el("clock").textContent = bkk.toLocaleTimeString("en-GB", { hour12: false }) + " BKK";
}
tickClock();
setInterval(tickClock, 1000);

function setConnectionState(live) {
  el("statusDot").classList.toggle("live", live);
  el("connectionNote").textContent = live ? "live" : "connecting…";
}

function renderRules(rules, openEventsByRule) {
  const grid = el("rulesGrid");
  if (rules.length === 0) {
    grid.innerHTML = `<div class="muted">No risk rules configured.</div>`;
    return;
  }
  grid.innerHTML = rules
    .map((r) => {
      const open = openEventsByRule.get(r.id);
      const status = open ? open.severity : "ok";
      const valueText = open?.metric_value != null ? Number(open.metric_value).toFixed(2) : "—";
      return `
      <div class="rule-card">
        <div class="label">${r.label}</div>
        <div class="desc">${r.description}</div>
        <div class="foot">
          <span class="status-badge ${status}">${status.toUpperCase()}</span>
          <span class="value">${valueText !== "—" ? valueText : `threshold ${r.threshold}`}</span>
        </div>
      </div>`;
    })
    .join("");
}

function renderEvents(events) {
  const list = el("eventsList");
  if (events.length === 0) {
    list.innerHTML = `<li class="empty">No alerts recorded — nothing has breached a risk rule yet</li>`;
    return;
  }
  list.innerHTML = events
    .map(
      (e) => `
      <li class="${e.resolved_at ? "resolved" : ""}">
        <span class="sev ${e.severity}">${e.severity}</span>
        <span>${e.message}</span>
        <span class="muted" style="margin-left:auto">
          ${new Date(e.triggered_at).toLocaleString()}${e.resolved_at ? " · resolved" : ""}
        </span>
      </li>`,
    )
    .join("");
}

function renderOverall(openEvents) {
  const badge = el("overallStatus");
  if (openEvents.some((e) => e.severity === "critical")) {
    badge.textContent = "CRITICAL";
    badge.className = "v status-badge critical";
  } else if (openEvents.some((e) => e.severity === "warning")) {
    badge.textContent = "WARNING";
    badge.className = "v status-badge warning";
  } else {
    badge.textContent = "OK";
    badge.className = "v status-badge ok";
  }
}

async function loadAll(client) {
  const { data: rules } = await client.from("risk_rules").select("*").eq("enabled", true);

  const { data: events } = await client
    .from("risk_events")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(50);

  const { data: lastLog } = await client
    .from("sync_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const openEvents = (events ?? []).filter((e) => !e.resolved_at);
  const openByRule = new Map(openEvents.map((e) => [e.rule_id, e]));

  renderRules(rules ?? [], openByRule);
  renderEvents(events ?? []);
  renderOverall(openEvents);
  el("lastRun").textContent = lastLog ? new Date(lastLog.ran_at).toLocaleString() : "not yet run";
}

async function main() {
  if (!config) {
    el("connectionNote").textContent = "missing config.js";
    return;
  }
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  await loadAll(client);
  setConnectionState(true);

  client
    .channel("public:agent-office")
    .on("postgres_changes", { event: "*", schema: "public", table: "risk_events" }, () => loadAll(client))
    .on("postgres_changes", { event: "*", schema: "public", table: "sync_log" }, () => loadAll(client))
    .subscribe((status) => setConnectionState(status === "SUBSCRIBED"));
}

main();

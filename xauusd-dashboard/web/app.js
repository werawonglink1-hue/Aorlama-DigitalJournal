// Read-only dashboard client.
//
// Per docs/SOP.md: no localStorage/sessionStorage/IndexedDB/cache — every piece of
// state below lives only in this module's in-memory variables for the lifetime of
// the tab, and is thrown away on reload/close. Nothing is ever written back to
// Supabase from this file (the anon key is read-only, enforced by RLS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let config;
try {
  config = await import("./config.js");
} catch {
  console.warn(
    "config.js not found — copy config.example.js to config.js and fill in your " +
      "Supabase project URL + anon key before deploying.",
  );
}

const state = {
  account: null,
  snapshots: [],
  positions: [],
  deals: [],
  periodDays: 30,
};

const el = (id) => document.getElementById(id);
const fmtUsd = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const signClass = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");

function setConnectionState(live) {
  el("statusDot").classList.toggle("live", live);
  el("connectionNote").textContent = live
    ? "Live — connected to Supabase Realtime"
    : "Connecting…";
}

function renderOverview() {
  const latest = state.snapshots.at(-1);
  el("statBalance").textContent = fmtUsd(latest?.balance);
  el("statEquity").textContent = fmtUsd(latest?.equity);
  const pnlEl = el("statPnl");
  pnlEl.textContent = fmtUsd(latest?.unrealized_pnl);
  pnlEl.className = `value ${signClass(latest?.unrealized_pnl ?? 0)}`;
}

function renderEquityChart() {
  const canvas = el("equityChart");
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const points = state.snapshots.slice(-200).map((s) => Number(s.equity));
  if (points.length < 2) return;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  ctx.beginPath();
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 2;
  points.forEach((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 10) - 5;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderPositions() {
  const body = el("positionsBody");
  const open = state.positions.filter((p) => p.is_open);
  if (open.length === 0) {
    body.innerHTML = `<tr class="empty"><td colspan="6">No open positions</td></tr>`;
    return;
  }
  body.innerHTML = open
    .map(
      (p) => `
      <tr>
        <td>${p.direction.toUpperCase()}</td>
        <td>${p.volume}</td>
        <td>${fmtUsd(p.open_price)}</td>
        <td>${fmtUsd(p.current_price)}</td>
        <td class="${signClass(p.unrealized_pnl)}">${fmtUsd(p.unrealized_pnl)}</td>
        <td>${new Date(p.opened_at).toLocaleString()}</td>
      </tr>`,
    )
    .join("");
}

function renderFeed() {
  const list = el("feedList");
  const items = state.deals.slice(0, 30);
  if (items.length === 0) {
    list.innerHTML = `<li class="empty">No activity in this period</li>`;
    return;
  }
  list.innerHTML = items
    .map(
      (d) => `
      <li>
        <strong>${d.deal_type}</strong>
        ${d.instrument ?? ""} ${d.direction ?? ""}
        ${d.profit ? `<span class="${signClass(d.profit)}">${fmtUsd(d.profit)}</span>` : ""}
        — ${new Date(d.executed_at).toLocaleString()}
      </li>`,
    )
    .join("");
}

function renderSummary() {
  el("summaryTitle").textContent = `${state.periodDays}-day results`;
  const closed = state.deals.filter((d) => d.deal_type === "close");
  const net = closed.reduce((sum, d) => sum + Number(d.profit ?? 0), 0);
  const wins = closed.filter((d) => Number(d.profit ?? 0) > 0).length;
  const netEl = el("summaryNet");
  netEl.textContent = fmtUsd(net);
  netEl.className = `value ${signClass(net)}`;
  el("summaryCount").textContent = String(closed.length);
  el("summaryWinRate").textContent =
    closed.length > 0 ? `${Math.round((wins / closed.length) * 100)}%` : "—";
}

function renderAll() {
  renderOverview();
  renderEquityChart();
  renderPositions();
  renderFeed();
  renderSummary();
}

async function loadPeriod(client, accountId, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: snapshots } = await client
    .from("account_snapshots")
    .select("*")
    .eq("account_id", accountId)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  state.snapshots = snapshots ?? [];

  const { data: positions } = await client
    .from("positions")
    .select("*")
    .eq("account_id", accountId);
  state.positions = positions ?? [];

  const { data: deals } = await client
    .from("deals")
    .select("*")
    .eq("account_id", accountId)
    .gte("executed_at", since)
    .order("executed_at", { ascending: false });
  state.deals = deals ?? [];

  renderAll();
}

async function main() {
  if (!config) {
    el("connectionNote").textContent =
      "Missing web/config.js — see config.example.js.";
    return;
  }

  const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  const { data: account, error } = await client.from("accounts").select("*").limit(1).single();
  if (error || !account) {
    el("connectionNote").textContent = "No account data yet.";
    return;
  }
  state.account = account;

  await loadPeriod(client, account.id, state.periodDays);
  setConnectionState(true);

  client
    .channel("public:dashboard")
    .on("postgres_changes", { event: "*", schema: "public", table: "account_snapshots" }, () =>
      loadPeriod(client, account.id, state.periodDays),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "positions" }, () =>
      loadPeriod(client, account.id, state.periodDays),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () =>
      loadPeriod(client, account.id, state.periodDays),
    )
    .subscribe((status) => setConnectionState(status === "SUBSCRIBED"));

  el("periodSelect").addEventListener("change", (e) => {
    state.periodDays = Number(e.target.value);
    loadPeriod(client, account.id, state.periodDays);
  });
}

main();

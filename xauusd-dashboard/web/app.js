// Read-only HUD dashboard client.
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

// ---- Top bar clock + session tag (cosmetic, computed client-side, no storage) ----
function tickClock() {
  const now = new Date();
  const bkk = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  el("clock").textContent = bkk.toLocaleTimeString("en-GB", { hour12: false }) + " BKK";
  el("bkkTime").textContent = bkk.toLocaleTimeString("en-GB", { hour12: false });

  const h = now.getUTCHours();
  let session = "ASIA";
  if (h >= 7 && h < 12) session = "LONDON";
  else if (h >= 12 && h < 16) session = "LONDON/NY";
  else if (h >= 16 && h < 21) session = "NEW YORK";
  el("sessionTag").textContent = session;
}
tickClock();
setInterval(tickClock, 1000);

function setConnectionState(live) {
  el("statusDot").classList.toggle("live", live);
  el("connectionNote").textContent = live ? "live" : "connecting…";
}

function setGauge(gaugeEl, pct, color) {
  const clamped = Math.max(0, Math.min(100, pct));
  gaugeEl.style.setProperty("--pct", String(clamped));
  if (color) gaugeEl.style.setProperty("--gauge-color", color);
}

function renderOverview() {
  const latest = state.snapshots.at(-1);
  const balance = Number(latest?.balance ?? 0);
  const equity = Number(latest?.equity ?? 0);
  const pnl = Number(latest?.unrealized_pnl ?? 0);

  el("accountId").textContent = state.account?.exness_account_id ?? "—";
  el("statBalance").textContent = fmtUsd(balance);
  el("statFreeMargin").textContent = fmtUsd(latest?.free_margin);
  el("statEquity").textContent = fmtUsd(equity);

  const equityPct = balance > 0 ? (equity / balance) * 100 : 0;
  setGauge(el("equityGauge"), equityPct);

  const pnlEl = el("statPnl");
  pnlEl.textContent = fmtUsd(pnl);
  pnlEl.className = `v big ${signClass(pnl)}`;

  const gaugePct = equity > 0 ? Math.min(100, (Math.abs(pnl) / Math.max(equity, 1)) * 100 * 5) : 0;
  setGauge(el("pnlGauge"), gaugePct, pnl < 0 ? "var(--down)" : "var(--up)");
  el("gaugePnlValue").textContent = fmtUsd(pnl);
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
  ctx.strokeStyle = "#2fe5ff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#2fe5ff";
  ctx.shadowBlur = 6;
  points.forEach((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderPositions() {
  const body = el("positionsBody");
  const open = state.positions.filter((p) => p.is_open);
  el("statOpenCount").textContent = String(open.length);
  el("posCount").textContent = String(open.length);

  if (open.length === 0) {
    body.innerHTML = `<tr class="empty"><td colspan="6">No open positions</td></tr>`;
    return;
  }
  body.innerHTML = open
    .map(
      (p) => `
      <tr>
        <td class="${p.direction === "buy" ? "up" : "down"}">${p.direction.toUpperCase()}</td>
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
        <span style="color:var(--muted)">· ${new Date(d.executed_at).toLocaleTimeString()}</span>
      </li>`,
    )
    .join("");
}

function renderSummary() {
  el("summaryTitle").textContent = `${state.periodDays}D net`;
  const closed = state.deals.filter((d) => d.deal_type === "close");
  const net = closed.reduce((sum, d) => sum + Number(d.profit ?? 0), 0);
  const wins = closed.filter((d) => Number(d.profit ?? 0) > 0).length;
  const netEl = el("summaryNet");
  netEl.textContent = fmtUsd(net);
  netEl.className = `v big ${signClass(net)}`;
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
    el("connectionNote").textContent = "missing config.js";
    return;
  }

  const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  const { data: account, error } = await client.from("accounts").select("*").limit(1).single();
  if (error || !account) {
    el("connectionNote").textContent = "no account data yet";
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

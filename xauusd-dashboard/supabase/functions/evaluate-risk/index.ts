// supabase/functions/evaluate-risk/index.ts
//
// "Agent Office" risk-watch center. This function only READS already-synced data
// (account_snapshots / positions / deals) and WRITES risk_events — it never touches
// the trading account itself (no SL/TP changes, no closing positions, no orders).
// That boundary is deliberate: see docs/ARCHITECTURE.md "Agent Office".
//
// Runs on a schedule via pg_cron + pg_net (see supabase/migrations/0002_risk_office.sql).
// verify_jwt is false for this function (see supabase/config.toml) so the schedule
// doesn't need a secret embedded in a migration file; it only ever reads/writes rows
// that are already public-readable on this dashboard.

import { createClient } from "jsr:@supabase/supabase-js@2";

interface RiskRule {
  id: string;
  label: string;
  description: string;
  metric: "margin_level_pct" | "drawdown_pct_30d" | "daily_realized_pnl";
  comparator: "lt" | "lte" | "gt" | "gte";
  threshold: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
}

function breaches(value: number, comparator: RiskRule["comparator"], threshold: number): boolean {
  switch (comparator) {
    case "lt": return value < threshold;
    case "lte": return value <= threshold;
    case "gt": return value > threshold;
    case "gte": return value >= threshold;
  }
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: rules, error: rulesErr } = await supabase
    .from("risk_rules")
    .select("*")
    .eq("enabled", true);
  if (rulesErr) {
    return new Response(JSON.stringify({ ok: false, error: rulesErr.message }), { status: 500 });
  }

  const { data: accounts, error: accErr } = await supabase.from("accounts").select("id");
  if (accErr) {
    return new Response(JSON.stringify({ ok: false, error: accErr.message }), { status: 500 });
  }

  const summary: Record<string, unknown>[] = [];

  for (const account of accounts ?? []) {
    const accountId = account.id as string;

    const { data: latestSnap } = await supabase
      .from("account_snapshots")
      .select("*")
      .eq("account_id", accountId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: snaps30d } = await supabase
      .from("account_snapshots")
      .select("equity, captured_at")
      .eq("account_id", accountId)
      .gte("captured_at", since30d);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { data: todaysDeals } = await supabase
      .from("deals")
      .select("profit, deal_type")
      .eq("account_id", accountId)
      .eq("deal_type", "close")
      .gte("executed_at", startOfDay.toISOString());

    const equity = Number(latestSnap?.equity ?? 0);
    const usedMargin = Number(latestSnap?.used_margin ?? 0);
    const peakEquity = (snaps30d ?? []).reduce((max, s) => Math.max(max, Number(s.equity)), 0);
    const dailyRealizedPnl = (todaysDeals ?? []).reduce((sum, d) => sum + Number(d.profit ?? 0), 0);

    const metrics: Record<RiskRule["metric"], number | null> = {
      margin_level_pct: usedMargin > 0 ? (equity / usedMargin) * 100 : null,
      drawdown_pct_30d: peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0,
      daily_realized_pnl: dailyRealizedPnl,
    };

    for (const rule of (rules ?? []) as RiskRule[]) {
      const value = metrics[rule.metric];

      const { data: openEvent } = await supabase
        .from("risk_events")
        .select("id")
        .eq("account_id", accountId)
        .eq("rule_id", rule.id)
        .is("resolved_at", null)
        .maybeSingle();

      const isBreached = value != null && breaches(value, rule.comparator, rule.threshold);

      if (isBreached && !openEvent) {
        await supabase.from("risk_events").insert({
          account_id: accountId,
          rule_id: rule.id,
          severity: rule.severity,
          metric_value: value,
          message: `${rule.description} (value: ${value?.toFixed(2)}, threshold: ${rule.threshold})`,
        });
      } else if (!isBreached && openEvent) {
        await supabase
          .from("risk_events")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", openEvent.id);
      }

      summary.push({ account_id: accountId, rule: rule.id, value, breached: isBreached });
    }
  }

  await supabase.from("sync_log").insert({
    status: "ok",
    detail: `risk evaluation: ${summary.filter((s) => s.breached).length}/${summary.length} rules breached`,
  });

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { "content-type": "application/json" },
  });
});

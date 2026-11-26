// supabase/functions/sync-exness/index.ts
//
// Pulls account overview + open positions + recent deals from Exness and upserts
// them into Supabase. Runs server-side only, inside Supabase's cloud — never on a
// local machine. All secrets below come from `supabase secrets set` (or the MCP
// create_edge_function_secret tool), never from code, logs, or the repo.
//
// Required secrets (set these before deploying — see docs/OPEN_QUESTIONS.md):
//   EXNESS_ACCOUNT_ID     the trading account id to mirror
//   EXNESS_API_BASE       base URL of the Exness API this function should call
//   EXNESS_API_KEY        credential for that API
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
//   Supabase for edge functions — do not set them yourself.)

import { createClient } from "jsr:@supabase/supabase-js@2";

interface AccountOverview {
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  unrealizedPnl: number;
}

interface PositionRow {
  id: string;
  instrument: string;
  direction: "buy" | "sell";
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  openedAt: string;
}

interface DealRow {
  id: string;
  dealType: string;
  instrument: string | null;
  direction: "buy" | "sell" | null;
  volume: number | null;
  price: number | null;
  profit: number;
  swap: number;
  commission: number;
  executedAt: string;
}

// ---------------------------------------------------------------------------
// TODO (blocked on docs/OPEN_QUESTIONS.md #3): replace these three functions
// with real calls to the Exness API once the base URL / auth scheme / account
// are confirmed. The OAuth connection this chat session uses to read Exness
// data cannot be reused here — this function needs its own credentials.
// Do not fill these in with guessed endpoints; leave them failing loudly
// (as they do now) until the real spec is provided.
// ---------------------------------------------------------------------------
async function fetchAccountOverview(
  _apiBase: string,
  _apiKey: string,
  _accountId: string,
): Promise<AccountOverview> {
  throw new Error(
    "fetchAccountOverview: Exness API base URL / auth scheme not yet configured. " +
      "See docs/OPEN_QUESTIONS.md #3.",
  );
}

async function fetchOpenPositions(
  _apiBase: string,
  _apiKey: string,
  _accountId: string,
): Promise<PositionRow[]> {
  throw new Error(
    "fetchOpenPositions: Exness API base URL / auth scheme not yet configured. " +
      "See docs/OPEN_QUESTIONS.md #3.",
  );
}

async function fetchRecentDeals(
  _apiBase: string,
  _apiKey: string,
  _accountId: string,
  _sinceIso: string,
): Promise<DealRow[]> {
  throw new Error(
    "fetchRecentDeals: Exness API base URL / auth scheme not yet configured. " +
      "See docs/OPEN_QUESTIONS.md #3.",
  );
}
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const exnessAccountId = Deno.env.get("EXNESS_ACCOUNT_ID");
  const exnessApiBase = Deno.env.get("EXNESS_API_BASE");
  const exnessApiKey = Deno.env.get("EXNESS_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !exnessAccountId || !exnessApiBase || !exnessApiKey) {
    return new Response(
      JSON.stringify({ error: "Missing required secrets. See docs/OPEN_QUESTIONS.md #3." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: account, error: accountErr } = await supabase
      .from("accounts")
      .upsert(
        { exness_account_id: exnessAccountId },
        { onConflict: "exness_account_id" },
      )
      .select()
      .single();
    if (accountErr) throw accountErr;

    const overview = await fetchAccountOverview(exnessApiBase, exnessApiKey, exnessAccountId);
    const { error: snapErr } = await supabase.from("account_snapshots").insert({
      account_id: account.id,
      balance: overview.balance,
      equity: overview.equity,
      used_margin: overview.usedMargin,
      free_margin: overview.freeMargin,
      unrealized_pnl: overview.unrealizedPnl,
    });
    if (snapErr) throw snapErr;

    const positions = await fetchOpenPositions(exnessApiBase, exnessApiKey, exnessAccountId);
    await supabase.from("positions").update({ is_open: false }).eq("account_id", account.id);
    if (positions.length > 0) {
      const { error: posErr } = await supabase.from("positions").upsert(
        positions.map((p) => ({
          id: p.id,
          account_id: account.id,
          instrument: p.instrument,
          direction: p.direction,
          volume: p.volume,
          open_price: p.openPrice,
          current_price: p.currentPrice,
          unrealized_pnl: p.unrealizedPnl,
          opened_at: p.openedAt,
          is_open: true,
          updated_at: new Date().toISOString(),
        })),
      );
      if (posErr) throw posErr;
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const deals = await fetchRecentDeals(exnessApiBase, exnessApiKey, exnessAccountId, since);
    if (deals.length > 0) {
      const { error: dealErr } = await supabase.from("deals").upsert(
        deals.map((d) => ({
          id: d.id,
          account_id: account.id,
          deal_type: d.dealType,
          instrument: d.instrument,
          direction: d.direction,
          volume: d.volume,
          price: d.price,
          profit: d.profit,
          swap: d.swap,
          commission: d.commission,
          executed_at: d.executedAt,
        })),
      );
      if (dealErr) throw dealErr;
    }

    await supabase.from("sync_log").insert({ status: "ok" });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    await supabase.from("sync_log").insert({
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

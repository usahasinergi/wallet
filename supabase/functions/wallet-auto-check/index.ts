import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CHAINS: Record<string, { symbol: string; type: string; rpc?: string }> = {
  ethereum: { symbol: "ETH", type: "evm", rpc: "https://ethereum-rpc.publicnode.com" },
  bsc: { symbol: "BNB", type: "evm", rpc: "https://bsc-rpc.publicnode.com" },
  polygon: { symbol: "POL", type: "evm", rpc: "https://polygon-bor-rpc.publicnode.com" },
  arbitrum: { symbol: "ETH", type: "evm", rpc: "https://arb1.arbitrum.io/rpc" },
  base: { symbol: "ETH", type: "evm", rpc: "https://mainnet.base.org" },
  bitcoin: { symbol: "BTC", type: "btc" },
  solana: { symbol: "SOL", type: "sol" },
  tron: { symbol: "TRX", type: "tron" },
};

function formatBalance(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Saldo tidak valid");
  return value.toFixed(8).replace(/\.?0+$/, "") || "0";
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return await response.json();
}

async function rpc(url: string, method: string, params: unknown[] = []): Promise<any> {
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (data.error) throw new Error(data.error.message || "RPC error");
  return data.result;
}

async function getBalance(wallet: any): Promise<number> {
  const chain = CHAINS[wallet.chain];
  if (!chain) throw new Error("Jaringan tidak didukung");
  if (chain.type === "evm") {
    const hex = await rpc(chain.rpc!, "eth_getBalance", [wallet.address, "latest"]);
    return Number(BigInt(hex)) / 1e18;
  }
  if (chain.type === "btc") {
    const data = await fetchJson("https://mempool.space/api/address/" + encodeURIComponent(wallet.address));
    const stats = data.chain_stats;
    const mempool = data.mempool_stats;
    return (stats.funded_txo_sum - stats.spent_txo_sum + mempool.funded_txo_sum - mempool.spent_txo_sum) / 1e8;
  }
  if (chain.type === "sol") {
    const data = await rpc("https://api.mainnet-beta.solana.com", "getBalance", [wallet.address]);
    return data.value / 1e9;
  }
  if (chain.type === "tron") {
    const data = await fetchJson("https://api.trongrid.io/v1/accounts/" + encodeURIComponent(wallet.address));
    return Number(data.data?.[0]?.balance || 0) / 1e6;
  }
  throw new Error("Tipe jaringan tidak dikenal");
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  try {
    const token = req.headers.get("x-wallet-cron-secret") || "";
    const auth = await db.rpc("wallet_auto_check_verify_token", { p_token: token });
    if (auth.error || auth.data !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const due = await db.rpc("wallet_auto_check_due_users");
    if (due.error) throw due.error;
    const results: any[] = [];

    for (const userId of (due.data || []) as string[]) {
      const claim = await db.rpc("wallet_auto_check_claim", { p_user_id: userId, p_batch_size: 200 });
      if (claim.error) {
        results.push({ user_id: userId, status: "claim_error", error: claim.error.message });
        continue;
      }
      const job = claim.data || {};
      if (job.status !== "processing") {
        results.push({ user_id: userId, status: job.status, next_run_at: job.next_run_at });
        continue;
      }

      const wallets = (job.wallets || []) as any[];
      const checkedAt = job.checked_at;
      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      await mapLimit(wallets, 16, async (wallet) => {
        try {
          const balance = await getBalance(wallet);
          const update = await db.from("wallets")
            .update({ balance_text: formatBalance(balance), checked_at: checkedAt })
            .eq("id", wallet.id).eq("user_id", userId);
          if (update.error) throw update.error;
          const history = await db.from("wallet_balance_history").upsert({
            wallet_id: wallet.id,
            asset_symbol: CHAINS[wallet.chain].symbol,
            balance: String(balance),
            checked_at: checkedAt,
          }, { onConflict: "wallet_id,checked_at" });
          if (history.error) throw history.error;
          success++;
        } catch (error) {
          failed++;
          if (errors.length < 8) errors.push(wallet.chain + ": " + (error instanceof Error ? error.message : String(error)));
        }
      });

      const errorText = errors.join(" | ");
      const attempt = Number(job.attempt || 1);
      if (failed > 0 && attempt < 3) {
        const release = await db.rpc("wallet_auto_check_release", {
          p_user_id: userId, p_error: "Percobaan " + attempt + "/3: " + errorText,
        });
        results.push({ user_id: userId, status: release.error ? "release_error" : "retry_scheduled",
          processed: wallets.length, success, failed, attempt, error: release.error?.message });
      } else {
        const complete = await db.rpc("wallet_auto_check_complete", {
          p_user_id: userId, p_success_count: success, p_failed_count: failed, p_error: errorText,
        });
        results.push({ user_id: userId, status: complete.data?.status || (complete.error ? "complete_error" : "batch_complete"),
          processed: wallets.length, success, failed, attempt, error: complete.error?.message, totals: complete.data });
      }
    }
    return Response.json({ ok: true, batch_size: 200, results });
  } catch (error) {
    console.error("wallet-auto-check error", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

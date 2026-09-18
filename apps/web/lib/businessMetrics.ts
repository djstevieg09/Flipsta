/**
 * 26 Aug 2026, Steven: "need this to show me exactly where the buisness
 * is" + "i need graphs, i need new signups." Shared between the admin
 * overview page (server component, direct DB access) and
 * GET /api/admin/business-metrics (for any future client-side consumer) so
 * the bucketing logic exists in exactly one place.
 */
const DAYS = 14;

function dayKey(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD" — plain string bucketing, no timezone library needed
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export type BusinessMetrics = {
  dailySignups: { date: string; count: number }[];
  dailyRevenueGBP: { date: string; gbp: number }[];
  signupsLast7: number;
  signupsPrev7: number;
  revenueLast7GBP: number;
  revenuePrev7GBP: number;
  activeResellers: number;
};

export async function getBusinessMetrics(supabase: any): Promise<BusinessMetrics> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (DAYS - 1));
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [{ data: signups }, { data: orders }, { data: shopSales }, { data: wins }, { data: coinPurchases }, { count: totalResellers }] = await Promise.all([
    supabase.from("profiles").select("created_at").gte("created_at", sinceIso),
    supabase.from("orders").select("price_gbp, created_at").gte("created_at", sinceIso),
    supabase.from("shop_items").select("sold_price_gbp, paid_at").not("paid_at", "is", null).gte("paid_at", sinceIso),
    supabase.from("bids").select("amount_gbp, created_at, is_instant_win").gte("created_at", sinceIso),
    // 18 Sept 2026 — real Stripe-paid Flippy Coin top-ups (migration 0031's
    // credit_flippy_coins, kind='purchase' only — a 'bonus'/'admin_grant'
    // coin never had real money behind it, and 'spend' is a debit, not
    // revenue). This dashboard never counted coin revenue at all before
    // now — a pre-existing gap, fixed here while adding fixed-price deals
    // (which spend already-purchased coins, not new revenue at spend time,
    // so deal-slot purchases are deliberately NOT added here separately).
    supabase.from("coin_transactions").select("amount, created_at").eq("kind", "purchase").gte("created_at", sinceIso),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("subscription_tier", ["pro", "elite"]),
  ]);

  const days = lastNDays(DAYS);
  const signupsByDay = new Map<string, number>(days.map((d) => [d, 0]));
  const revenueByDay = new Map<string, number>(days.map((d) => [d, 0]));

  for (const s of signups ?? []) {
    const k = dayKey(s.created_at);
    if (signupsByDay.has(k)) signupsByDay.set(k, (signupsByDay.get(k) ?? 0) + 1);
  }
  for (const o of orders ?? []) {
    const k = dayKey(o.created_at);
    if (revenueByDay.has(k)) revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + Number(o.price_gbp ?? 0));
  }
  for (const s of shopSales ?? []) {
    if (!s.paid_at) continue;
    const k = dayKey(s.paid_at);
    if (revenueByDay.has(k)) revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + Number(s.sold_price_gbp ?? 0));
  }
  // Only a winning instant-win bid unambiguously represents real money
  // changing hands today — a plain (non-instant-win) bid in bids doesn't
  // carry a "this is the winner" flag on its own. Good enough for a
  // directional graph; revisit with a real join to opportunities.won_by if
  // this number ever needs to be exact.
  for (const b of (wins ?? []).filter((w: any) => w.is_instant_win)) {
    const k = dayKey(b.created_at);
    if (revenueByDay.has(k)) revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + Number(b.amount_gbp ?? 0));
  }
  // 1 coin = £1, so a coin purchase's amount converts straight across.
  for (const c of coinPurchases ?? []) {
    const k = dayKey(c.created_at);
    if (revenueByDay.has(k)) revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + Number(c.amount ?? 0));
  }

  const dailySignups = days.map((d) => ({ date: d, count: signupsByDay.get(d) ?? 0 }));
  const dailyRevenueGBP = days.map((d) => ({ date: d, gbp: Math.round((revenueByDay.get(d) ?? 0) * 100) / 100 }));

  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const sum = (arr: { date: string; count?: number; gbp?: number }[], keys: string[], field: "count" | "gbp") =>
    arr.filter((x) => keys.includes(x.date)).reduce((s, x) => s + (x[field] ?? 0), 0);

  return {
    dailySignups,
    dailyRevenueGBP,
    signupsLast7: sum(dailySignups, last7, "count"),
    signupsPrev7: sum(dailySignups, prev7, "count"),
    revenueLast7GBP: sum(dailyRevenueGBP, last7, "gbp"),
    revenuePrev7GBP: sum(dailyRevenueGBP, prev7, "gbp"),
    activeResellers: totalResellers ?? 0,
  };
}

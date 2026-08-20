import { requireStaff } from "@/lib/adminGuard";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Section 12.1 — the one screen to check first. Server component: queries
 * run once at request time using the service-role client (the same reason
 * every other /api/admin/* route uses it — these tables have no RLS policy
 * granting the plain "authenticated" role access, on purpose).
 */
export default async function AdminOverviewPage() {
  await requireStaff("support");
  const supabase = createSupabaseServiceClient();

  const [{ count: sellerCount }, { count: openTickets }, { count: breachRiskTickets }, { count: openFlags }, { count: highFlags }, { count: pendingPartners }, { data: escrowOrders }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "resolved"),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("priority", "high").neq("status", "resolved"),
      supabase.from("risk_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("risk_flags").select("id", { count: "exact", head: true }).eq("status", "open").eq("severity", "high"),
      supabase.from("partners").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("orders").select("price_gbp").is("funds_released_at", null),
    ]);

  const escrowHeldGBP = (escrowOrders ?? []).reduce((sum: number, o: any) => sum + Number(o.price_gbp ?? 0), 0);

  const tiles = [
    { label: "Total sellers", value: sellerCount ?? 0 },
    { label: "Open tickets", value: openTickets ?? 0, sub: `${breachRiskTickets ?? 0} high priority` },
    { label: "Escrow held", value: `£${escrowHeldGBP.toFixed(2)}`, sub: `${escrowOrders?.length ?? 0} orders` },
    { label: "Open risk flags", value: openFlags ?? 0, sub: `${highFlags ?? 0} high severity` },
    { label: "Partners pending", value: pendingPartners ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Live counts from the real database — no mock data. See <code>/admin/tickets</code>,{" "}
        <code>/admin/risk</code>, and <code>/admin/partners</code> to act on any of these.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className="text-xs text-textDim uppercase tracking-wide mb-2">{t.label}</div>
            <div className="text-2xl font-extrabold">{t.value}</div>
            {t.sub && <div className="text-xs text-textDim mt-1">{t.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

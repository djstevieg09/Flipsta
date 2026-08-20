import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

/**
 * GET /api/admin/sellers — Section 12.1 seller management. Staff-only list
 * of every profile, with the ticket count an admin actually needs to triage
 * an account merged in. (Buyback-claim counts aren't joined here yet — the
 * current schema links a claim to a marketplace `orders` row, which isn't
 * the same thing as the opportunity purchase a claim is actually filed
 * against; worth resolving that modelling gap before surfacing the count,
 * rather than shipping a number that looks right but isn't.)
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, display_name, subscription_tier, role, status, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: ticketRows } = await supabase.from("tickets").select("requester_id");
  const ticketCountByProfile = new Map<string, number>();
  for (const t of ticketRows ?? []) {
    ticketCountByProfile.set(t.requester_id, (ticketCountByProfile.get(t.requester_id) ?? 0) + 1);
  }

  const sellers = (profiles ?? []).map((p: any) => ({
    id: p.id,
    displayName: p.display_name,
    subscriptionTier: p.subscription_tier,
    role: p.role,
    status: p.status,
    createdAt: p.created_at,
    openTickets: ticketCountByProfile.get(p.id) ?? 0,
  }));

  return NextResponse.json({ sellers });
}

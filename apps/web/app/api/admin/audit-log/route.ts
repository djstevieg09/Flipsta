import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/** GET /api/admin/audit-log — Section 12.1. Read-only; entries are written via apps/web/lib/adminAudit.ts. */
export async function GET() {
  try {
    // Audit log visibility is senior-staff only — it's the record staff actions get checked against.
    await requireStaff("admin");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*, profiles!admin_audit_log_admin_id_fkey(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = (data ?? []).map((e: any) => ({ ...e, adminName: e.profiles?.display_name ?? "Unknown" }));
  return NextResponse.json({ entries });
}

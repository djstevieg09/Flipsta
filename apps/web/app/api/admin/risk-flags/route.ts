import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

/**
 * GET /api/admin/risk-flags — Section 12.1 risk & fraud monitoring. Surfaces
 * concentration-risk (Section 8.4) and buyback-abuse (Section 11.6) style
 * flags for a human to review. This route only reads; the flags themselves
 * are written by apps/worker/src/jobs/evaluateBatchRelisting.ts and
 * apps/worker/src/jobs/flagRiskSignals.ts.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("risk_flags")
    .select("*, profiles!risk_flags_seller_id_fkey(display_name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flags = (data ?? []).map((f: any) => ({ ...f, sellerName: f.profiles?.display_name ?? "Unknown" }));
  return NextResponse.json({ riskFlags: flags });
}

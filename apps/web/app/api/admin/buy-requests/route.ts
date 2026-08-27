import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/buy-requests — the "Flipsta It!" admin approval queue
 * (26 Aug 2026, Steven: "this then goes to admin panel to approve"). Every
 * request regardless of status, newest first — the page itself groups by
 * status so pending ones needing a decision are easy to find.
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
    .from("buy_requests")
    .select("*, profiles(display_name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    requests: (data ?? []).map((r: any) => ({ ...r, requester_display_name: r.profiles?.display_name ?? "Unknown" })),
  });
}

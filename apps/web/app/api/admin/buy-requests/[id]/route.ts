import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending_approval: ["approved", "rejected"],
  approved: ["rejected"], // still reversible before a search has actually run
};

/** PATCH /api/admin/buy-requests/[id] — approve or reject a pending "Flipsta It!" request. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { status, adminNote } = await req.json();
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: existing, error: fetchError } = await supabase.from("buy_requests").select("status").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (!ALLOWED_TRANSITIONS[existing.status]?.includes(status)) {
    return NextResponse.json({ error: `Can't move a "${existing.status}" request to "${status}".` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("buy_requests")
    .update({ status, admin_note: typeof adminNote === "string" ? adminNote : null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, { adminId: auth.userId, action: `buy request -> ${status}`, targetType: "buy_request", targetId: id, reason: adminNote });

  return NextResponse.json({ request: data });
}

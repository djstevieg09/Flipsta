import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

/** PATCH /api/admin/risk-flags/[id] — investigate/dismiss a flag (Section 12.1). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { status, reason } = await req.json();
  if (!status || !["investigating", "dismissed"].includes(status)) {
    return NextResponse.json({ error: 'status must be "investigating" or "dismissed".' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const update: Record<string, any> = { status };
  if (status === "dismissed") update.resolved_at = new Date().toISOString();

  const { data, error } = await supabase.from("risk_flags").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, { adminId: auth.userId, action: `risk flag -> ${status}`, targetType: "risk_flag", targetId: id, reason });

  return NextResponse.json({ riskFlag: data });
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

/**
 * PATCH /api/admin/sellers/[id] — Section 12.1 tier override / suspend /
 * un-suspend. Every change is written to admin_audit_log with the reason
 * the admin gave, since this moves real money and access.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { subscriptionTier, status, reason } = await req.json();
  if (!subscriptionTier && !status) {
    return NextResponse.json({ error: "Provide subscriptionTier and/or status to update." }, { status: 400 });
  }
  // Suspending an account is a senior action; tier overrides are fine for support staff.
  if (status === "suspended") {
    try {
      await requireStaff("admin");
    } catch (e) {
      if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  }

  const supabase = createSupabaseServiceClient();
  const update: Record<string, string> = {};
  if (subscriptionTier) update.subscription_tier = subscriptionTier;
  if (status) update.status = status;

  const { data, error } = await supabase.from("profiles").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: status ? `set status: ${status}` : `tier override: ${subscriptionTier}`,
    targetType: "profile",
    targetId: id,
    reason,
  });

  return NextResponse.json({ profile: data });
}

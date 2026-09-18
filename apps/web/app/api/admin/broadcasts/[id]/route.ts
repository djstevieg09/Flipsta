import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/broadcasts/[id] — cancel a broadcast staff changed
 * their mind about. Only allowed while it's still 'pending' (the worker
 * hasn't picked it up yet) — once it's 'sending'/'sent' there's no
 * un-sending an email, so this deliberately doesn't try.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data: existing, error: fetchError } = await supabase
    .from("promo_broadcasts")
    .select("subject, status")
    .eq("id", id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (existing.status !== "pending") {
    return NextResponse.json({ error: "Only a pending broadcast can be cancelled — this one has already started sending." }, { status: 400 });
  }

  const { error } = await supabase.from("promo_broadcasts").delete().eq("id", id).eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `promo broadcast cancelled: "${existing.subject}"`,
    targetType: "promo_broadcast",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

/**
 * PATCH /api/admin/shop-items-missing-photos/[id] — 26 Aug 2026, Steven:
 * "add a picture before its uploaded to shop." Setting image_url here is
 * what actually makes the row start showing on GET /api/shop-items (that
 * route filters on image_url IS NOT NULL) — no separate "publish" step or
 * status change needed.
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

  const { imageUrl } = await req.json();
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json({ error: "imageUrl is required." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("shop_items").update({ image_url: imageUrl }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: "shop item photo added",
    targetType: "shop_item",
    targetId: id,
  });

  return NextResponse.json({ shopItem: data });
}

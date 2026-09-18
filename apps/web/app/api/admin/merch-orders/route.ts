import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/merch-orders — 18 Sept 2026, Steven: "need to add a merch
 * tab... with tshirts, caps and other items that people can buy." A paid
 * order has nowhere else to be seen — this is the only place Steven finds
 * out what to actually pack and post. Every row from merch_orders
 * (migration 0032_merch_orders.sql), newest first, joined with the buyer's
 * display name/email the same way /api/admin/wallet-admin does.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();

  const { data: orders, error } = await supabase
    .from("merch_orders")
    .select("id, profile_id, item_id, item_name, size, quantity, price_gbp, shipping_gbp, shipping_name, shipping_address, status, created_at, shipped_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await supabase.from("profiles").select("id, display_name");
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

  const emailById = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data: userPage, error: userError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (userError) break;
    for (const u of userPage?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
    if (!userPage?.users || userPage.users.length < 1000) break;
  }

  const result = (orders ?? []).map((o: any) => ({
    id: o.id,
    buyerDisplayName: nameById.get(o.profile_id) ?? "Unknown",
    buyerEmail: emailById.get(o.profile_id) ?? null,
    itemId: o.item_id,
    itemName: o.item_name,
    size: o.size,
    quantity: o.quantity,
    priceGBP: o.price_gbp,
    shippingGBP: o.shipping_gbp,
    shippingName: o.shipping_name,
    shippingAddress: o.shipping_address,
    status: o.status,
    createdAt: o.created_at,
    shippedAt: o.shipped_at,
  }));

  return NextResponse.json({ orders: result });
}

/**
 * PATCH /api/admin/merch-orders — marks an order shipped or cancelled.
 * Body: { orderId, status }. "support" is enough here (unlike the coin
 * grant route) since this doesn't move any money or balance — it's just
 * fulfilment bookkeeping.
 */
export async function PATCH(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { orderId, status } = await req.json().catch(() => ({ orderId: null, status: null }));
  if (!orderId || !["pending", "shipped", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "orderId and a valid status are required." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: order, error: fetchError } = await supabase
    .from("merch_orders")
    .select("id, item_name")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "No such order." }, { status: 404 });

  const { error: updateError } = await supabase
    .from("merch_orders")
    .update({ status, shipped_at: status === "shipped" ? new Date().toISOString() : null })
    .eq("id", orderId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `merch order marked ${status}: ${order.item_name}`,
    targetType: "merch_order",
    targetId: orderId,
  });

  return NextResponse.json({ ok: true });
}

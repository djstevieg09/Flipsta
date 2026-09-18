import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dropship-orders — 18 Sept 2026, Steven: "when someone
 * orders it then a dropship order is created." This is where a paid
 * dropship order actually gets fulfilled from — Steven ("Just you /
 * staff" is who fulfils, per his own answer) needs this to know which
 * AliExpress orders to go and place and pay for. Every row from
 * dropship_orders (migration 0033), newest first, same buyer-name/email
 * join as /api/admin/merch-orders.
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
    .from("dropship_orders")
    .select(
      "id, profile_id, dropship_product_id, product_title, product_image_url, quantity, price_gbp, shipping_gbp, shipping_name, shipping_address, status, ali_order_id, tracking_number, ordered_at, shipped_at, created_at, dropship_products(ali_product_url)",
    )
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
    productTitle: o.product_title,
    productImageUrl: o.product_image_url,
    aliProductUrl: Array.isArray(o.dropship_products) ? o.dropship_products[0]?.ali_product_url : o.dropship_products?.ali_product_url,
    quantity: o.quantity,
    priceGBP: o.price_gbp,
    shippingGBP: o.shipping_gbp,
    shippingName: o.shipping_name,
    shippingAddress: o.shipping_address,
    status: o.status,
    aliOrderId: o.ali_order_id,
    trackingNumber: o.tracking_number,
    orderedAt: o.ordered_at,
    shippedAt: o.shipped_at,
    createdAt: o.created_at,
  }));

  return NextResponse.json({ orders: result });
}

/**
 * PATCH /api/admin/dropship-orders — marks an order ordered-on-AliExpress
 * (optionally recording aliOrderId), shipped (recording trackingNumber),
 * or cancelled. Body: { orderId, status, aliOrderId?, trackingNumber? }.
 * "support" is enough, same reasoning as merch-orders — this is
 * fulfilment bookkeeping, not a money-moving action.
 */
export async function PATCH(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { orderId, status, aliOrderId, trackingNumber } = await req.json().catch(() => ({ orderId: null, status: null }));
  if (!orderId || !["pending", "ordered", "shipped", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "orderId and a valid status are required." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: order, error: fetchError } = await supabase
    .from("dropship_orders")
    .select("id, product_title")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "No such order." }, { status: 404 });

  const updates: Record<string, unknown> = { status };
  if (status === "ordered") {
    updates.ordered_at = new Date().toISOString();
    if (typeof aliOrderId === "string" && aliOrderId.trim()) updates.ali_order_id = aliOrderId.trim();
  } else if (status === "shipped") {
    updates.shipped_at = new Date().toISOString();
    if (typeof trackingNumber === "string" && trackingNumber.trim()) updates.tracking_number = trackingNumber.trim();
  }

  const { error: updateError } = await supabase.from("dropship_orders").update(updates).eq("id", orderId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `dropship order marked ${status}: ${order.product_title}`,
    targetType: "dropship_order",
    targetId: orderId,
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/** PATCH /api/seller-stock/:id — edit quantity/price/recurring flag on an existing stock item. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.priceGBP === "number" && body.priceGBP > 0) update.price_gbp = body.priceGBP;
  if (typeof body.quantity === "number" && Number.isInteger(body.quantity) && body.quantity >= 0) update.quantity = body.quantity;
  if (typeof body.isRecurring === "boolean") update.is_recurring = body.isRecurring;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  // RLS ("sellers manage their own stock") already restricts this to the
  // caller's own rows — .eq("seller_id", ...) here is belt-and-braces.
  const { data, error } = await supabase.from("seller_stock_items").update(update).eq("id", id).eq("seller_id", auth.userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Stock item not found." }, { status: 404 });

  return NextResponse.json({ stockItem: data });
}

/** DELETE /api/seller-stock/:id — remove a stock item from the catalog entirely. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("seller_stock_items").delete().eq("id", id).eq("seller_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

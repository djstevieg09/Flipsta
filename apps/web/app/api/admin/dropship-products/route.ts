import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { computeDropshipPriceGBP } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dropship-products — 18 Sept 2026, Steven: "add ali
 * express products and add them into our shop with a 25% markup." This
 * is how a product actually gets onto /shop at all — see
 * dropship_products (migration 0033). Returns every product, active and
 * inactive, so staff can see and re-enable something they paused.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data: products, error } = await supabase
    .from("dropship_products")
    .select("id, ali_product_url, title, description, image_url, source_price_gbp, our_price_gbp, category_id, is_active, created_at, updated_at, categories(name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: products ?? [] });
}

/**
 * POST /api/admin/dropship-products — adds a new product. Body:
 * { aliProductUrl, title, description?, imageUrl?, sourcePriceGBP,
 * ourPriceGBP?, categoryId? }. ourPriceGBP defaults to sourcePriceGBP *
 * 1.25 (computeDropshipPriceGBP) when omitted, so pasting in just the
 * AliExpress URL, a title and its current price is enough — staff can
 * still hand-override the markup on any individual item.
 */
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const { aliProductUrl, title, description, imageUrl, sourcePriceGBP, ourPriceGBP, categoryId } = body;

  if (typeof aliProductUrl !== "string" || !aliProductUrl.trim()) {
    return NextResponse.json({ error: "The AliExpress product URL is required." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  const source = Number(sourcePriceGBP);
  if (!Number.isFinite(source) || source <= 0) {
    return NextResponse.json({ error: "sourcePriceGBP must be a positive number." }, { status: 400 });
  }
  const our = Number.isFinite(Number(ourPriceGBP)) && Number(ourPriceGBP) > 0 ? Number(ourPriceGBP) : computeDropshipPriceGBP(source);

  const supabase = createSupabaseServiceClient();
  const { data: product, error } = await supabase
    .from("dropship_products")
    .insert({
      ali_product_url: aliProductUrl.trim(),
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      image_url: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
      source_price_gbp: source,
      our_price_gbp: our,
      category_id: typeof categoryId === "string" && categoryId ? categoryId : null,
      added_by: auth.userId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `dropship product added: ${title.trim()}`,
    targetType: "dropship_product",
    targetId: product.id,
  });

  return NextResponse.json({ ok: true, id: product.id });
}

/**
 * PATCH /api/admin/dropship-products — edits a product or toggles it
 * active/inactive. Body: { productId, ...fields to change }. Deactivating
 * (rather than deleting) keeps any past order's product snapshot
 * (dropship_orders.product_title etc) intact and lets staff re-list the
 * same item later.
 */
export async function PATCH(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const { productId, title, description, imageUrl, sourcePriceGBP, ourPriceGBP, categoryId, isActive } = body;
  if (typeof productId !== "string" || !productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof title === "string" && title.trim()) updates.title = title.trim();
  if (description !== undefined) updates.description = typeof description === "string" && description.trim() ? description.trim() : null;
  if (imageUrl !== undefined) updates.image_url = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null;
  if (sourcePriceGBP !== undefined) {
    const source = Number(sourcePriceGBP);
    if (!Number.isFinite(source) || source <= 0) {
      return NextResponse.json({ error: "sourcePriceGBP must be a positive number." }, { status: 400 });
    }
    updates.source_price_gbp = source;
  }
  if (ourPriceGBP !== undefined) {
    const our = Number(ourPriceGBP);
    if (!Number.isFinite(our) || our <= 0) {
      return NextResponse.json({ error: "ourPriceGBP must be a positive number." }, { status: 400 });
    }
    updates.our_price_gbp = our;
  }
  if (categoryId !== undefined) updates.category_id = typeof categoryId === "string" && categoryId ? categoryId : null;
  if (typeof isActive === "boolean") updates.is_active = isActive;

  const supabase = createSupabaseServiceClient();
  const { data: existing, error: fetchError } = await supabase
    .from("dropship_products")
    .select("id, title")
    .eq("id", productId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "No such product." }, { status: 404 });

  const { error } = await supabase.from("dropship_products").update(updates).eq("id", productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `dropship product updated: ${existing.title}`,
    targetType: "dropship_product",
    targetId: productId,
  });

  return NextResponse.json({ ok: true });
}

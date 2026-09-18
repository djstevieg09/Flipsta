import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createDropshipCheckoutSession, getOrCreateStripeCustomer, isStripeConfigured } from "@/lib/stripe";
import { DROPSHIP_SHIPPING_GBP } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/dropship/checkout — 18 Sept 2026, Steven: "add ali express
 * products and add them into our shop with a 25% markup and when someone
 * orders it then a dropship order is created." Body: { productId,
 * quantity? }. Unlike merch's fixed MERCH_ITEMS lookup, the product and
 * its price are looked up live from dropship_products (migration 0033) —
 * the client only ever picks which product and how many, never the
 * amount. The actual dropship_orders row isn't created here: it's created
 * by the webhook once Stripe confirms payment, same as merch_purchase.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Buying isn't set up yet — check back soon." }, { status: 503 });
  }

  const { productId, quantity } = await req.json().catch(() => ({ productId: null }));
  if (typeof productId !== "string" || !productId) {
    return NextResponse.json({ error: "Choose a valid product." }, { status: 400 });
  }
  const qty = Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 5) : 1;

  const supabase = createSupabaseServiceClient();

  const { data: product, error: productError } = await supabase
    .from("dropship_products")
    .select("id, title, image_url, our_price_gbp, is_active")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  if (!product || !product.is_active) {
    return NextResponse.json({ error: "That item isn't available right now." }, { status: 404 });
  }

  const [{ data: userRes }, { data: profileRow }] = await Promise.all([
    supabase.auth.admin.getUserById(auth.userId),
    supabase.from("profiles").select("stripe_customer_id").eq("id", auth.userId).single(),
  ]);
  const email = userRes?.user?.email;
  if (!email) return NextResponse.json({ error: "Could not resolve your account email." }, { status: 500 });

  try {
    const stripeCustomerId = await getOrCreateStripeCustomer({
      existingStripeCustomerId: profileRow?.stripe_customer_id,
      email,
      profileId: auth.userId,
    });
    if (stripeCustomerId !== profileRow?.stripe_customer_id) {
      await supabase.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", auth.userId);
    }

    const session = await createDropshipCheckoutSession({
      dropshipProductId: product.id,
      productTitle: product.title,
      productImageUrl: product.image_url,
      quantity: qty,
      priceGBP: product.our_price_gbp,
      shippingGBP: DROPSHIP_SHIPPING_GBP,
      profileId: auth.userId,
      email,
      existingStripeCustomerId: stripeCustomerId,
      successUrl: `${req.nextUrl.origin}/shop?purchase=success`,
      cancelUrl: `${req.nextUrl.origin}/shop?purchase=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

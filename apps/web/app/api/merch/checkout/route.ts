import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createMerchCheckoutSession, getOrCreateStripeCustomer, isStripeConfigured } from "@/lib/stripe";
import { MERCH_ITEMS, MERCH_SHIPPING_GBP, isValidMerchItem } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/merch/checkout — 18 Sept 2026, Steven: "need to add a merch
 * tab... with tshirts, caps and other items that people can buy." Body:
 * { itemId, size?, quantity? }. Item, price and shipping are all looked
 * up server-side from MERCH_ITEMS/MERCH_SHIPPING_GBP by id — the client
 * only ever picks which item, size, and quantity, never the amount.
 * Crediting an order happens later, in the webhook, once Stripe actually
 * confirms payment.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Buying merch isn't set up yet — check back soon." }, { status: 503 });
  }

  const { itemId, size, quantity } = await req.json().catch(() => ({ itemId: null }));
  if (typeof itemId !== "string" || !isValidMerchItem(itemId)) {
    return NextResponse.json({ error: "Choose a valid item." }, { status: 400 });
  }
  const item = MERCH_ITEMS[itemId];

  if (item.sizes) {
    if (typeof size !== "string" || !item.sizes.includes(size)) {
      return NextResponse.json({ error: `Choose a size: ${item.sizes.join(", ")}.` }, { status: 400 });
    }
  } else if (size) {
    return NextResponse.json({ error: `${item.name} doesn't come in sizes.` }, { status: 400 });
  }

  const qty = Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 5) : 1;

  const supabase = createSupabaseServiceClient();
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

    const session = await createMerchCheckoutSession({
      itemId,
      itemName: item.name,
      size: item.sizes ? size : undefined,
      quantity: qty,
      priceGBP: item.priceGBP,
      shippingGBP: MERCH_SHIPPING_GBP,
      profileId: auth.userId,
      email,
      existingStripeCustomerId: stripeCustomerId,
      successUrl: `${req.nextUrl.origin}/merch?purchase=success`,
      cancelUrl: `${req.nextUrl.origin}/merch?purchase=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

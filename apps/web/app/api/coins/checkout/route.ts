import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createCoinCheckoutSession, getOrCreateStripeCustomer, isStripeConfigured } from "@/lib/stripe";
import { COIN_BUNDLES, isValidCoinBundle } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/coins/checkout — 18 Sept 2026, Steven: "get the flippy coins
 * shop all working." Body: { bundleId }. The price and coin count are
 * looked up server-side from COIN_BUNDLES by id — the client only ever
 * chooses which bundle, never the amount — then handed to Stripe Checkout
 * (mode "payment", one-off). Crediting the balance happens later, in the
 * webhook, once Stripe actually confirms payment — never here.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Buying Flippy Coins isn't set up yet — check back soon." }, { status: 503 });
  }

  const { bundleId } = await req.json().catch(() => ({ bundleId: null }));
  if (typeof bundleId !== "string" || !isValidCoinBundle(bundleId)) {
    return NextResponse.json({ error: "Choose a valid Flippy Coin bundle." }, { status: 400 });
  }
  const bundle = COIN_BUNDLES[bundleId];

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

    const session = await createCoinCheckoutSession({
      bundleId,
      coins: bundle.coins,
      bundleName: bundle.name,
      priceGBP: bundle.priceGBP,
      profileId: auth.userId,
      email,
      existingStripeCustomerId: stripeCustomerId,
      successUrl: `${req.nextUrl.origin}/coins?purchase=success`,
      cancelUrl: `${req.nextUrl.origin}/coins?purchase=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

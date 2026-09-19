import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createTierCheckoutSession, getOrCreateStripeCustomer, isTierBillingConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/checkout — 19 Sept 2026, Steven: "after all this done
 * we need to setup the self service upgrade." /upgrade/page.tsx's "Upgrade
 * to Silver/Gold/Platinum" buttons have been calling this route since 27
 * Aug 2026, but it never existed — the whole tier-upgrade flow has been
 * 404ing (Unexpected token '<' — see that page's own doc comment) the
 * entire time, and the only working way to change a subscriber's tier has
 * been an admin doing it by hand at /admin/sellers.
 *
 * Body: { tier: "standard" | "pro" | "elite" } — the internal tier values
 * (Bronze/Silver/Gold/Platinum are display-only renames, see
 * app/upgrade/page.tsx). createTierCheckoutSession (lib/stripe.ts) was
 * already fully built, just never called from a real route — this is that
 * route, following the exact same
 * getOrCreateStripeCustomer-then-checkout shape /api/coins/checkout and
 * /api/account/payment-portal already use.
 *
 * Needs STRIPE_PRICE_STANDARD/STRIPE_PRICE_PRO/STRIPE_PRICE_ELITE set on
 * Render to the real recurring Price IDs from the Stripe dashboard (Silver
 * £15/mo, Gold £45/mo, Platinum £90/mo — see app/upgrade/page.tsx's TIERS
 * array for the confirmed prices) — isTierBillingConfigured() below is
 * what makes this a clean 503 instead of a confusing crash until those are
 * set.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { tier } = await req.json().catch(() => ({ tier: null }));
  if (tier !== "standard" && tier !== "pro" && tier !== "elite") {
    return NextResponse.json({ error: "Choose a valid plan to upgrade to." }, { status: 400 });
  }

  if (!isTierBillingConfigured(tier)) {
    return NextResponse.json({ error: "This plan isn't set up for self-serve billing yet — check back soon, or ask an admin to set your plan." }, { status: 503 });
  }

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

    const session = await createTierCheckoutSession({
      tier,
      profileId: auth.userId,
      email,
      existingStripeCustomerId: stripeCustomerId,
      successUrl: `${req.nextUrl.origin}/upgrade?checkout=success`,
      cancelUrl: `${req.nextUrl.origin}/upgrade?checkout=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

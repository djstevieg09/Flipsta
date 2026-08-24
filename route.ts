import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createTierCheckoutSession, isTierBillingConfigured } from "@/lib/stripe";

const UPGRADABLE_TIERS = new Set(["standard", "pro", "elite"]);

/**
 * POST /api/billing/checkout — Section 7 self-serve tier upgrade. Starts a
 * Stripe Checkout session (subscription mode) for the requested tier and
 * returns the URL to redirect the browser to. The profile's
 * subscription_tier itself is only ever updated from the webhook
 * (checkout.session.completed / customer.subscription.updated below),
 * never here — Stripe is the source of truth for what's actually paid for.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tier = body?.tier;
  if (!UPGRADABLE_TIERS.has(tier)) {
    return NextResponse.json({ error: "tier must be one of: standard, pro, elite." }, { status: 400 });
  }

  if (!isTierBillingConfigured(tier)) {
    return NextResponse.json(
      {
        error: `Billing for the ${tier} tier isn't set up yet. An admin can set your tier manually at /admin/sellers in the meantime — see INFRASTRUCTURE_TODO.md to turn on real card payments.`,
      },
      { status: 503 },
    );
  }

  // Need the auth user's email (not stored on profiles) plus any existing
  // Stripe customer id, so a returning subscriber re-uses one Stripe
  // customer across tier changes instead of creating a new one each time.
  const supabase = createSupabaseServiceClient();
  const [{ data: userRes }, { data: profileRow }] = await Promise.all([
    supabase.auth.admin.getUserById(auth.userId),
    supabase.from("profiles").select("stripe_customer_id").eq("id", auth.userId).single(),
  ]);
  const email = userRes?.user?.email;
  if (!email) return NextResponse.json({ error: "Could not resolve your account email." }, { status: 500 });

  try {
    const origin = req.nextUrl.origin;
    const session = await createTierCheckoutSession({
      tier,
      profileId: auth.userId,
      email,
      existingStripeCustomerId: profileRow?.stripe_customer_id,
      successUrl: `${origin}/upgrade?checkout=success`,
      cancelUrl: `${origin}/upgrade?checkout=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createBillingPortalSession, getOrCreateStripeCustomer, isStripeConfigured } from "@/lib/stripe";

/**
 * POST /api/account/payment-portal — 26 Aug 2026, Steven: "Need an accounts
 * page so people can setup their payment methods." Unlike the existing
 * /api/billing/portal (which only works for someone who's already
 * subscribed to a paid tier), this works for ANY signed-in user: it
 * creates a bare Stripe customer on first visit if they don't have one
 * yet, then hands back the same Stripe-hosted Billing Portal link. Card
 * details are entered on Stripe's own page, never on Flipsta's — same
 * PCI-safe boundary as everywhere else Stripe is used in this app.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payment methods aren't set up yet — check back soon." }, { status: 503 });
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

    const session = await createBillingPortalSession({
      stripeCustomerId,
      returnUrl: `${req.nextUrl.origin}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createBillingPortalSession, isStripeConfigured } from "@/lib/stripe";

/**
 * POST /api/billing/portal — hands an existing subscriber Stripe's hosted
 * portal to change tier, update their card, or cancel, without needing any
 * of that billing UI built here. Only works once they've been through
 * Checkout at least once (i.e. have a stripe_customer_id).
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up yet." }, { status: 503 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", auth.userId)
    .single();

  if (!profileRow?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account on file yet — upgrade to a paid tier first to create one." },
      { status: 400 },
    );
  }

  try {
    const session = await createBillingPortalSession({
      stripeCustomerId: profileRow.stripe_customer_id,
      returnUrl: `${req.nextUrl.origin}/upgrade`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createBillingPortalSession, getOrCreateStripeCustomer, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/portal — the other half of self-serve upgrade (see
 * ./checkout/route.ts's doc comment for the full story of why this didn't
 * exist until now). /upgrade/page.tsx's "Manage billing" button (and its
 * downgrade path, which routes existing subscribers here instead of a
 * second Checkout) has been calling this since 27 Aug 2026.
 *
 * Deliberately the same shape as the already-working
 * /api/account/payment-portal (26 Aug 2026) rather than reusing it
 * directly — that route returns to /account, this one returns to
 * /upgrade, and keeping them separate means /upgrade never has to assume
 * anything about /account's own copy or future changes.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up yet — check back soon." }, { status: 503 });
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
      returnUrl: `${req.nextUrl.origin}/upgrade`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

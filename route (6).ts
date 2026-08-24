import { NextRequest, NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/stripe — Stripe Connect event handler.
 * Register this URL in the Stripe dashboard (see INFRASTRUCTURE_TODO.md).
 * Uses the service-role Supabase client since Stripe calls this
 * unauthenticated (verified instead via the webhook signing secret).
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured on this environment yet." }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, webhookSecret!);
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as any;
      await supabase.from("orders").update({ status: "preparing" }).eq("stripe_payment_intent_id", pi.id);
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as any;
      await supabase.from("orders").update({ status: "refunded" }).eq("stripe_payment_intent_id", pi.id);
      break;
    }

    // --- Section 7 self-serve tier upgrades (apps/web/app/api/billing/*) ---
    // Stripe is the source of truth for subscription_tier once Checkout has
    // been used — these three events are the only place that column changes
    // for a paid tier (the admin override in /admin/sellers still works
    // independently, e.g. for comping an account).
    case "checkout.session.completed": {
      const session = event.data.object as any;
      if (session.mode !== "subscription") break;
      const profileId = session.client_reference_id ?? session.metadata?.profile_id;
      const tier = session.metadata?.tier;
      if (!profileId || !tier) break;
      await supabase
        .from("profiles")
        .update({
          subscription_tier: tier,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        })
        .eq("id", profileId);
      break;
    }
    case "customer.subscription.updated": {
      // Covers a tier change made inside the Stripe portal itself (not just
      // our own /upgrade page), and a subscription moving out of `active`
      // (e.g. `past_due` on a failed renewal) — downgrade to free rather
      // than silently leaving paid entitlements on an unpaid account.
      const sub = event.data.object as any;
      const profileId = sub.metadata?.profile_id;
      if (!profileId) break;
      const tier = sub.status === "active" || sub.status === "trialing" ? sub.metadata?.tier : "free";
      if (!tier) break;
      await supabase.from("profiles").update({ subscription_tier: tier }).eq("id", profileId);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      const profileId = sub.metadata?.profile_id;
      if (!profileId) break;
      await supabase
        .from("profiles")
        .update({ subscription_tier: "free", stripe_subscription_id: null })
        .eq("id", profileId);
      break;
    }
    default:
      // Unhandled event types are fine to ignore — Stripe expects a 2xx either way.
      break;
  }

  return NextResponse.json({ received: true });
}

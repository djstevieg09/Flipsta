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
    default:
      // Unhandled event types are fine to ignore — Stripe expects a 2xx either way.
      break;
  }

  return NextResponse.json({ received: true });
}

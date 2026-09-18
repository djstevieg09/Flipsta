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
    // 18 Sept 2026, Steven: "get the flippy coins shop all working." A
    // Flippy Coin bundle is a one-off Checkout Session (mode "payment"),
    // not a PaymentIntent this app creates directly — see
    // createCoinCheckoutSession, lib/stripe.ts — so it's this event, not
    // payment_intent.succeeded above, that confirms it actually paid.
    // metadata.kind distinguishes it from any other checkout session this
    // app might create in future. credit_flippy_coins() is idempotent on
    // the session id, so a redelivered webhook can't double-credit.
    case "checkout.session.completed": {
      const session = event.data.object as any;
      if (session.payment_status === "paid" && session.metadata?.kind === "coin_purchase") {
        const profileId = session.metadata.profile_id as string;
        const coins = Number(session.metadata.coins);
        if (profileId && Number.isFinite(coins) && coins > 0) {
          await supabase.rpc("credit_flippy_coins", {
            p_profile_id: profileId,
            p_amount: coins,
            p_kind: "purchase",
            p_stripe_checkout_session_id: session.id,
            p_note: `Bundle: ${session.metadata.bundle_id}`,
          });
        }
      } else if (session.payment_status === "paid" && session.metadata?.kind === "merch_purchase") {
        // 18 Sept 2026, Steven: "need to add a merch tab... with tshirts,
        // caps and other items that people can buy." Unlike coins, this
        // is a physical order, so the row itself (not just a balance) is
        // the thing Steven needs — see merch_orders, migration 0032.
        // Plain insert (not an RPC): merch_orders has no client-writable
        // RLS gap to guard against the way profiles.flippy_coin_balance
        // did, and stripe_checkout_session_id's unique constraint still
        // makes this safe against a redelivered webhook event.
        const m = session.metadata;
        await supabase
          .from("merch_orders")
          .upsert(
            {
              profile_id: m.profile_id,
              item_id: m.item_id,
              item_name: m.item_name,
              size: m.size || null,
              quantity: Number(m.quantity) || 1,
              price_gbp: Number(m.price_gbp) || 0,
              shipping_gbp: Number(m.shipping_gbp) || 0,
              shipping_name: session.shipping_details?.name ?? session.customer_details?.name ?? null,
              shipping_address: session.shipping_details?.address ?? null,
              stripe_checkout_session_id: session.id,
            },
            { onConflict: "stripe_checkout_session_id", ignoreDuplicates: true },
          );
      }
      break;
    }
    default:
      // Unhandled event types are fine to ignore — Stripe expects a 2xx either way.
      break;
  }

  return NextResponse.json({ received: true });
}

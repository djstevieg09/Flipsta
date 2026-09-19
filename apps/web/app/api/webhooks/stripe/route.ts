import { NextRequest, NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { NotificationEvents, TIER_MONTHLY_COIN_ALLOWANCE, SubscriptionTier } from "@flipsta/shared";

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
      } else if (session.payment_status === "paid" && session.metadata?.kind === "tier_upgrade") {
        // 19 Sept 2026, Steven: "after all this done we need to setup the
        // self service upgrade" + "we need to have an email when people
        // upgrade to the next tier explaining the benefits and coin price."
        // This is the moment a self-serve upgrade actually becomes real —
        // never trust the client, only a confirmed Stripe payment updates
        // subscription_tier. Deliberately does NOT credit the tier's
        // monthly Flippy Coin allowance here — Stripe fires
        // invoice.payment_succeeded for this same first invoice a moment
        // later (subscription-mode Checkout pays the first invoice as part
        // of completing), so crediting there too would double-pay day one.
        // Sole crediting path is invoice.payment_succeeded below, for both
        // the first cycle and every renewal alike.
        const profileId = session.metadata.profile_id as string;
        const tier = session.metadata.tier as SubscriptionTier;
        if (profileId && (tier === "standard" || tier === "pro" || tier === "elite")) {
          await supabase
            .from("profiles")
            .update({ subscription_tier: tier, stripe_subscription_id: session.subscription ?? null })
            .eq("id", profileId);

          const [{ data: userRes }, { data: profileRow }] = await Promise.all([
            supabase.auth.admin.getUserById(profileId),
            supabase.from("profiles").select("display_name").eq("id", profileId).single(),
          ]);
          const email = userRes?.user?.email;
          if (email) {
            await NotificationEvents.tierUpgrade(email, profileRow?.display_name ?? "there", tier);
          }
        }
      } else if (session.payment_status === "paid" && session.metadata?.kind === "dropship_purchase") {
        // 18 Sept 2026, Steven: "add ali express products... when someone
        // orders it then a dropship order is created." Same reasoning as
        // merch_purchase just above — this is the row Steven actually
        // needs (see dropship_orders, migration 0033), and
        // stripe_checkout_session_id's unique constraint makes this safe
        // against a redelivered webhook event.
        const d = session.metadata;
        await supabase
          .from("dropship_orders")
          .upsert(
            {
              profile_id: d.profile_id,
              dropship_product_id: d.dropship_product_id || null,
              product_title: d.product_title,
              product_image_url: d.product_image_url || null,
              quantity: Number(d.quantity) || 1,
              price_gbp: Number(d.price_gbp) || 0,
              shipping_gbp: Number(d.shipping_gbp) || 0,
              shipping_name: session.shipping_details?.name ?? session.customer_details?.name ?? null,
              shipping_address: session.shipping_details?.address ?? null,
              stripe_checkout_session_id: session.id,
            },
            { onConflict: "stripe_checkout_session_id", ignoreDuplicates: true },
          );
      }
      break;
    }
    // 19 Sept 2026, Steven: "for this you get 20 flippy coins... this gives
    // them 77 coins... give them 200 coins." Fires once per PAID invoice on
    // a tier subscription — the first one (part of the same Checkout that
    // creates the subscription) and every monthly renewal alike — so this
    // is the single place the monthly allowance is credited, never on
    // checkout.session.completed (see that branch's comment above for why).
    // credit_flippy_coins is idempotent per its p_stripe_checkout_session_id
    // arg (coin_transactions' unique constraint) — reused here for the
    // Stripe invoice id, which is just as good a redelivery-safe key even
    // though it's not literally a Checkout Session id.
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as any;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (!subscriptionId) break; // not a subscription invoice — nothing to credit

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.metadata?.kind !== "tier_upgrade") break;

      const profileId = subscription.metadata.profile_id as string | undefined;
      const tier = subscription.metadata.tier as SubscriptionTier | undefined;
      const coins = tier ? TIER_MONTHLY_COIN_ALLOWANCE[tier] : 0;
      if (profileId && coins > 0) {
        await supabase.rpc("credit_flippy_coins", {
          p_profile_id: profileId,
          p_amount: coins,
          p_kind: "bonus",
          p_stripe_checkout_session_id: `invoice_${invoice.id}`,
          p_note: `Monthly ${tier} plan coin allowance`,
        });
      }
      break;
    }
    default:
      // Unhandled event types are fine to ignore — Stripe expects a 2xx either way.
      break;
  }

  return NextResponse.json({ received: true });
}

-- Run after 0005_seller_order_visibility.sql (see INFRASTRUCTURE_TODO.md).

-- ============================================================
-- Self-serve subscription tier upgrades (Section 7) via Stripe
-- Checkout + Billing Portal — previously subscription_tier could only be
-- changed by an admin in /admin/sellers (see STATUS.md's suggested next
-- steps). stripe_customer_id already existed (0001_init.sql); this adds
-- the subscription id itself so webhook events (renewal, cancellation,
-- plan change via the portal) can be matched back to the right profile.
-- ============================================================
alter table profiles add column stripe_subscription_id text;

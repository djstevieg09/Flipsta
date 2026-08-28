-- 27 Aug 2026 — found while extracting api/orders/route.ts's checkout logic
-- into lib/orderCreation.ts (so a live-show auction win can create an order
-- the identical way). Same bug CLASS as 0011_opportunities_win_update_policy.sql
-- (found and fixed 26 Aug 2026): a table has RLS enabled but is missing an
-- UPDATE or INSERT policy for a write the app already makes using the
-- signed-in buyer's own (anon-key, RLS-subject) client — so Postgres/
-- PostgREST silently affects zero rows / rejects the insert instead of
-- erroring loudly, and the calling code doesn't check closely enough to
-- notice.
--
-- Two real gaps, both present since 0001_init.sql, neither ever fixed:
--
-- 1. listings has NEVER had an UPDATE policy. api/orders/route.ts's POST
--    (now lib/orderCreation.ts's createOrderForListing) does
--    `supabase.from("listings").update({ sold_at: ... })` using the
--    buyer's own client right after creating the order — with no policy,
--    that update matches zero rows, so sold_at silently never actually
--    gets set. The listing keeps showing as available and could be bought
--    again by someone else even after a real order and payment exist for
--    it. No error was ever surfaced because the existing code doesn't
--    check this update's result (matching the exact same "unchecked write"
--    root cause as 0011 and discoverOpportunities.ts's insert-not-checked
--    bug from 26 Aug 2026).
--
-- 2. wallet_transactions has NEVER had an INSERT policy — only the
--    self-read SELECT policy from 0001. Every OTHER wallet_transactions
--    insert in the app already goes through a service-role client (admin
--    routes, releaseEscrow.ts, confirm-delivery, buyback resolution) or a
--    SECURITY DEFINER trigger/function (handle_new_user's referral credit),
--    all of which bypass RLS entirely — so this gap was never hit. The ONE
--    exception is lib/loyalty.ts's awardLoyaltyCredit, called from the
--    buyer's own authenticated request during checkout: its insert has
--    been silently rejected by RLS on every single real purchase since the
--    loyalty program shipped, caught by its own deliberate try/catch (so
--    checkout itself never broke), logged as an error server-side, and
--    never surfaced to Steven or a buyer. In short: loyalty credit has
--    likely never actually been awarded to a real buyer yet.
--
-- Fixes, both scoped narrowly (same discipline as 0011, not a blanket "any
-- authenticated user can do anything" policy):
--
-- listings: a signed-in user may only ever flip an UNSOLD listing to SOLD
-- (using requires sold_at is null on the row being touched; with check
-- requires the new row have sold_at set) — can't be used to un-sell a
-- listing or touch any other column's meaning via this policy alone.
create policy "buyers can mark a listing sold when they purchase it" on listings
  for update
  using (sold_at is null)
  with check (sold_at is not null);

-- wallet_transactions: a signed-in user may only insert a 'loyalty_credit'
-- row for THEMSELVES — every other kind (referral_credit, goodwill_credit,
-- payout, commission, auction_fee, insurance_premium, buyback_payout)
-- still requires the service-role client, so this can't be used to
-- self-credit a goodwill or referral bonus.
create policy "buyers can award their own loyalty credit" on wallet_transactions
  for insert
  with check (auth.uid() = profile_id and kind = 'loyalty_credit');

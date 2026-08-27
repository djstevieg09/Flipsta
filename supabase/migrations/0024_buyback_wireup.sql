-- 27 Aug 2026, Steven: "is buyback insurance setup? need to do this if
-- not." It wasn't — buyback_policies/buyback_claims (migration 0001) and
-- the pricing/eligibility math (packages/shared/src/pricing.ts's
-- calculateBuybackPremium / isBuybackClaimEligible, both already tested)
-- have existed since day one, but nothing ever purchased a policy or filed
-- a claim.
--
-- Real design gap found along the way: buyback_policies.order_id
-- references `orders` — the peer-marketplace resale table — but Section
-- 8.3's actual mechanism is "at the moment a user wins an opportunity and
-- is about to buy it, the guarantee is offered." Winning an opportunity
-- never creates an `orders` row (see instant-win/route.ts — it updates
-- `opportunities` directly), so the original FK could never have been
-- satisfied by the feature it was meant to support. Fixed the same way
-- wallet_transactions already handles "this could reference more than one
-- kind of purchase": order_id becomes optional, a new opportunity_id sits
-- alongside it, and exactly one of the two must be set.
alter table buyback_policies alter column order_id drop not null;
alter table buyback_policies add column opportunity_id uuid references opportunities(id);
alter table buyback_policies add column profile_id uuid references profiles(id);
-- The item price actually paid, captured at purchase time — payout on a
-- claim is a % of THIS, not something re-derived later from opportunities
-- (which could have since changed status/price context). Same
-- denormalize-the-real-number-at-the-time reasoning wallet_transactions
-- and every other money-relevant row in this schema already follows.
alter table buyback_policies add column item_price_gbp numeric;

alter table buyback_policies add constraint buyback_policies_profile_required check (profile_id is not null);
alter table buyback_policies add constraint buyback_policies_exactly_one_source check (
  (order_id is not null and opportunity_id is null) or (order_id is null and opportunity_id is not null)
);

-- Section 11.6's anti-abuse window needs a real "when did you list it for
-- resale" date to measure against — nothing captured that before.
alter table buyback_claims add column listed_at timestamptz;

-- The old select policies joined through `orders` only, which would hide
-- every real (opportunity-backed) policy/claim from its own owner. Simpler
-- now that profile_id is denormalized directly onto buyback_policies —
-- same shape as every other "owner-readable" policy in this schema.
drop policy "buyback policies readable via owning order" on buyback_policies;
drop policy "buyback claims readable via owning policy" on buyback_claims;
create policy "buyback policies readable by owner" on buyback_policies for select using (auth.uid() = profile_id);
create policy "buyback claims readable via owning policy" on buyback_claims for select using (
  exists (select 1 from buyback_policies p where p.id = policy_id and p.profile_id = auth.uid())
);

create index idx_buyback_policies_profile on buyback_policies(profile_id);
create index idx_buyback_policies_opportunity on buyback_policies(opportunity_id);
create index idx_buyback_claims_policy on buyback_claims(policy_id);

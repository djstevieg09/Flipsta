-- 0008: opportunity lifecycle — real resale price, and the "don't just
-- die after one lapse" re-run mechanic Steven asked for.
--
-- Run this in the Supabase SQL editor after 0001-0007, same as every prior
-- migration.

-- Steven's "unit price to buy and sell" ask: the app already stored the
-- computed margin, but never the actual estimated resale price itself, so
-- there was nothing to show as the "sell" side. This is what
-- apps/worker/src/jobs/discoverOpportunities.ts now populates from the
-- discovery adapter (mock or Claude-search) and what the opportunities feed
-- displays as "Est. resale".
alter table opportunities add column if not exists estimated_resale_price_gbp numeric;

-- The re-run mechanic: a cheap opportunity that gets zero bids before its
-- action clock expires ("lapsed") isn't necessarily a dead deal — the
-- retailer offer might still be live. lapse_streak_days counts consecutive
-- no-bid days; next_recheck_at is when the worker should next look at it
-- again; suppressed_until is the week-long rest period after 3 in a row.
-- See apps/worker/src/jobs/relistLapsedOpportunities.ts.
alter table opportunities add column if not exists lapse_streak_days integer not null default 0;
alter table opportunities add column if not exists next_recheck_at timestamptz;
alter table opportunities add column if not exists suppressed_until timestamptz;

create index if not exists idx_opportunities_next_recheck on opportunities(next_recheck_at) where status = 'lapsed';

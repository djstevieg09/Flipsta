-- 0017: trace a listing back to the opportunity win it came from.
--
-- 26 Aug 2026, Steven: "when someone buys an oppotunity it should list the
-- item straight away once they have confirmed how many units they
-- brought." Auto-listing on Instant Win (see api/opportunities/[id]/
-- instant-win/route.ts) needs a reliable way to know an opportunity has
-- ALREADY been turned into a listing — both to stop /sell/new offering it
-- again (which would create a duplicate listing) and to fix
-- /portfolio's "won and not listed yet" count, which previously had no way
-- to tell listed wins apart from unlisted ones at all (every listing was
-- created by find-or-creating a product by title+condition match, with
-- nothing recorded linking it back to the specific opportunity).
alter table listings add column if not exists opportunity_id uuid references opportunities(id);

create index idx_listings_opportunity on listings(opportunity_id);

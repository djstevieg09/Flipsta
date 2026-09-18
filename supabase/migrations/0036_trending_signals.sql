-- 0036: TikTok trend signals — Steven, 18 Sept 2026, after asking "check
-- what the hottest item is on tik tok selling atm": "yes add this to make
-- the bot clever."
--
-- Same shape/RLS pattern as discovery_focus/seasonal_events (migration
-- 0019): an admin-editable table claudeSearchAdapter.ts's search prompt
-- reads from (see discoverOpportunities.ts's loadDiscoveryContext) to
-- actively steer what the bot looks for, rather than anything hardcoded.
-- The one real difference from seasonal_events: a seasonal date (Halloween,
-- Christmas) is a fixed calendar fact everyone already knows is coming, but
-- a TikTok trend can appear and fade within weeks — so every row here
-- REQUIRES an expiry date (expires_on), there's no "permanent" trend
-- signal, and a stale one simply falls out of the AI's context once it
-- passes rather than needing a separate cleanup job. There's no live
-- TikTok API integration here (none was asked for, and TikTok doesn't
-- offer one for this) — rows are added from real research (web search),
-- same as the seed data below, which reflects what was actually found live
-- on 18 Sept 2026, not invented.
create table trending_signals (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  -- Empty array = applies across every source/category — a broad trend
  -- like "K-beauty skincare" isn't tied to one single CURATED_SOURCES
  -- category. Same convention as seasonal_events.category_slugs.
  category_slugs text[] not null default '{}',
  note text not null,
  source text not null default 'tiktok',
  added_on date not null default current_date,
  expires_on date not null,
  created_at timestamptz not null default now(),
  constraint trending_signals_expiry_after_added check (expires_on >= added_on)
);

create index idx_trending_signals_expiry on trending_signals(expires_on);

alter table trending_signals enable row level security;
-- Staff-only, same pattern as discovery_focus/seasonal_events/partners/
-- risk_flags: RLS is on, but deliberately no policy is granted to the
-- "authenticated" role, so only the service-role client (the admin API
-- routes, after requireStaff() checks the caller's role server-side, and
-- the worker's own service client) can read or write this table at all.

-- Seed with what was actually found via real web search on 18 Sept 2026
-- (Steven: "check what the hottest item is on tik tok selling atm") — real
-- named products and sales figures, not invented. 21-day expiry on all of
-- them: TikTok trends move fast, so these should be revisited/refreshed
-- via /admin/trending rather than left to go stale silently.
insert into trending_signals (keyword, category_slugs, note, source, expires_on) values
  (
    'PDRN collagen balm / Korean skincare',
    array['beauty'],
    'Medicube''s PDRN Pink Collagen Volume Multi Balm was named TikTok Shop''s single best-selling product overall in July 2026; K-beauty skincare/anti-aging is 36% of all TikTok beauty sales ($662m Q2 2026 US beauty GMV alone). Actively favour genuine K-beauty skincare finds (balms, serums, PDRN/collagen products) right now.',
    'tiktok',
    current_date + 21
  ),
  (
    'cordless pressure washer',
    array['home-kitchen'],
    'SEESE''s cordless pressure washer did $1.97m in TikTok Shop sales in July 2026 — home cleaning gadgets are converting very well right now.',
    'tiktok',
    current_date + 21
  ),
  (
    'massage / fascia gadget',
    array['tech', 'beauty'],
    'ADDWIN''s Fascia Ring massage device did $1.78m on TikTok Shop in July 2026 at $22.39/unit — wellness gadgets crossing tech/beauty are trending.',
    'tiktok',
    current_date + 21
  ),
  (
    'baby nail trimmer',
    array['baby-kids'],
    'Momcozy''s electric baby nail trimmer is currently the #1-selling baby product on TikTok Shop UK.',
    'tiktok',
    current_date + 21
  );

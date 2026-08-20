-- Flipsta — multi-platform listing / cross-posting (Section 7's "multi-platform
-- listing" Pro/Elite entitlement, made real: a seller can flip a switch on
-- submit and have a listing posted out to external marketplaces).

alter table listings add column auto_cross_post boolean not null default false;

create table listing_channel_posts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  channel text not null, -- 'ebay' | 'amazon' | 'vinted' | 'facebook_marketplace' | 'depop'
  status text not null default 'pending' check (status in ('pending', 'posted', 'failed')),
  external_url text,
  error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, channel)
);

create index idx_listing_channel_posts_status on listing_channel_posts(status);

alter table listing_channel_posts enable row level security;

create policy "sellers can read their own listing channel posts" on listing_channel_posts
  for select using (
    exists (select 1 from listings l where l.id = listing_channel_posts.listing_id and l.seller_id = auth.uid())
  );

-- Writes happen via the service-role client only (apps/web's submit handler
-- and apps/worker's retry sweep) — see apps/web/app/api/listings/route.ts
-- and apps/worker/src/jobs/crossPostListings.ts. No insert/update policy is
-- defined for the "authenticated" role, deliberately.

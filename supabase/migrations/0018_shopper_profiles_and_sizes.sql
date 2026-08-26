-- 0018: shopper size profiles + size fields on products/shop_items.
--
-- 26 Aug 2026, Steven: "Need an accounts page so people can setup their
-- payment methods, add clothes and show sizes... i want a switch on the
-- main shopping window to ask who are you shopping for and then it will
-- show items in their size." Confirmed via a clarifying question: the full
-- profile (shoe, clothing, kids/baby), every field optional, and "blank
-- means show all product for this" — a profile with no shoe size set
-- doesn't filter footwear at all, it just shows everything, same idea
-- across every field independently.
--
-- One account can have several named profiles ("Me", "Sarah", "Jake") —
-- Steven's own phrasing, "who are you shopping for", implies picking
-- between people, not one flat set of sizes per account. A single
-- profile_id owns many rows here, same shape as wishlist_items.
create table shopper_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  shoe_size_uk text,
  top_size text,      -- e.g. XS-XXL or a UK numeric dress size, free text — retailers mix conventions, no single enum fits
  bottom_size text,
  kids_shoe_size_uk text,
  kids_clothing_size text, -- age-banded (e.g. "5-6 years") is the norm for kids' sizing, so free text again
  created_at timestamptz not null default now()
);

create index idx_shopper_profiles_profile on shopper_profiles(profile_id);

alter table shopper_profiles enable row level security;

create policy "users can read their own shopper profiles" on shopper_profiles
  for select
  using (profile_id = auth.uid());

create policy "users can create their own shopper profiles" on shopper_profiles
  for insert
  with check (profile_id = auth.uid());

create policy "users can update their own shopper profiles" on shopper_profiles
  for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "users can delete their own shopper profiles" on shopper_profiles
  for delete
  using (profile_id = auth.uid());

-- Nullable size tag on the two places an item can be shown/bought. Neither
-- discoverOpportunities.ts nor claudeSearchAdapter.ts captures a size today
-- (a real gap, not part of tonight's scope) — these columns exist so the
-- shopping-for-size filter has somewhere to read from the moment sizing
-- does start getting captured (AI or manual), without needing another
-- migration then. Until a row has a size set, the filter treats it as
-- "matches everyone" rather than hiding it — real inventory never
-- disappears just because it isn't size-tagged yet.
alter table products add column if not exists size text;
alter table shop_items add column if not exists size text;

-- 0014: Wishlist / save for later.
--
-- 26 Aug 2026, Steven: "now you need to build all the features people have
-- come to expect from an online store. like catagories and basket and all
-- that jazz." Scoped via AskUserQuestion — wishlist was one of the four
-- confirmed features. Kept deliberately separate from /portfolio ("what
-- I've done") — this is "what I might do", same reasoning that gave
-- Fulfillment jobs its own nav tab rather than folding it into Portfolio.
--
-- Snapshot columns (product_name/image_url/price_gbp) rather than only a
-- live foreign key: shop_items rows are ephemeral per-unit (see 0013's
-- comment — one row per unit, consumed by a sale) and can vanish entirely
-- once every sibling unit sells out, but the wishlist entry should still
-- render something sensible even if the exact row it was saved from is
-- gone. Live availability is re-derived at read time by re-querying for a
-- matching product_name + price + status='available' (shop items) or by
-- checking the referenced product's current listings (peer products) —
-- see GET /api/wishlist.
create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  item_type text not null check (item_type in ('shop_item', 'product')),
  reference_shop_item_id uuid references shop_items(id) on delete set null,
  reference_product_id uuid references products(id) on delete set null,
  product_name text not null,
  image_url text,
  price_gbp numeric not null,
  created_at timestamptz not null default now(),
  -- One save per distinct item per person — keyed on product_name+price_gbp
  -- rather than the reference id, because a shop_item's reference id is one
  -- representative row out of a group that changes as sibling units sell
  -- (see 0013's comment); the same "product" should still only be saved
  -- once even if the exact row snapshotted differs between clicks. Re-saving
  -- the same thing is a no-op at the API layer too (POST /api/wishlist's
  -- dedupe check) — this is the belt-and-braces DB-level guarantee.
  unique (profile_id, item_type, product_name, price_gbp)
);

create index idx_wishlist_items_profile on wishlist_items(profile_id);

alter table wishlist_items enable row level security;

-- Owner-only on every operation — a wishlist is private, unlike the
-- publicly-readable shop_items/products it references.
create policy "users can read their own wishlist" on wishlist_items
  for select
  using (profile_id = auth.uid());

create policy "users can add to their own wishlist" on wishlist_items
  for insert
  with check (profile_id = auth.uid());

create policy "users can remove from their own wishlist" on wishlist_items
  for delete
  using (profile_id = auth.uid());

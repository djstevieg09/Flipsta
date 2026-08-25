-- 0009: broaden the categories real discovery searches, per Steven's ask
-- to widen coverage now that discovery is moving to twice a day instead of
-- every 2 hours (see apps/worker/src/index.ts, apps/worker/src/adapters/
-- claudeSearchAdapter.ts). Without a matching row here, discoverOpportunities.ts
-- silently drops any candidate in one of these categories — so this has to
-- be run before the new categories can actually produce anything.

insert into categories (name, slug) values
  ('Toys & Games', 'toys-games'),
  ('Fashion & Accessories', 'fashion-accessories'),
  ('Sports & Outdoors', 'sports-outdoors'),
  ('Baby & Kids', 'baby-kids'),
  ('Gaming', 'gaming')
on conflict (slug) do nothing;

-- 0015: explicit public-read policy on categories.
--
-- 26 Aug 2026, Steven: "i cant see the categories on the shop." The
-- categories table (0001_init.sql) has never had RLS enabled — every other
-- publicly-browsable table in this schema (shop_items, opportunities, etc.)
-- has RLS enabled WITH an explicit "using (true)" read policy rather than
-- relying on the implicit "RLS never turned on = default grants apply"
-- behaviour. That implicit behaviour is almost certainly why category
-- filtering already worked for the worker (service-role client bypasses
-- RLS entirely) while still being an unproven, unexplained gap for the new
-- public GET /api/categories route. This migration doesn't change what's
-- actually readable — categories were never access-controlled — it just
-- makes it explicit and consistent with the rest of the schema, so an
-- unrelated future project-level lockdown of default table grants can't
-- quietly break this again.
alter table categories enable row level security;

create policy "categories are publicly readable" on categories for select using (true);

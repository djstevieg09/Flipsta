-- 0001_init.sql only let a buyer read their own orders. A seller needs to
-- see the orders placed against their own listings too (GET /api/orders,
-- powering /portfolio's self-serve "my sales" view) — this was a real gap,
-- not a deliberate restriction.

create policy "sellers can read orders on their own listings" on orders
  for select using (
    exists (select 1 from listings l where l.id = orders.listing_id and l.seller_id = auth.uid())
  );

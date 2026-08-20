-- Sample data for local development. Safe to re-run against a fresh db.

insert into categories (name, slug) values
  ('Collectibles', 'collectibles'),
  ('Footwear', 'footwear'),
  ('Tech', 'tech'),
  ('Home & Kitchen', 'home-kitchen'),
  ('Beauty', 'beauty')
on conflict (name) do nothing;

insert into flip_index_snapshots (category_id, week_start, score)
select id, date_trunc('week', now())::date, v.score
from categories c
join (values
  ('Collectibles', 92),
  ('Footwear', 85),
  ('Tech', 71),
  ('Home & Kitchen', 58),
  ('Beauty', 64)
) as v(name, score) on v.name = c.name
on conflict (category_id, week_start) do nothing;

-- The LEGO 42211 proof-of-concept deal (Section 4), as a live opportunity.
insert into opportunities (
  category_id, source_tier, source_retailer, source_url, source_price_gbp,
  margin_band_low, margin_band_high, expected_margin_gbp, confidence_score,
  urgency_tier, action_clock_seconds, estimated_stock_units, per_customer_cap,
  starting_bid_gbp, instant_win_price_gbp, status, live_at, action_clock_expires_at, ai_reasoning
)
select
  c.id, 'Major UK high-street clearance', 'LEGO.com', 'https://www.lego.com/en-gb/product/lunar-outpost-42211', 53.99,
  0.18, 0.24, 24.01, 0.91,
  'hot', 1500, 40, 5,
  4.20, 11.28, 'live', now(), now() + interval '1500 seconds',
  'High confidence driven by consistent 90-day resale price stability, strong destination market depth, and a low return-rate history for this category.'
from categories c where c.slug = 'collectibles';

-- Sample supplier/courier partners (Section 12.2) — no auth.users dependency,
-- safe to seed on a fresh project.
insert into partners (name, type, status, commission_or_code, contact_email) values
  ('Screwfix Clearance', 'supplier', 'active', '8-12% tiered', 'trade@example-supplier.co.uk'),
  ('DPD Affiliate (Shopper.com)', 'courier', 'active', 'SHOPPER-DPD-2214', null),
  ('Evri Business', 'courier', 'active', 'EVRI-AFF-0091', null),
  ('Northgate Liquidation', 'supplier', 'pending', '10% flat', 'sales@northgate-example.co.uk');

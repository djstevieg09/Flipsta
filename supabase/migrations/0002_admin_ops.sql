-- Flipsta — Section 12 additions: Platform Operations, Trust & Compliance
-- Admin dashboard / ticketing, supplier & courier partners, reviews & ratings,
-- risk flags, audit log, and seller tax-reporting fields.
-- Run after 0001_init.sql (see INFRASTRUCTURE_TODO.md).

-- ============================================================
-- Staff roles & account status (Section 12.1)
-- ============================================================
alter table profiles add column role text not null default 'user' check (role in ('user', 'support', 'admin'));
alter table profiles add column status text not null default 'active' check (status in ('active', 'under_review', 'suspended'));

-- Admin routes authenticate the caller as normal, then check profiles.role
-- in the application layer (apps/web/lib/adminGuard.ts) and use the
-- service-role client to read/write across all sellers — the same pattern
-- already used for the Stripe webhook in 0001_init.sql. RLS below still
-- protects these tables from being read by an ordinary authenticated user
-- directly via the anon/public client.

-- ============================================================
-- Support ticketing (Section 12.1) — the single buyer/seller contact
-- channel for order disputes, by design (keeps the Section 5 blind-teaser
-- protection intact instead of letting DMs route around it).
-- ============================================================
create table tickets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('payment_dispute', 'buyback_claim', 'item_not_as_described', 'courier_issue', 'account')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_user', 'resolved')),
  subject text not null,
  body text not null,
  requester_id uuid not null references profiles(id) on delete cascade,
  related_order_id uuid references orders(id),
  assigned_admin_id uuid references profiles(id),
  sla_due_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_tickets_status on tickets(status);
create index idx_tickets_requester on tickets(requester_id);

-- Internal notes — never shown to the requester (Section 12.1).
create table ticket_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  admin_id uuid not null references profiles(id),
  note text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Supplier & courier partners (Section 12.2)
-- ============================================================
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('supplier', 'courier')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  commission_or_code text,
  contact_email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Reviews & seller ratings (Section 12.4)
-- ============================================================
create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) unique,
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index idx_reviews_seller on reviews(seller_id);

-- ============================================================
-- Risk & fraud flags (Section 12.1 — feeds off Sections 8.4 / 11.6)
-- ============================================================
create table risk_flags (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  seller_id uuid not null references profiles(id),
  detail text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_risk_flags_status on risk_flags(status);

-- ============================================================
-- Admin audit log (Section 12.1)
-- ============================================================
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Seller tax reporting (Section 12.6 — HMRC Digital Platform Reporting)
-- ============================================================
create table seller_tax_info (
  profile_id uuid primary key references profiles(id) on delete cascade,
  legal_name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  postcode text not null,
  country text not null default 'GB',
  tax_reference text,
  date_of_birth date,
  hmrc_reportable boolean not null default false,
  collected_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table tickets enable row level security;
alter table ticket_notes enable row level security;
alter table partners enable row level security;
alter table reviews enable row level security;
alter table risk_flags enable row level security;
alter table admin_audit_log enable row level security;
alter table seller_tax_info enable row level security;

-- Tickets: a user can see and create their own tickets. Staff read/write
-- everything via the service-role client (see apps/web/lib/adminGuard.ts),
-- which bypasses RLS entirely, so no "staff" policy is defined here.
create policy "users can read their own tickets" on tickets for select using (auth.uid() = requester_id);
create policy "users can open their own tickets" on tickets for insert with check (auth.uid() = requester_id);

-- Ticket notes are internal-only — no authenticated-role policy at all,
-- so only the service-role client (staff, via the API layer) can touch them.

-- Partners, risk flags, and the audit log are staff-only in the same way —
-- deliberately no policy grants them to the "authenticated" role.

-- Reviews are a public trust signal — readable by anyone. Writing a review
-- is gated in the API layer (apps/web/app/api/reviews/route.ts) on the
-- buyer actually owning a delivered order for that seller that hasn't been
-- reviewed yet — a check RLS alone can't easily express here.
create policy "reviews are publicly readable" on reviews for select using (true);
create policy "buyers can leave their own reviews" on reviews for insert with check (auth.uid() = buyer_id);

-- Seller tax info is sensitive — owner-only read/write; staff use the
-- service-role client for compliance/reporting purposes.
create policy "sellers manage their own tax info" on seller_tax_info for all using (auth.uid() = profile_id);

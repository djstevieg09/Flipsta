-- 0037: Resend email setup — welcome emails on signup + an admin-composed
-- promotional/marketing broadcast.
--
-- 18 Sept 2026, Steven: "i need to setup resend so it can send emails for
-- sign ups and promo stuff." Resend itself (flipsta.co.uk domain,
-- RESEND_API_KEY/NOTIFICATIONS_FROM_EMAIL on Render) is wired up outside
-- this migration — see INFRASTRUCTURE_TODO.md's Resend section. This
-- migration is the DB side of the two features that key off it:
--
-- 1. Welcome email — welcome_email_sent_at on profiles is the idempotency
--    marker a new worker job (sendWelcomeEmails.ts) uses, the same
--    "nullable timestamp, set once sent" pattern already used elsewhere
--    (e.g. seasonal_events' expiry handling) rather than a boolean, so the
--    admin dashboard can also show *when* it went out if that's ever
--    useful.
--
-- 2. Promo/marketing emails — notify_promotions is the opt-out flag,
--    exactly mirroring notify_deal_matches (0021_engagement_features.sql)
--    including the same "on by default, one click off, no dark patterns"
--    reasoning from the CMA/ICO research write-up. promo_broadcasts is the
--    admin-composed campaign itself: staff write a subject/body from
--    /admin/broadcasts, which inserts a 'pending' row here; a new worker
--    job (sendPromoBroadcasts.ts) is what actually resolves the recipient
--    list and sends, matching the existing "admin edits the real thing,
--    the worker acts on it" split used by discovery_focus/seasonal_events/
--    trending_signals feeding discoverOpportunities.ts. Doing the actual
--    sending from the worker (not the API route) avoids a web-request
--    timeout trying to email a whole user base synchronously.

alter table profiles add column if not exists welcome_email_sent_at timestamptz;
alter table profiles add column if not exists notify_promotions boolean not null default true;

-- Staff-only, service-role-only — same pattern as discovery_focus/
-- seasonal_events/trending_signals: RLS enabled, no policy defined, so
-- only the service-role client (used by every /api/admin/* route via
-- requireStaff) can touch it at all.
create table promo_broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  audience text not null default 'opted_in' check (audience in ('opted_in', 'all')),
  recipient_count integer not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index idx_promo_broadcasts_status on promo_broadcasts(status);

alter table promo_broadcasts enable row level security;

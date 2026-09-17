-- Run after 0006_subscription_billing.sql (see INFRASTRUCTURE_TODO.md).

-- ============================================================
-- Section 7 multi-platform listing — real seller-side account-linking.
-- Previously "cross-posting" had no concept of a seller actually connecting
-- their own eBay/Depop/Etsy/Whatnot/StockX account at all; the toggle on
-- /sell/new just ticked boxes and packages/shared/src/salesChannels.ts
-- simulated a successful post. This table is what a real OAuth
-- "Connect eBay" button (apps/web/app/api/channel-connections/[channel])
-- writes to once a seller has signed into their own account on that
-- platform and granted access — no API key ever passes through the seller's
-- hands. One row per seller per channel they've connected.
-- ============================================================
create table channel_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  channel text not null,
  external_account_id text,
  external_username text,
  -- Tokens are written only by the service-role client (the OAuth callback
  -- route) and must never be sent back to the browser — API responses to
  -- the seller only ever include channel/external_username/status/dates.
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'expired', 'error')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (profile_id, channel)
);

alter table channel_connections enable row level security;

-- A seller can see and remove only their own connections. Inserts/updates
-- during the OAuth callback go through the service-role client (same
-- pattern as the Stripe webhook in 0001_init.sql), which bypasses RLS —
-- this policy is what stops one seller reading or deleting another's row
-- via the ordinary authenticated client.
create policy "channel connections are owner-only" on channel_connections
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

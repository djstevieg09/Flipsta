-- 0020: "Flipsta It!" — a shopper requests a specific item under a target
-- price; an admin approves it (a real AI search costs real budget, same
-- reasoning as everything else gated behind admin action in this
-- codebase); the AI then searches specifically for that one item.
--
-- 26 Aug 2026, Steven: "Need a button that says Flipsta It! that when
-- pressed it then take the user to another page which will ask for as much
-- info as possible. like description and then ask for a photo, give the
-- user some google images to choose from. once clicked on photo and
-- description this then goes to admin panel to approve. Then admin click a
-- button AI then goes out and finds the deal that is under what the user is
-- looking to pay." Confirmed via a clarifying question: photo candidates
-- come from the AI's own web search (no new image-search API), and
-- notifying the shopper by text once found is a deliberately deferred
-- future step ("eventually this will send a message... but for now just
-- add the button and the UI") — so this table only needs to carry status
-- for an in-app view, not a notification queue.
--
-- Deliberately its own table, not an extension of buyer_wants (0001_init.sql,
-- Section 11.10) — buyer_wants is a peer reverse-auction where other human
-- resellers compete with offers; this is AI-sourced and admin-gated, a
-- genuinely different mechanism with a different set of actors.
create type buy_request_status as enum (
  'pending_approval',
  'approved',
  'rejected',
  'searching',
  'found',
  'not_found',
  'cancelled'
);

create table buy_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  description text not null,
  target_price_gbp numeric not null check (target_price_gbp > 0),
  -- The requester's own reference photo, picked from AI-found candidates
  -- (see the new find-photos endpoint) — null if they skipped that step.
  photo_url text,
  photo_source_url text,
  status buy_request_status not null default 'pending_approval',
  admin_note text,
  -- Filled in once an admin triggers the search and the AI finds a real match.
  found_product_name text,
  found_source_retailer text,
  found_source_url text,
  found_price_gbp numeric,
  found_image_url text,
  searched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_buy_requests_requester on buy_requests(requester_id, created_at desc);
create index idx_buy_requests_status on buy_requests(status);

alter table buy_requests enable row level security;

create policy "users can read their own buy requests" on buy_requests
  for select
  using (requester_id = auth.uid());

create policy "users can create their own buy requests" on buy_requests
  for insert
  with check (requester_id = auth.uid() and status = 'pending_approval');

-- Deliberately no owner update/delete policy. Every status transition
-- (approve/reject/search/cancel) goes through a server route using the
-- service-role client with its own application-level ownership/status
-- checks (see apps/web/app/api/buy-requests/[id]/route.ts and
-- apps/web/app/api/admin/buy-requests/*) — so a signed-in requester's own
-- Supabase client can never rewrite found_price_gbp or skip the approval
-- step by updating their own row directly. Same reasoning as the
-- staff-only tables in 0002_admin_ops.sql, just applied to a regular user
-- action (cancelling their own request) instead of a staff-only one.

-- 27 Aug 2026, Steven: "need a Ai chat bot that can assist with any quiries
-- people may have. needs to cover all areas before passing to a real agent.
-- need to set this up on the admin dashboard aswell so we can track who we
-- have spoken to etc." Confirmed via a clarifying question: floating widget
-- on every page; can look up the asker's own real account data (orders,
-- wallet, tickets), not just general FAQ; escalates by opening a real
-- ticket in the existing admin ticketing system (Section 12.1) rather than
-- building a separate live-handoff mechanism.
--
-- No conversation/message table existed anywhere in the schema before this
-- (tickets.body is a single field, not a thread) — this is a new,
-- deliberately separate pair of tables rather than trying to bend `tickets`
-- into also being a chat log.
create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  -- null = an anonymous, signed-out visitor asking a general question. The
  -- bot can still answer those (site/policy questions), it just can't look
  -- up account data or escalate to a ticket without a real profile to
  -- attach it to — see apps/web/app/api/chat/route.ts.
  profile_id uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'escalated', 'closed')),
  escalated_ticket_id uuid references tickets(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_chat_messages_conversation on chat_messages(conversation_id, created_at);
create index idx_chat_conversations_profile on chat_conversations(profile_id, created_at desc);
create index idx_chat_conversations_status on chat_conversations(status, updated_at desc);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

-- Read-only policies for a signed-in user to see their own past
-- conversations/messages (e.g. if the widget is ever extended to show chat
-- history). All writes go through /api/chat and /api/admin/chats using the
-- service-role client — the route needs to inject real account context
-- and, for anonymous visitors, there's no auth.uid() to check an insert
-- policy against anyway — same reasoning notification_log (migration 0021)
-- uses for being staff/service-role-only.
create policy "users read their own conversations" on chat_conversations
  for select using (auth.uid() = profile_id);
create policy "users read their own messages" on chat_messages
  for select using (
    exists (select 1 from chat_conversations c where c.id = conversation_id and c.profile_id = auth.uid())
  );

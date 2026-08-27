import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chats — Section 12.1, the "track who we have spoken to"
 * half of the support chatbot ask. Every conversation the widget has ever
 * had, newest-first, whether or not it was ever escalated — staff can spot
 * a bot that's repeatedly failing to help on a topic, not just the ones
 * that already became tickets.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();

  const { data: conversations, error } = await supabase
    .from("chat_conversations")
    .select("id, profile_id, status, escalated_ticket_id, created_at, updated_at, profiles(display_name)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (conversations ?? []).map((c: any) => c.id);
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("conversation_id, content, role, created_at")
    .in("conversation_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: true });

  const countByConvo = new Map<string, number>();
  const lastByConvo = new Map<string, string>();
  for (const m of messages ?? []) {
    countByConvo.set(m.conversation_id, (countByConvo.get(m.conversation_id) ?? 0) + 1);
    lastByConvo.set(m.conversation_id, m.content);
  }

  const result = (conversations ?? []).map((c: any) => ({
    id: c.id,
    displayName: c.profiles?.display_name ?? "Anonymous visitor",
    status: c.status,
    escalatedTicketId: c.escalated_ticket_id,
    messageCount: countByConvo.get(c.id) ?? 0,
    lastMessage: lastByConvo.get(c.id) ?? "",
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));

  return NextResponse.json({ conversations: result });
}

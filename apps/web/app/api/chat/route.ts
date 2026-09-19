import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { runSupportChatTurn, type ChatTurn } from "@/lib/supportChat";
import { ticketSlaDueAt } from "@flipsta/shared";

// Force-dynamic — every route here reads/writes live application data.
export const dynamic = "force-dynamic";

const MAX_HISTORY_MESSAGES = 20;

/**
 * Builds a short, real (never invented) summary of the signed-in shopper's
 * own account — their most recent activity across the same three purchase
 * surfaces used throughout the rest of the app, plus their wallet balance
 * and any open ticket. Deliberately small (a handful of most-recent rows,
 * not a full history dump) — this becomes system-prompt context on every
 * turn, so it needs to stay cheap and genuinely relevant, not exhaustive.
 */
async function buildAccountContext(supabase: ReturnType<typeof createSupabaseServiceClient>, profileId: string): Promise<string> {
  const [{ data: profile }, { data: orders }, { data: shopItems }, { data: wonOpps }, { data: slotPurchases }, { data: wallet }, { data: tickets }] =
    await Promise.all([
      // 19 Sept 2026 — flippy_coin_balance added. It's stored directly on
      // profiles (migration 0031) rather than summed from coin_transactions,
      // same reasoning the wallet balance below sums instead — coins are
      // used constantly (every deal-slot purchase) so a stored running
      // total is what the rest of the app already trusts as truth.
      supabase.from("profiles").select("display_name, subscription_tier, flippy_coin_balance").eq("id", profileId).maybeSingle(),
      supabase
        .from("orders")
        .select("id, price_gbp, status, created_at")
        .eq("buyer_id", profileId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("shop_items")
        .select("product_name, sold_price_gbp, status, paid_at, shipped_at, delivered_at")
        .eq("buyer_id", profileId)
        .order("paid_at", { ascending: false })
        .limit(5),
      // Legacy single-winner auction path (pre-18-Sept opportunities only —
      // won_by is never set for a fixed_price deal, see opportunity_slot_
      // purchases below instead).
      supabase
        .from("opportunities")
        .select("product_name, instant_win_price_gbp, status, created_at")
        .eq("won_by", profileId)
        .order("created_at", { ascending: false })
        .limit(5),
      // 19 Sept 2026 — this was missing entirely. Fixed-price deals
      // (migration 0034/0035, the mechanic almost every current opportunity
      // actually uses) record a buyer in opportunity_slot_purchases, not
      // opportunities.won_by — without this join the bot had zero awareness
      // of a shopper's actual recent deal-slot purchases.
      supabase
        .from("opportunity_slot_purchases")
        .select("price_coins, purchased_at, opportunities(product_name, status)")
        .eq("profile_id", profileId)
        .order("purchased_at", { ascending: false })
        .limit(5),
      supabase.from("wallet_transactions").select("amount_gbp").eq("profile_id", profileId),
      supabase
        .from("tickets")
        .select("id, subject, status, created_at")
        .eq("requester_id", profileId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const balanceGBP = (wallet ?? []).reduce((sum: number, t: any) => sum + Number(t.amount_gbp), 0);

  const lines: string[] = [];
  lines.push(`Name: ${profile?.display_name ?? "unknown"}. Subscription tier: ${profile?.subscription_tier ?? "free"}.`);
  lines.push(`Flippy Coin balance: ${profile?.flippy_coin_balance ?? 0} coins.`);
  lines.push(`Wallet balance: £${balanceGBP.toFixed(2)}.`);

  if (orders && orders.length > 0) {
    lines.push(
      `Recent marketplace orders: ${orders.map((o: any) => `£${Number(o.price_gbp).toFixed(2)} (${o.status}, ${new Date(o.created_at).toLocaleDateString("en-GB")})`).join("; ")}.`,
    );
  }
  if (shopItems && shopItems.length > 0) {
    lines.push(
      `Recent Flipsta Sourced Deals purchases: ${shopItems.map((s: any) => `${s.product_name} — £${Number(s.sold_price_gbp ?? 0).toFixed(2)} (${s.status})`).join("; ")}.`,
    );
  }
  if (slotPurchases && slotPurchases.length > 0) {
    lines.push(
      `Recent fixed-price deal slots bought: ${slotPurchases
        .map((s: any) => `${s.opportunities?.product_name ?? "an opportunity"} — ${s.price_coins} coins (${s.opportunities?.status ?? "unknown"}, ${new Date(s.purchased_at).toLocaleDateString("en-GB")})`)
        .join("; ")}.`,
    );
  }
  if (wonOpps && wonOpps.length > 0) {
    lines.push(
      `Recently won opportunities (legacy auction format): ${wonOpps.map((o: any) => `${o.product_name ?? "item"} — £${Number(o.instant_win_price_gbp).toFixed(2)} (${o.status})`).join("; ")}.`,
    );
  }
  if (tickets && tickets.length > 0) {
    lines.push(`Recent support tickets: ${tickets.map((t: any) => `"${t.subject}" (${t.status})`).join("; ")}.`);
  } else {
    lines.push("No support tickets on file.");
  }

  return lines.join("\n");
}

/**
 * POST /api/chat — one turn of the support chat widget. Body: { conversationId?: string, message: string }.
 * Creates a new conversation on the first message (profile_id set for a
 * signed-in shopper, null for an anonymous visitor — see migration 0023).
 * Always uses the service-role client: it needs to read across
 * orders/shop_items/opportunities/tickets to build real account context,
 * which RLS wouldn't allow a plain user-scoped client to do even for their
 * own rows in every one of those tables' current policies.
 */
export async function POST(req: NextRequest) {
  const { conversationId, message } = await req.json();
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "That message is too long — please shorten it." }, { status: 400 });
  }

  const auth = await getCurrentProfile();
  const supabase = createSupabaseServiceClient();

  let convoId = conversationId as string | undefined;
  if (convoId) {
    const { data: existing } = await supabase.from("chat_conversations").select("id, profile_id, status").eq("id", convoId).maybeSingle();
    // A conversation id that doesn't exist, or belongs to someone else,
    // silently starts a fresh one instead of erroring — the widget has no
    // good way to recover from a 404/403 mid-chat.
    if (!existing || (auth && existing.profile_id && existing.profile_id !== auth.userId) || (!auth && existing.profile_id)) {
      convoId = undefined;
    }
  }

  if (!convoId) {
    const { data: created, error: createError } = await supabase
      .from("chat_conversations")
      .insert({ profile_id: auth?.userId ?? null })
      .select("id")
      .single();
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
    convoId = created.id;
  }

  const { error: userMsgError } = await supabase.from("chat_messages").insert({ conversation_id: convoId, role: "user", content: message });
  if (userMsgError) return NextResponse.json({ error: userMsgError.message }, { status: 500 });

  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("conversation_id", convoId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);
  const history: ChatTurn[] = (historyRows ?? []).map((r: any) => ({ role: r.role as "user" | "assistant", content: r.content }));

  const accountContext = auth ? await buildAccountContext(supabase, auth.userId) : null;
  const result = await runSupportChatTurn(history, accountContext);

  await supabase.from("chat_messages").insert({ conversation_id: convoId, role: "assistant", content: result.message });

  let ticketId: string | null = null;
  if (result.escalate && auth) {
    const now = new Date();
    const { data: ticket } = await supabase
      .from("tickets")
      .insert({
        category: "account",
        priority: "medium",
        subject: "Chat escalation",
        body: result.escalateReason ?? "Escalated from the support chat widget — see the linked conversation for the full transcript.",
        requester_id: auth.userId,
        sla_due_at: ticketSlaDueAt("medium", now).toISOString(),
      })
      .select("id")
      .single();
    if (ticket) {
      ticketId = ticket.id;
      await supabase.from("chat_conversations").update({ status: "escalated", escalated_ticket_id: ticket.id, updated_at: now.toISOString() }).eq("id", convoId);
    }
  } else {
    await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
  }

  return NextResponse.json({ conversationId: convoId, message: result.message, escalated: Boolean(ticketId), ticketId });
}

import Anthropic from "@anthropic-ai/sdk";

/**
 * 27 Aug 2026, Steven: "need a Ai chat bot that can assist with any quiries
 * people may have. needs to cover all areas before passing to a real
 * agent." Same stub-until-configured / claude-sonnet-5 pattern as every
 * other Anthropic-backed feature in this codebase (see buyRequestSearch.ts,
 * claudeSearchAdapter.ts) — no web_search tool here though, this is meant
 * to answer from what it's told about Flipsta plus the asker's own real
 * account data, not go looking things up online.
 *
 * Deliberately a single forced tool-use call rather than a multi-step
 * agentic tool-calling loop: the account context (recent orders, wallet
 * balance, open tickets) is gathered server-side in api/chat/route.ts
 * *before* this call and handed in as plain text, the same "fetch the real
 * data first, then hand it to the model" shape claudeSearchAdapter.ts's
 * performance-signal note already uses. Simpler, cheaper, and means the
 * model is never one bad tool call away from leaking a different profile's
 * data — it only ever sees what the caller already decided this specific
 * signed-in user is allowed to see.
 */
const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export function isSupportChatConfigured(): boolean {
  return Boolean(client);
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type SupportChatResult = {
  message: string;
  escalate: boolean;
  escalateReason: string | null;
};

const RESPOND_TOOL = {
  name: "respond_to_shopper",
  description: "Send your reply to the shopper, and say whether this needs a human agent.",
  input_schema: {
    type: "object" as const,
    properties: {
      message: { type: "string", description: "Your reply, written directly to the shopper. Plain, friendly, no markdown formatting." },
      escalate: {
        type: "boolean",
        description:
          "True if you cannot genuinely resolve this yourself — a real dispute, a refund/payment problem, suspected fraud, a bug, anything account-specific you don't have enough information to fix, or the shopper directly asks for a human. False for anything you can actually answer from the briefing and account context you were given.",
      },
      escalate_reason: {
        type: "string",
        description: "One sentence, for the staff member who picks this up — what the shopper needs help with. Required if escalate is true.",
      },
    },
    required: ["message", "escalate"],
  },
};

const SYSTEM_PROMPT = `You are Flipsta's support assistant, embedded as a chat widget on flipsta.co.uk. Flipsta is a UK marketplace where an AI engine finds genuine retail clearance deals and turns each one into a live opportunity people bid on or buy outright.

WHAT'S ACTUALLY LIVE ON FLIPSTA (only state these as fact — if asked about anything else, say you're not sure and offer to check with a human):
- Opportunities: AI-sourced deals shown with category, margin band and confidence score, but the exact retailer/price/photo stay hidden until someone wins (this protects the deal from being copied). Subscribers bid in a live auction, or pay a shown "Instant Win" price to win immediately and unlock full detail. Payment is captured the moment someone wins.
- Shop ("Flipsta Sourced Deals"): AI-sourced items Flipsta sells directly — Buy Now, an independent reseller fulfils and ships it, payment is held until the buyer confirms delivery.
- Subscription tiers: Free (browse only, no bidding), Standard (~£15/mo, full bidding, 12% marketplace commission if you sell), Pro (~£35-45/mo, early access window, sniper mode auto-bidding, 8% commission), Elite (~£85-120/mo, syndicate leadership, 5% commission). Upgrading is self-serve at /upgrade via Stripe.
- Portfolio & Wallet: every win, purchase, referral credit and loyalty credit (1% of spend, automatic) is tracked in a real wallet ledger at /wallet.
- Referral programme: an existing user and the person they refer both get real wallet credit on signup.
- Reviews: verified purchasers can leave a star rating on a delivered order or Flipsta Sourced Deals item.
- "Flipsta It!": a shopper can describe a specific item and target price at /flipsta-it; Flipsta's admin team reviews it and the AI searches for a real match.
- Buyer Wants at /wants: a want-it-cheaper request other resellers can respond to with competing offers.
- Recommendations: signed-in shoppers may see a "Recommended for you" section based on their own real purchase history and saved sizes.

WHAT YOU CANNOT DO YOURSELF: process refunds, cancel or reverse a payment, change someone's subscription tier, resolve a dispute about a specific order, or promise a specific timeline on a claim. For any of these, or a bug report, or anything you're genuinely unsure about, or if the shopper directly asks for a human — set escalate to true and give one clear sentence for the staff member picking it up.

Style: plain, warm, concise — a couple of short sentences per answer unless real detail is needed. No markdown, no bullet lists, no emoji. Never invent a policy, price, or feature you weren't told about here — say you're not sure and offer to check, rather than guessing.`;

/**
 * Runs one turn of the support chat. `accountContext` is plain text
 * describing the signed-in shopper's own real data (recent orders, wallet
 * balance, open tickets) — omit entirely (undefined/empty) for a
 * signed-out visitor, in which case the model is told it can only answer
 * general questions and must ask them to sign in for anything
 * account-specific.
 */
export async function runSupportChatTurn(
  history: ChatTurn[],
  accountContext: string | null,
): Promise<SupportChatResult> {
  if (!client) {
    return {
      message: "Support chat isn't switched on yet — please use the contact form and a real member of the team will get back to you.",
      escalate: false,
      escalateReason: null,
    };
  }

  const contextBlock = accountContext
    ? `The shopper is signed in. Their real account data, gathered just now:\n${accountContext}\n\nUse this to answer specifically — never invent an order, amount, or status that isn't listed above.`
    : `This shopper is NOT signed in. You can answer general questions about how Flipsta works, but you have no account data for them — if they ask about their own orders, wallet, or a ticket, tell them to sign in first (you cannot escalate to a human for an anonymous visitor either, since there's no account to attach a ticket to).`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      system: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
      tools: [RESPOND_TOOL],
      tool_choice: { type: "tool", name: "respond_to_shopper" },
      messages: history.map((t) => ({ role: t.role, content: t.content })),
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "respond_to_shopper",
    );
    const input = toolUse?.input as { message?: string; escalate?: boolean; escalate_reason?: string } | undefined;
    if (!input?.message) {
      return {
        message: "Sorry, something went wrong on my end — please try again, or ask to speak to a real person.",
        escalate: false,
        escalateReason: null,
      };
    }

    // Signed-out visitors can't be escalated to a ticket (no profile to
    // attach it to, see the migration's comment) — the model is told this
    // in the prompt above, but enforce it here too rather than trusting it.
    return {
      message: input.message,
      escalate: Boolean(input.escalate) && accountContext !== null,
      escalateReason: input.escalate_reason ?? null,
    };
  } catch (err) {
    console.error("[supportChat] runSupportChatTurn failed:", err);
    return {
      message: "Sorry, something went wrong answering that — please try again, or ask to speak to a real person.",
      escalate: false,
      escalateReason: null,
    };
  }
}

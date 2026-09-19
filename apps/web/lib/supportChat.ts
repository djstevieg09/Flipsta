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
 *
 * 19 Sept 2026, Steven: "need to setup the support bot... needs to be
 * flippy answering, he must be jolly and helpful and have access to
 * peoples accounts to check info and accounts." This was already built
 * (27 Aug) but had drifted badly out of date — it still described the old
 * Free/Standard/Pro/Elite names, vague price ranges, "browse only" for
 * free/Bronze, and a plain "support assistant" voice with no mention of
 * Flippy Coins at all (the coin economy didn't exist yet when this was
 * first written). Rewritten below to (a) speak as Flippy by name with a
 * warm, jolly voice, and (b) match what's actually live today: firm
 * Bronze/Silver/Gold/Platinum pricing, the Flippy Coin economy, fixed-price
 * deal slots (replacing bidding for new opportunities since 18 Sept), and
 * the cascading early-access window. The account-context data this system
 * prompt is paired with was also missing the shopper's coin balance and
 * fixed-price deal purchases entirely — see buildAccountContext() in
 * api/chat/route.ts.
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

const SYSTEM_PROMPT = `You are Flippy, Flipsta's mascot, answering as the support chat widget on flipsta.co.uk. Flipsta is a UK marketplace where an AI engine finds genuine retail clearance deals and turns each one into an opportunity resellers can claim.

WHAT'S ACTUALLY LIVE ON FLIPSTA (only state these as fact — if asked about anything else, say you're not sure and offer to check with a human):
- Opportunities: AI-sourced deals shown with category, margin band and confidence score, but the exact retailer/price/photo stay hidden until someone claims a slot (this protects the deal from being copied). Most new opportunities are now FIXED-PRICE: a set number of slots at a fixed Flippy Coin price, first-come-first-served — buy a slot to lock it in and unlock full detail, no bidding involved. A few older listings still run the previous live-auction/"Instant Win" format from before deals moved to fixed pricing; treat that as the exception, not the norm.
- Cascading early access: Platinum sees a brand new opportunity immediately. Gold sees it 15 minutes later, Silver 30 minutes later, and Bronze (everyone) 45 minutes later. Nobody is hidden from a locked deal — it shows greyed out with a countdown, plus an option to upgrade tier on the spot to unlock it right away.
- Flippy Coins: Flipsta's in-app currency (1 coin = £1 of value) — spent to claim a deal slot and to buy items in the Coin Shop. Bought in bundles at /coins (Single £1, Starter 10 for £9.50, Growth 25 for £21.25, Arbitrage 75 for £56.25, Empire 150 for £90), or topped up automatically every billing cycle for paid subscribers (Silver +20/mo, Gold +77/mo, Platinum +200/mo — Bronze gets no monthly allowance but can still buy coins any time).
- Subscription tiers (billed monthly via Stripe, self-serve upgrade/downgrade/cancel at /upgrade): Bronze is free — browse everything, buy Flippy Coins, and claim deal slots by spending them, but no monthly coin allowance and no selling. Silver is £15/mo (20 coins/mo, sell on the marketplace at 12% commission). Gold is £45/mo (77 coins/mo, 15-minute early access, sniper mode auto-bidding on the legacy auction listings, AI "why" explainability on every opportunity, one-click multi-platform listing, 8% commission). Platinum is £90/mo (200 coins/mo, immediate early access, syndicate leadership, highest sniper budgets, 5% commission, priority support).
- Shop ("Flipsta Sourced Deals"): AI-sourced items Flipsta sells directly — Buy Now, an independent reseller fulfils and ships it, payment is held until the buyer confirms delivery.
- Wallet vs Coins — two separate balances, don't mix them up: the Wallet (/wallet) holds real GBP — marketplace sale proceeds, referral credit, loyalty credit; Flippy Coins are the separate in-app currency for deals and the Coin Shop.
- Referrals: two separate programmes both pay out. Sharing your personal referral link — you and the person you refer both get £5 real wallet credit when they sign up. Naming a friend directly on the signup form — you get 5 Flippy Coins straight away, and when that friend actually signs up you both get 15 Flippy Coins each.
- Share-a-sale bonus: sell something for a profit and share it to social media, and you get a free Flippy Coin.
- Reviews: verified purchasers can leave a star rating on a delivered order or Flipsta Sourced Deals item.
- "Flipsta It!": a shopper can describe a specific item and target price at /flipsta-it; Flipsta's admin team reviews it and the AI searches for a real match.
- Buyer Wants at /wants: a want-it-cheaper request other resellers can respond to with competing offers.
- Recommendations: signed-in shoppers may see a "Recommended for you" section based on their own real purchase history and saved sizes.

WHAT YOU CANNOT DO YOURSELF: process refunds, cancel or reverse a payment, change someone's subscription tier, grant or adjust a Flippy Coin balance, resolve a dispute about a specific order, look at or discuss anyone else's account, or promise a specific timeline on a claim. For any of these, or a bug report, or anything you're genuinely unsure about, or if the shopper directly asks for a human — set escalate to true and give one clear sentence for the staff member picking it up.

Style: you're a jolly, warm, upbeat fox — genuinely pleased to help, a little playful, never a stiff corporate script. Plain, friendly language, the odd exclamation mark is fine. You may use a single light emoji occasionally if it fits, but never more than one, and never when the shopper sounds upset, is reporting a problem, or you're escalating to a human — read the room and dial the jolliness down when it's not the moment for it. Still concise: a couple of short sentences per answer unless real detail is genuinely needed. No markdown, no bullet lists. Never invent a policy, price, or feature you weren't told about here — say you're not sure and offer to check, rather than guessing.`;

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
      message: "Ah, I'm not quite switched on yet! Please use the contact form and a real member of the team will get back to you.",
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
        message: "Oops, something went wrong on my end — mind trying that again, or I can get a real person to help?",
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
      message: "Oops, something went wrong answering that — mind trying again, or I can get a real person to help?",
      escalate: false,
      escalateReason: null,
    };
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { heuristicConfidenceScore } from "./scoring.js";

/**
 * Section 9.1's real two-tier AI pipeline, made pluggable: this is "the AI
 * element" — set ANTHROPIC_API_KEY and every newly discovered deal gets a
 * real Claude call instead of the margin/volatility heuristic. Without a
 * key it falls back to the heuristic automatically, same stub/real pattern
 * as apps/web/lib/stripe.ts and apps/web/lib/notifications.ts, so the
 * discovery pipeline is always runnable even with nothing configured.
 *
 * This is a single-tier stand-in for the doc's real two-tier design (a
 * cheap model screens volume, a stronger model deep-verifies shortlisted
 * candidates) — one Haiku call per candidate. Splitting into a genuine
 * two-tier pipeline is a reasonable next step once real deal volume makes
 * the cost worth optimising; see STATUS.md.
 */
const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export function isAiScoringConfigured(): boolean {
  return Boolean(client);
}

export interface DealForScoring {
  categoryName: string;
  sourceTier: string;
  sourceRetailer: string;
  sourcePriceGBP: number;
  estimatedResalePriceGBP: number;
  marginPct: number;
  priceVolatility: number;
  estimatedStockUnits: number;
}

export interface AiScoringResult {
  confidenceScore: number; // 0-1
  reasoning: string;
}

const SCORING_TOOL = {
  name: "score_opportunity",
  description: "Score a resale opportunity's confidence (0-1) with a short reasoning string.",
  input_schema: {
    type: "object" as const,
    properties: {
      confidence_score: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string", description: "1-2 sentences, buyer-facing, explaining the score." },
    },
    required: ["confidence_score", "reasoning"],
  },
};

/**
 * Falls back to the heuristic on any error (rate limit, network, malformed
 * response) — a bad AI call should never take discovery down, since the
 * heuristic is a reasonable answer on its own (see scoring.ts).
 */
export async function scoreOpportunity(deal: DealForScoring): Promise<AiScoringResult> {
  if (!client) {
    const confidence = heuristicConfidenceScore({ marginPct: deal.marginPct, priceVolatility: deal.priceVolatility });
    return { confidenceScore: confidence, reasoning: `Heuristic score (no ANTHROPIC_API_KEY set) — see INFRASTRUCTURE_TODO.md.` };
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      tools: [SCORING_TOOL],
      tool_choice: { type: "tool", name: "score_opportunity" },
      messages: [
        {
          role: "user",
          content: `Score this resale opportunity's confidence from 0-1, weighing margin size, price stability, and stock depth. Be conservative — this gates whether real users see the deal.

Category: ${deal.categoryName}
Source: ${deal.sourceTier} (${deal.sourceRetailer})
Source price: £${deal.sourcePriceGBP.toFixed(2)}
Estimated resale price: £${deal.estimatedResalePriceGBP.toFixed(2)}
Margin: ${(deal.marginPct * 100).toFixed(1)}%
Recent price volatility (0-1, higher = less stable): ${deal.priceVolatility.toFixed(2)}
Estimated stock units: ${deal.estimatedStockUnits}`,
        },
      ],
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    const input = toolUse?.input as { confidence_score?: number; reasoning?: string } | undefined;
    if (!input?.reasoning || typeof input.confidence_score !== "number") {
      throw new Error("Malformed tool response");
    }

    const confidence = Math.max(0, Math.min(1, input.confidence_score));
    return { confidenceScore: Math.round(confidence * 100) / 100, reasoning: input.reasoning };
  } catch (err) {
    console.error("[aiScoring] Claude call failed, falling back to heuristic:", err);
    const confidence = heuristicConfidenceScore({ marginPct: deal.marginPct, priceVolatility: deal.priceVolatility });
    return { confidenceScore: confidence, reasoning: `Heuristic fallback (AI call failed) — see server logs.` };
  }
}

/**
 * Fallback confidence scoring, used by aiScoring.ts whenever ANTHROPIC_API_KEY
 * isn't set (or the AI call fails) — see aiScoring.ts for the real Claude-backed
 * path. Margin size and price stability both push confidence up here, the
 * same two signals a real model weighs most heavily, so the fallback stays
 * directionally reasonable even with no AI configured at all.
 */
export function heuristicConfidenceScore(params: { marginPct: number; priceVolatility: number }): number {
  const marginSignal = clamp01(params.marginPct / 0.4); // 40%+ margin maxes this out
  const stabilitySignal = 1 - clamp01(params.priceVolatility);
  const score = 0.5 * marginSignal + 0.5 * stabilitySignal;
  return Math.round(clamp01(score) * 100) / 100;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

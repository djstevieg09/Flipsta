/**
 * 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill my
 * store with goods." Web-side counterpart to apps/worker/src/adapters/
 * awinClient.ts — same isXConfigured() stub pattern already used per-app
 * for a shared external key (see ANTHROPIC_API_KEY in both
 * lib/supportChat.ts here and the worker's claudeSearchAdapter.ts). Only
 * needs the programmes lookup — the admin page uses this to show which
 * merchant programmes Steven's account is actually approved for, so he
 * picks from a real list rather than typing an advertiser id blind. Actual
 * product-feed syncing lives entirely in the worker (jobs/syncAwinProducts.ts).
 */
const API_TOKEN = process.env.AWIN_API_TOKEN;
const PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID;

export function isAwinConfigured(): boolean {
  return Boolean(API_TOKEN && PUBLISHER_ID);
}

export interface AwinProgramme {
  id: string;
  name: string;
  status: string;
  primarySector?: string;
}

export async function fetchJoinedProgrammes(): Promise<AwinProgramme[]> {
  if (!isAwinConfigured()) throw new Error("Awin isn't configured — set AWIN_API_TOKEN and AWIN_PUBLISHER_ID.");

  const res = await fetch(
    `https://api.awin.com/publishers/${encodeURIComponent(PUBLISHER_ID!)}/programmes?relationship=joined`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } },
  );
  if (!res.ok) {
    throw new Error(`Awin programmes lookup failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
  }
  const rows = (await res.json()) as any[];
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? "Unnamed programme"),
    status: String(r.status ?? "unknown"),
    primarySector: r.primarySector ?? undefined,
  }));
}

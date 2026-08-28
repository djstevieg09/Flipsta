/**
 * 27 Aug 2026, Steven: "i would like to be able to offer my resellers the
 * oppotunity to do live selling via my site. a bit like QVC... i think
 * whatnot does this already." Confirmed answer to "how should hosts
 * actually broadcast": "Real video streaming" (not a virtual/chat-only
 * event).
 *
 * Cloudflare Stream is the vendor, chosen specifically because it's the
 * only mainstream option researched (27 Aug 2026) that supports BOTH
 * WHIP (WebRTC-HTTP Ingestion Protocol — the host broadcasts straight from
 * their own browser tab/camera, no OBS or any other software to install)
 * and a simple hosted-iframe player for viewers. A non-technical reseller
 * needing to install and configure separate broadcasting software would
 * have been a real adoption blocker.
 *
 * Same "isXConfigured()" stub pattern as isStripeConfigured/
 * isClaudeSearchConfigured — the rest of the app (in particular
 * api/live-shows/route.ts) checks this before ever offering "Go live" so
 * the feature just doesn't appear rather than failing at the API call, if
 * Cloudflare isn't set up yet. See INFRASTRUCTURE_TODO.md for account setup.
 */

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;
// The "customer code" Cloudflare gives you for building playback/iframe
// URLs (https://customer-<CODE>.cloudflarestream.com/...) — distinct from
// the account id, and not derivable from it, so it's its own env var.
const CF_CUSTOMER_CODE = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;

export function isCloudflareStreamConfigured(): boolean {
  return Boolean(CF_ACCOUNT_ID && CF_API_TOKEN && CF_CUSTOMER_CODE);
}

type CreateLiveInputResult = {
  liveInputUid: string;
  whipUrl: string;
  playbackUid: string;
};

/**
 * Creates one Cloudflare "Live Input" per show — called once, when a host
 * schedules/starts a show (see api/live-shows/route.ts POST). recording
 * mode "automatic" means every broadcast on this input is auto-recorded
 * and immediately available for on-demand playback afterward too, at no
 * extra setup — a nice free bonus (a show's replay), not something Steven
 * explicitly asked for but a natural side effect of the API's default.
 */
export async function createLiveInput(params: { showTitle: string }): Promise<CreateLiveInputResult> {
  if (!isCloudflareStreamConfigured()) {
    throw new Error(
      "Live video isn't configured yet — set CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN and CLOUDFLARE_STREAM_CUSTOMER_CODE on Render (see INFRASTRUCTURE_TODO.md).",
    );
  }

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/live_inputs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meta: { name: params.showTitle },
      recording: { mode: "automatic", timeoutSeconds: 60 },
      deleteRecordingAfterDays: 30,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    const message = data?.errors?.[0]?.message ?? `Cloudflare Stream API returned ${res.status}.`;
    throw new Error(`Couldn't create the live video input: ${message}`);
  }

  const result = data.result;
  return {
    liveInputUid: result.uid,
    whipUrl: result.webRTC.url,
    playbackUid: result.uid,
  };
}

/**
 * The hosted iframe URL a viewer's browser embeds directly — no
 * vendor-specific player library needed. Playback stays live the moment
 * the host starts broadcasting to the WHIP URL above, no separate "go
 * live" call to Cloudflare required.
 */
export function playbackIframeUrl(playbackUid: string): string {
  return `https://customer-${CF_CUSTOMER_CODE}.cloudflarestream.com/${playbackUid}/iframe?autoplay=true&muted=true`;
}

/**
 * Deletes the Live Input when a show ends/is cancelled — tidy-up so a
 * host's old, no-longer-live inputs don't pile up in the Cloudflare
 * dashboard. Never throws: this is best-effort cleanup, not something that
 * should block ending a show if Cloudflare's API has a blip (same
 * reasoning as awardLoyaltyCredit's own try/catch).
 */
export async function deleteLiveInput(liveInputUid: string): Promise<void> {
  if (!isCloudflareStreamConfigured()) return;
  try {
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/live_inputs/${liveInputUid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    });
  } catch (e) {
    console.error("[cloudflareStream] deleteLiveInput failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}

/**
 * 28 Aug 2026, Steven: "Yes build this multicast now" — Cloudflare Stream's
 * real "outputs" API (developers.cloudflare.com/stream/stream-live/simulcasting,
 * confirmed live 28 Aug 2026): a live input can push the SAME broadcast out
 * to up to 50 external RTMP destinations at once. This is the actual "cast
 * everywhere at once" mechanism — see migration 0029's comments for why
 * this only covers YouTube/Facebook/Instagram/TikTok/custom and NOT
 * eBay Live or Whatnot (neither exposes anything a third party can push
 * into, confirmed against both platforms' own help docs the same day).
 *
 * Known-good ingest URLs are prefilled by the UI for the well-documented
 * platforms (YouTube, Facebook); Instagram/TikTok/custom always need the
 * host to paste both the URL and key themselves, since those platforms'
 * exact ingest formats are less standardized and can change without
 * Cloudflare or Flipsta being able to detect it — a wrong value here just
 * means that one destination silently doesn't receive video, not a broken
 * broadcast (all destinations are independent).
 */
export async function createMulticastOutput(params: {
  liveInputUid: string;
  rtmpUrl: string;
  streamKey: string;
}): Promise<{ outputId: string }> {
  if (!isCloudflareStreamConfigured()) {
    throw new Error("Live video isn't configured yet — see INFRASTRUCTURE_TODO.md.");
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/live_inputs/${params.liveInputUid}/outputs`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: params.rtmpUrl, streamKey: params.streamKey, enabled: true }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    const message = data?.errors?.[0]?.message ?? `Cloudflare Stream API returned ${res.status}.`;
    throw new Error(`Couldn't add that destination: ${message}`);
  }
  return { outputId: data.result.uid };
}

/** Removes one multicast destination — best-effort, same reasoning as deleteLiveInput. */
export async function deleteMulticastOutput(liveInputUid: string, outputId: string): Promise<void> {
  if (!isCloudflareStreamConfigured()) return;
  try {
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/live_inputs/${liveInputUid}/outputs/${outputId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${CF_API_TOKEN}` } },
    );
  } catch (e) {
    console.error("[cloudflareStream] deleteMulticastOutput failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}

/** Well-known RTMP ingest URLs, used to prefill the host's "add destination" form. */
export const KNOWN_MULTICAST_RTMP_URLS: Partial<Record<"youtube" | "facebook" | "instagram" | "tiktok", string>> = {
  youtube: "rtmp://a.rtmp.youtube.com/live2",
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp/",
  // Instagram and TikTok don't have one stable, well-documented public
  // ingest URL the way YouTube/Facebook do — left blank so the host pastes
  // theirs directly from that platform's own live-streaming settings.
};

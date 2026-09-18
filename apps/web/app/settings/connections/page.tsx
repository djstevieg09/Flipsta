"use client";

import { useEffect, useState } from "react";
import PageHero from "@/app/components/PageHero";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";
import type { SubscriptionTier } from "@flipsta/shared";

type ChannelStatus = {
  channel: string;
  name: string;
  connectable: boolean;
  connected: boolean;
  externalUsername: string | null;
  connectedAt: string | null;
};

// Stand-in brand-colour badges — there's no vendor logo artwork in this
// codebase (or an image-generation tool in this session to draw one), so
// each channel gets an initials badge tinted toward that platform's own
// colours rather than a plain grey block.
const CHANNEL_BADGE_GRADIENT: Record<string, string> = {
  ebay: "linear-gradient(135deg,#e53238,#0064d2)",
  etsy: "linear-gradient(135deg,#f45800,#f9a339)",
  depop: "linear-gradient(135deg,#1a1a1a,#4a4a4a)",
  whatnot: "linear-gradient(135deg,#7c3aed,#a78bfa)",
  stockx: "linear-gradient(135deg,#0a0e17,#2fa84f)",
};

/**
 * Section 7 — 18 Sept 2026, Steven: "need to build the connected accounts
 * tab with all the vendors that we are going to have with buttons in the
 * logos saying connect and when connected say connected with a green
 * tick." SiteNav already linked here (/settings/connections) but the page
 * never existed — this is that page.
 *
 * Data comes straight from GET /api/channel-connections (channelOAuth.ts /
 * salesChannels.ts), which already knows both whether Flipsta itself is
 * wired up for a channel (`connectable` — env vars set, see
 * channelOAuth.ts's isChannelConnectConfigured) and whether this seller has
 * actually connected (`connected`, per-row in channel_connections). Three
 * states per row, not just on/off: connected (green tick + disconnect),
 * connectable-but-not-yet-connected (a real Connect link), and
 * not-connectable-yet (disabled, "coming soon" — nothing to click since
 * Steven hasn't finished that platform's own developer signup, see
 * INFRASTRUCTURE_TODO.md #9).
 *
 * Connecting a channel is also gated to Pro/Elite (TIER_ENTITLEMENTS.
 * multiPlatformListing — the same gate GET .../connect enforces server-side
 * with a 403), so a Standard/Free seller sees an upgrade prompt instead of
 * a button that would just 403 on click.
 *
 * The Connect control is a plain <a href>, not an onClick handler — the
 * connect route performs a real 302 redirect to the platform's own OAuth
 * login page, so it needs an actual top-level navigation.
 */
export default function ConnectedAccountsPage() {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [busyChannel, setBusyChannel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/channel-connections").then(async (r) => {
      if (r.status === 401) {
        setSignedIn(false);
        setLoading(false);
        return;
      }
      const d = await r.json();
      setChannels(d.channels ?? []);
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setTier(d.profile?.subscriptionTier ?? null))
      .catch(() => {});
  }, []);

  async function disconnect(channel: string) {
    setBusyChannel(channel);
    setMessage(null);
    const res = await fetch(`/api/channel-connections/${channel}/disconnect`, { method: "POST" });
    setBusyChannel(null);
    if (res.ok) {
      setMessage("Disconnected.");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setMessage(d.error ?? "Couldn't disconnect that right now.");
    }
  }

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to manage connected accounts.
      </p>
    );
  }

  const canConnect = tier ? TIER_ENTITLEMENTS[tier].multiPlatformListing : false;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHero
        eyebrow="Multi-platform listing"
        title={
          <>
            Connected <span className="text-gold">Accounts</span>
          </>
        }
        subtitle="Link your own eBay, Etsy, Depop, Whatnot and StockX accounts so a Quick List cross-posts everywhere at once."
        decorations={[
          { emoji: "🔌", className: "-top-4 -left-6", animate: "sway" },
          { emoji: "🔗", className: "top-2 -right-7", animate: "bob" },
          { emoji: "✅", className: "-bottom-3 left-1/3 w-10 h-10", boxed: true, sizeClassName: "text-lg", animate: "bob", delay: "0.4s" },
        ]}
      />

      {tier && !canConnect && (
        <div className="card text-sm">
          Connecting your own accounts to cross-post listings is a <span className="font-bold text-gold">Pro / Elite</span> feature.{" "}
          <a href="/upgrade" className="underline">Upgrade</a> to connect channels here.
        </div>
      )}

      {message && <div className="card text-sm">{message}</div>}
      {loading && <p className="text-textDim text-sm">Loading…</p>}

      <div className="space-y-3">
        {channels.map((c) => (
          <div key={c.channel} className="card flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-white text-sm shrink-0"
                style={{ background: CHANNEL_BADGE_GRADIENT[c.channel] ?? "linear-gradient(135deg,#f2b545,#ffd77a)" }}
                aria-hidden
              >
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm">{c.name}</div>
                {c.connected && c.externalUsername ? (
                  <div className="text-xs text-textDim truncate">Connected as {c.externalUsername}</div>
                ) : !c.connectable && !c.connected ? (
                  <div className="text-xs text-textFaint">Not connectable yet — coming soon</div>
                ) : null}
              </div>
            </div>

            {c.connected ? (
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-bold text-green flex items-center gap-1 whitespace-nowrap">
                  Connected <span aria-hidden>✓</span>
                </span>
                <button
                  onClick={() => disconnect(c.channel)}
                  disabled={busyChannel === c.channel}
                  className="text-xs font-bold border border-border rounded-lg px-3 py-1.5 hover:border-red text-textDim hover:text-red disabled:opacity-50 transition"
                >
                  {busyChannel === c.channel ? "…" : "Disconnect"}
                </button>
              </div>
            ) : canConnect && c.connectable ? (
              <a href={`/api/channel-connections/${c.channel}/connect`} className="btn btn-primary text-xs shrink-0">
                Connect
              </a>
            ) : (
              <button disabled className="btn btn-ghost text-xs shrink-0 opacity-50 cursor-not-allowed">
                Connect
              </button>
            )}
          </div>
        ))}
        {!loading && channels.length === 0 && (
          <p className="text-textDim text-sm">No channels configured yet.</p>
        )}
      </div>
    </div>
  );
}

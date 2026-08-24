"use client";

import { useEffect, useState } from "react";

type ChannelConnection = {
  channel: string;
  name: string;
  connectable: boolean;
  connected: boolean;
  externalUsername: string | null;
  connectedAt: string | null;
};

/**
 * Section 7 — "Connected accounts": the real seller-side of multi-platform
 * listing. A seller clicks Connect, is sent to sign into their own account
 * on that marketplace, grants access, and lands back here connected — no
 * API key ever shown to or handled by them. /sell/new only lets a seller
 * tick a channel to cross-post to once it shows connected here.
 *
 * "connectable: false" means Flipsta itself isn't set up for that channel
 * yet (no developer credentials on Render) — that's Steven's side to fix,
 * see INFRASTRUCTURE_TODO.md, not something a seller can do anything about.
 */
export default function ConnectionsPage() {
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyChannel, setBusyChannel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/channel-connections");
    const data = await res.json();
    if (res.ok) setChannels(data.channels);
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const channel = params.get("channel");
    if (status === "connected" && channel) setNotice(`${channel} connected.`);
    if (status === "error") setError(params.get("message") ?? "The connection attempt failed.");
    load();
  }, []);

  async function disconnect(channel: string) {
    setBusyChannel(channel);
    setError(null);
    const res = await fetch(`/api/channel-connections/${channel}/disconnect`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Couldn't disconnect.");
    await load();
    setBusyChannel(null);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connected accounts</h1>
        <p className="text-textDim text-sm">
          Connect your own account on each marketplace once — sign in on their site, grant access, done. After that,
          cross-posting a listing from <span className="font-mono">/sell/new</span> is a single click, no further
          setup per listing.
        </p>
      </div>

      {notice && <p className="text-sm text-green">{notice}</p>}
      {error && <p className="text-sm text-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-textDim">Loading…</p>
      ) : (
        <div className="space-y-2">
          {channels.map((c) => (
            <div key={c.channel} className="card flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{c.name}</p>
                {c.connected ? (
                  <p className="text-xs text-green">
                    Connected{c.externalUsername ? ` as ${c.externalUsername}` : ""}
                    {c.connectedAt ? ` · ${new Date(c.connectedAt).toLocaleDateString()}` : ""}
                  </p>
                ) : c.connectable ? (
                  <p className="text-xs text-textDim">Not connected yet.</p>
                ) : (
                  <p className="text-xs text-gold">Not set up on Flipsta's side yet — see INFRASTRUCTURE_TODO.md.</p>
                )}
              </div>
              {c.connected ? (
                <button className="btn" disabled={busyChannel === c.channel} onClick={() => disconnect(c.channel)}>
                  {busyChannel === c.channel ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <a
                  className={`btn btn-primary ${!c.connectable ? "pointer-events-none opacity-40" : ""}`}
                  href={c.connectable ? `/api/channel-connections/${c.channel}/connect` : undefined}
                  aria-disabled={!c.connectable}
                >
                  Connect
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

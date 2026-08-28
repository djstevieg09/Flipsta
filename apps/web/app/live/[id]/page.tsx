"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Show = {
  id: string;
  title: string;
  description: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  host_id: string;
  hostDisplayName: string;
  playbackUrl: string | null;
  scheduled_at: string | null;
  overlay_theme: "classic" | "bold" | "minimal";
};

type Item = {
  id: string;
  listing_id: string;
  position: number;
  starting_bid_gbp: number;
  buy_now_price_gbp: number | null;
  shipping_gbp: number | null;
  status: "upcoming" | "active" | "sold" | "unsold";
  ends_at: string | null;
  winning_bid_gbp: number | null;
  listings: { price_gbp: number; products: { title: string; condition: string; image_url: string | null } | null } | null;
};

type Bid = { id: string; amount_gbp: number; bidder_id: string; created_at: string };
type ChatMessage = { id: string; profile_id: string; message: string; created_at: string; display_name?: string };
type MyListing = { id: string; price_gbp: number; sold_at: string | null; products: { title: string } | null };
type MulticastTarget = { id: string; platform: string; label: string | null; rtmp_url: string; created_at: string };

// 28 Aug 2026, Steven: "needs a design tool so people can design the
// viewing window, maybe a banner showing the current item and what's
// coming up next. Have multiple options." Three fixed CSS presets rather
// than a drag-and-drop editor (kept in sync with migration 0029's
// overlay_theme check constraint and live/new/page.tsx's picker) —
// each just repositions/restyles the same "now selling / up next" banner.
const OVERLAY_THEMES: Record<string, { wrap: string; label: string; sub: string }> = {
  classic: {
    wrap: "absolute bottom-0 inset-x-0 bg-brand/90 backdrop-blur-sm text-white px-4 py-2 flex items-center justify-between gap-3 flex-wrap",
    label: "text-sm font-bold",
    sub: "text-xs text-white/80",
  },
  bold: {
    wrap: "absolute top-0 inset-x-0 bg-black/90 text-white px-4 py-3 flex items-center justify-between gap-3 border-b-2 border-brand flex-wrap",
    label: "text-lg font-extrabold uppercase tracking-wide",
    sub: "text-sm text-brand font-bold",
  },
  minimal: {
    wrap: "absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg flex items-center gap-2 max-w-[80%]",
    label: "text-xs font-bold",
    sub: "text-[10px] text-white/70",
  },
};

// Chat overlay sits in whichever corner the banner isn't using, so the two
// never overlap regardless of theme.
const CHAT_OVERLAY_POSITION: Record<string, string> = {
  classic: "absolute left-2 top-2",
  bold: "absolute left-2 bottom-2",
  minimal: "absolute left-2 bottom-2",
};

// 28 Aug 2026, Steven: "This needs to be cast across all connected
// platforms reaching everywhere at once." Research confirmed eBay Live and
// Whatnot have no third-party ingest API at all (see multicast route's own
// comments) — this covers only the genuinely feasible destinations, prefilled
// from Cloudflare's own documented RTMP endpoints where one exists.
// Kept as a plain local copy (not imported from lib/cloudflareStream.ts)
// since that module is server-only and this is a "use client" page.
const KNOWN_RTMP_URLS: Partial<Record<string, string>> = {
  youtube: "rtmp://a.rtmp.youtube.com/live2",
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp/",
};

/**
 * 27 Aug 2026 — the live-show room: video (Cloudflare Stream hosted
 * iframe), the item queue with live bidding, host controls, and chat.
 * Chat is the one piece that goes STRAIGHT to Supabase via Realtime
 * (insert + subscribe) rather than through a Next.js API route — see
 * migration 0027's comment on live_chat_messages for why.
 */
export default function LiveShowPage() {
  const params = useParams<{ id: string }>();
  const showId = params.id;
  const supabase = createSupabaseBrowserClient();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myTier, setMyTier] = useState<string | null>(null);
  const [show, setShow] = useState<Show | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [highBidByItem, setHighBidByItem] = useState<Record<string, Bid | null>>({});
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [addListingId, setAddListingId] = useState("");
  const [addStartingBid, setAddStartingBid] = useState("");
  const [addBuyNow, setAddBuyNow] = useState("");
  const [addShipping, setAddShipping] = useState("");

  // Multicast destinations (host only) — see api/live-shows/[id]/multicast.
  const [multicastTargets, setMulticastTargets] = useState<MulticastTarget[]>([]);
  const [mcPlatform, setMcPlatform] = useState("youtube");
  const [mcLabel, setMcLabel] = useState("");
  const [mcRtmpUrl, setMcRtmpUrl] = useState(KNOWN_RTMP_URLS.youtube ?? "");
  const [mcStreamKey, setMcStreamKey] = useState("");
  const [mcBusy, setMcBusy] = useState(false);
  const [mcMessage, setMcMessage] = useState<string | null>(null);

  // WHIP broadcast state (host only) — see startBroadcast/stopBroadcast
  // below. localVideoRef is the host's own camera preview; the
  // RTCPeerConnection and the WHIP "resource" URL (from the Location
  // header WHIP returns, needed to DELETE and cleanly stop) live in refs
  // since they're not something a re-render should ever recreate.
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const whipResourceUrlRef = useRef<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  const isHost = Boolean(myUserId && show && myUserId === show.host_id);

  async function loadShow() {
    const res = await fetch(`/api/live-shows/${showId}`);
    const data = await res.json();
    if (res.ok) setShow(data.show);
  }

  async function loadItems() {
    const res = await fetch(`/api/live-shows/${showId}/items`);
    const data = await res.json();
    if (!res.ok) return;
    const list: Item[] = data.items ?? [];
    setItems(list);

    // Highest bid per active item, for the current-floor display — a
    // second small fetch per active item rather than a heavier joined
    // query, since there's normally at most one active item at a time.
    const active = list.filter((i) => i.status === "active");
    const entries = await Promise.all(
      active.map(async (i) => {
        const { data: bids } = await supabase
          .from("live_bids")
          .select("id, amount_gbp, bidder_id, created_at")
          .eq("live_show_item_id", i.id)
          .order("amount_gbp", { ascending: false })
          .limit(1);
        return [i.id, bids && bids.length > 0 ? (bids[0] as Bid) : null] as const;
      }),
    );
    setHighBidByItem(Object.fromEntries(entries));
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMyTier(d.profile?.subscriptionTier ?? null));
  }, []);

  useEffect(() => {
    loadShow();
    loadItems();
    const t = setInterval(() => {
      loadShow();
      loadItems();
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Chat: initial history via a direct public-read select, then a Realtime
  // subscription for anything posted after that — no API route involved.
  useEffect(() => {
    let active = true;
    supabase
      .from("live_chat_messages")
      .select("id, profile_id, message, created_at, profiles(display_name)")
      .eq("live_show_id", showId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!active || !data) return;
        setChat(data.map((m: any) => ({ ...m, display_name: m.profiles?.display_name })));
      });

    const channel = supabase
      .channel(`live_chat_${showId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `live_show_id=eq.${showId}` },
        (payload) => {
          setChat((prev) => [...prev, payload.new as ChatMessage]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  useEffect(() => {
    if (!isHost) return;
    fetch("/api/listings?mine=true")
      .then((r) => r.json())
      .then((d) => setMyListings((d.listings ?? []).filter((l: MyListing) => !l.sold_at)));
  }, [isHost]);

  async function loadMulticastTargets() {
    const res = await fetch(`/api/live-shows/${showId}/multicast`);
    const data = await res.json();
    if (res.ok) setMulticastTargets(data.targets ?? []);
  }

  useEffect(() => {
    if (!isHost) return;
    loadMulticastTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  async function sendChat() {
    if (!chatInput.trim() || !myUserId) return;
    const text = chatInput.trim().slice(0, 500);
    setChatInput("");
    await supabase.from("live_chat_messages").insert({ live_show_id: showId, profile_id: myUserId, message: text });
  }

  async function showAction(action: "start" | "end" | "cancel") {
    setBusy(true);
    const res = await fetch(`/api/live-shows/${showId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setMessage(data.error);
    else loadShow();
  }

  async function itemAction(itemId: string, action: "activate" | "skip") {
    const res = await fetch(`/api/live-shows/${showId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) setMessage(data.error);
    else loadItems();
  }

  // 28 Aug 2026, Steven: "need... the ability to have the items in the
  // order they want to sell them in."
  async function moveItem(itemId: string, direction: "up" | "down") {
    const res = await fetch(`/api/live-shows/${showId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", direction }),
    });
    const data = await res.json();
    if (!res.ok) setMessage(data.error);
    else loadItems();
  }

  async function placeBid(itemId: string, floor: number) {
    const amount = Math.round((floor + 1) * 100) / 100;
    const res = await fetch(`/api/live-shows/${showId}/items/${itemId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountGBP: amount }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Bid £${amount.toFixed(2)} placed.` : data.error);
    loadItems();
  }

  async function buyNow(itemId: string) {
    const res = await fetch(`/api/live-shows/${showId}/items/${itemId}/buy-now`, { method: "POST" });
    const data = await res.json();
    setMessage(res.ok ? "Bought it! Check your basket/orders for payment." : data.error);
    loadItems();
  }

  async function addItem() {
    if (!addListingId || !addStartingBid) return;
    const res = await fetch(`/api/live-shows/${showId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: addListingId,
        startingBidGBP: Number(addStartingBid),
        buyNowPriceGBP: addBuyNow ? Number(addBuyNow) : null,
        shippingGBP: addShipping ? Number(addShipping) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setMyListings((prev) => prev.filter((l) => l.id !== addListingId));
    setAddListingId("");
    setAddStartingBid("");
    setAddBuyNow("");
    setAddShipping("");
    loadItems();
  }

  // 28 Aug 2026, Steven: "This needs to be cast across all connected
  // platforms reaching everywhere at once." Confirmed via research + an
  // AskUserQuestion to Steven: eBay/Whatnot have no third-party ingest API
  // (hard technical wall), so this covers YouTube/Facebook/Instagram/TikTok
  // via Cloudflare Stream's real Outputs API instead.
  async function addMulticastTarget() {
    if (!mcRtmpUrl.trim() || !mcStreamKey.trim()) {
      setMcMessage("RTMP URL and stream key are both required.");
      return;
    }
    setMcBusy(true);
    setMcMessage(null);
    const res = await fetch(`/api/live-shows/${showId}/multicast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: mcPlatform, label: mcLabel.trim() || undefined, rtmpUrl: mcRtmpUrl.trim(), streamKey: mcStreamKey.trim() }),
    });
    const data = await res.json();
    setMcBusy(false);
    if (!res.ok) {
      setMcMessage(data.error ?? "Couldn't add that destination.");
      return;
    }
    setMcLabel("");
    setMcStreamKey("");
    loadMulticastTargets();
  }

  async function removeMulticastTarget(targetId: string) {
    await fetch(`/api/live-shows/${showId}/multicast/${targetId}`, { method: "DELETE" });
    loadMulticastTargets();
  }

  /**
   * WHIP (WebRTC-HTTP Ingestion Protocol) browser broadcast — the whole
   * reason Cloudflare Stream was chosen over any vendor needing OBS or
   * other separate software (see lib/cloudflareStream.ts's own comment).
   * Standard WHIP publish flow: capture camera+mic, build an SDP offer,
   * POST it as the request body to the WHIP url, the server answers with
   * the SDP answer plus a Location header identifying this broadcast
   * session (needed later to DELETE and stop cleanly).
   *
   * NOTE for Steven / whoever tests this first: this is written to the
   * documented WHIP spec and Cloudflare's own published examples, but
   * hasn't been exercised against a real Cloudflare Stream account in
   * this environment (no live credentials here) — worth a real test
   * broadcast (even just to yourself) the first time this runs for real.
   */
  async function startBroadcast() {
    setBroadcastError(null);
    try {
      const res = await fetch(`/api/live-shows/${showId}/stream-key`);
      const data = await res.json();
      if (!res.ok) {
        setBroadcastError(data.error ?? "Couldn't get a broadcast key for this show.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      peerConnectionRef.current = pc;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // WHIP publish: POST the SDP offer, get the SDP answer back plus a
      // Location header for this broadcast session.
      const whipRes = await fetch(data.whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!whipRes.ok) {
        setBroadcastError(`Broadcast connection failed (${whipRes.status}).`);
        pc.close();
        peerConnectionRef.current = null;
        return;
      }
      const location = whipRes.headers.get("Location");
      whipResourceUrlRef.current = location ? new URL(location, data.whipUrl).toString() : null;

      const answerSdp = await whipRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setBroadcasting(true);
    } catch (e) {
      setBroadcastError(
        e instanceof Error
          ? `Couldn't start broadcasting: ${e.message} (check your browser has granted camera/microphone access).`
          : "Couldn't start broadcasting.",
      );
    }
  }

  async function stopBroadcast() {
    peerConnectionRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (whipResourceUrlRef.current) {
      try {
        await fetch(whipResourceUrlRef.current, { method: "DELETE" });
      } catch {
        // Best-effort — the connection dropping on its own also ends the
        // broadcast from Cloudflare's side within a short timeout.
      }
    }
    whipResourceUrlRef.current = null;
    setBroadcasting(false);
  }

  // Stop the camera/connection if the host navigates away without
  // pressing "Stop broadcasting" — a dangling open camera would otherwise
  // keep streaming after they've left the page.
  useEffect(() => {
    return () => {
      peerConnectionRef.current?.getSenders().forEach((sender) => sender.track?.stop());
      peerConnectionRef.current?.close();
    };
  }, []);

  if (!show) return <p className="text-textDim text-sm">Loading…</p>;

  const activeItem = items.find((i) => i.status === "active");
  const nextItem = items
    .filter((i) => i.status === "upcoming")
    .sort((a, b) => a.position - b.position)[0];
  const theme = OVERLAY_THEMES[show.overlay_theme] ?? OVERLAY_THEMES.classic;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {show.title}
            {show.status === "live" && <span className="text-xs font-bold text-red-400 border border-red-400 rounded-full px-2 py-0.5">● LIVE</span>}
          </h1>
          <p className="text-textDim text-sm">Hosted by {show.hostDisplayName}</p>
          {show.description && <p className="text-sm mt-1">{show.description}</p>}
        </div>

        <div className="card p-0 overflow-hidden aspect-video bg-black flex items-center justify-center relative">
          {isHost && (broadcasting || show.status === "live") ? (
            // The host sees their OWN camera preview (not the round-trip
            // through Cloudflare, which has a few seconds of latency) —
            // viewers get the real playbackUrl iframe below instead.
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          ) : show.status === "live" && show.playbackUrl ? (
            <iframe src={show.playbackUrl} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />
          ) : show.status === "scheduled" ? (
            <div className="text-center space-y-3 p-4">
              {(() => {
                if (!show.scheduled_at) return <p className="text-textDim text-sm">Not live yet — check back soon.</p>;
                const secondsUntil = Math.round((new Date(show.scheduled_at).getTime() - now) / 1000);
                // 28 Aug 2026, Steven: "i need it 5 minutes before the show
                // goes live to show a countdown and a link that people can
                // click on to then take them to my site so they can sign
                // up." Plain date beyond 5 minutes out; a live-ticking
                // countdown once inside that window, since a countdown
                // shown days in advance just looks broken/stale.
                if (secondsUntil > 300) {
                  return <p className="text-textDim text-sm">Starts {new Date(show.scheduled_at).toLocaleString()}</p>;
                }
                const clamped = Math.max(0, secondsUntil);
                const mm = Math.floor(clamped / 60).toString().padStart(2, "0");
                const ss = (clamped % 60).toString().padStart(2, "0");
                return (
                  <p className="text-2xl font-bold">
                    {clamped > 0 ? (
                      <>
                        Starts in {mm}:{ss}
                      </>
                    ) : (
                      "Starting any moment…"
                    )}
                  </p>
                );
              })()}
              {!myUserId && (
                <div>
                  <a href="/signup" className="btn btn-primary text-sm px-4 py-2 inline-block">
                    Sign up so you're ready to bid
                  </a>
                  {/* Signup requires an email confirmation step (see
                      /signup), so there's no reliable way to bounce someone
                      straight back to THIS show afterward — this line just
                      tells them to keep the link instead of silently
                      dropping them somewhere else. */}
                  <p className="text-xs text-textDim mt-1">Come back to this link once you're signed in.</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-textDim text-sm">This show has ended.</p>
          )}
          {isHost && broadcasting && (
            <span className="absolute top-2 left-2 text-xs font-bold text-white bg-red-500 rounded-full px-2 py-0.5">● Broadcasting</span>
          )}

          {/* 28 Aug 2026, Steven: "a banner showing the current item and
              what's coming up next." Only shown once the show is actually
              live and there's something to say — a banner over a countdown
              or an ended show would just be clutter. */}
          {show.status === "live" && (activeItem || nextItem) && (
            <div className={theme.wrap}>
              {activeItem && (
                <div>
                  <p className={theme.label}>Now selling: {activeItem.listings?.products?.title ?? "Untitled item"}</p>
                  <p className={theme.sub}>
                    Current bid £{(highBidByItem[activeItem.id]?.amount_gbp ?? activeItem.starting_bid_gbp).toFixed(2)}
                  </p>
                </div>
              )}
              {nextItem && (
                <div className="text-right">
                  <p className={theme.sub}>Up next</p>
                  <p className={theme.label}>{nextItem.listings?.products?.title ?? "Untitled item"}</p>
                </div>
              )}
            </div>
          )}

          {/* 28 Aug 2026, Steven: "need to show the messages on screen like
              whatnot and all the other sites, match ours to make it seem
              familiar." Additive, not a replacement for the side panel
              below — pointer-events-none so it never blocks clicks on the
              video/controls beneath it. */}
          {show.status === "live" && chat.length > 0 && (
            <div className={`${CHAT_OVERLAY_POSITION[show.overlay_theme] ?? CHAT_OVERLAY_POSITION.classic} max-w-[65%] space-y-1 pointer-events-none`}>
              {chat.slice(-4).map((m) => (
                <p key={m.id} className="text-xs bg-black/50 backdrop-blur-sm text-white rounded-lg px-2 py-1 inline-block">
                  <span className="font-bold text-brand">{m.display_name ?? "Someone"}:</span> {m.message}
                </p>
              ))}
            </div>
          )}
        </div>

        {isHost && (
          <div className="card p-4 space-y-2">
            <p className="text-xs font-bold text-textDim uppercase">Host controls</p>
            <div className="flex gap-2 flex-wrap">
              {show.status === "scheduled" && (
                <>
                  <button className="btn btn-primary text-xs px-3 py-1.5" disabled={busy} onClick={() => showAction("start")}>
                    Go live
                  </button>
                  <button className="btn btn-ghost text-xs px-3 py-1.5" disabled={busy} onClick={() => showAction("cancel")}>
                    Cancel show
                  </button>
                </>
              )}
              {show.status === "live" && !broadcasting && (
                <button className="btn btn-primary text-xs px-3 py-1.5" onClick={startBroadcast}>
                  Start broadcasting (camera)
                </button>
              )}
              {show.status === "live" && broadcasting && (
                <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={stopBroadcast}>
                  Stop broadcasting
                </button>
              )}
              {show.status === "live" && (
                <button className="btn btn-ghost text-xs px-3 py-1.5" disabled={busy} onClick={() => showAction("end")}>
                  End show
                </button>
              )}
            </div>
            {broadcastError && <p className="text-red-400 text-xs">{broadcastError}</p>}
            {show.status !== "ended" && show.status !== "cancelled" && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs text-textDim">Add another item from your listings:</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={addListingId} onChange={(e) => setAddListingId(e.target.value)} className="bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs">
                    <option value="">Choose a listing…</option>
                    {myListings.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.products?.title ?? "Untitled"} — £{l.price_gbp}
                      </option>
                    ))}
                  </select>
                  <input type="number" placeholder="Starting bid" value={addStartingBid} onChange={(e) => setAddStartingBid(e.target.value)} className="w-28 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs" />
                  <input type="number" placeholder="Buy-now (optional)" value={addBuyNow} onChange={(e) => setAddBuyNow(e.target.value)} className="w-32 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs" />
                  <input type="number" min="0" step="0.01" placeholder="P&P (optional)" value={addShipping} onChange={(e) => setAddShipping(e.target.value)} className="w-28 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs" />
                  <button className="btn btn-primary text-xs px-3 py-1.5" onClick={addItem}>
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* 28 Aug 2026, Steven: "This needs to be cast across all
                connected platforms reaching everywhere at once." Only the
                genuinely feasible destinations (see this file's own
                comment above KNOWN_RTMP_URLS) — the stream key is
                write-only, never shown back after saving. */}
            {show.status !== "ended" && show.status !== "cancelled" && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs text-textDim">Also broadcast to (multicast):</p>
                {multicastTargets.length > 0 && (
                  <div className="space-y-1">
                    {multicastTargets.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 text-xs bg-surface2 rounded-lg px-2 py-1.5">
                        <span className="capitalize">{t.label ? `${t.label} (${t.platform})` : t.platform}</span>
                        <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => removeMulticastTarget(t.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={mcPlatform}
                    onChange={(e) => {
                      setMcPlatform(e.target.value);
                      setMcRtmpUrl(KNOWN_RTMP_URLS[e.target.value] ?? "");
                    }}
                    className="bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="youtube">YouTube</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="custom">Custom (any RTMP)</option>
                  </select>
                  <input placeholder="Label (optional)" value={mcLabel} onChange={(e) => setMcLabel(e.target.value)} className="w-32 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs" />
                  <input placeholder="RTMP URL" value={mcRtmpUrl} onChange={(e) => setMcRtmpUrl(e.target.value)} className="w-44 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs" />
                  <input placeholder="Stream key" value={mcStreamKey} onChange={(e) => setMcStreamKey(e.target.value)} className="w-40 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs" />
                  <button className="btn btn-primary text-xs px-3 py-1.5" onClick={addMulticastTarget} disabled={mcBusy}>
                    Add destination
                  </button>
                </div>
                <p className="text-xs text-textDim">
                  Get the RTMP URL and stream key from each platform's own "go live" / stream-setup page (e.g. YouTube Studio → Go Live, Facebook
                  Live Producer). Up to 50 destinations, added while the show is scheduled or live.
                </p>
                {mcMessage && <p className="text-red-400 text-xs">{mcMessage}</p>}
              </div>
            )}
          </div>
        )}

        {message && <p className="text-sm text-brand">{message}</p>}

        <div className="space-y-3">
          <h2 className="text-lg font-bold">Items ({items.length})</h2>
          {items.length === 0 && <p className="text-textDim text-sm">No items queued yet.</p>}
          {items.map((item) => {
            const title = item.listings?.products?.title ?? "Untitled item";
            const floor = highBidByItem[item.id]?.amount_gbp ?? item.starting_bid_gbp;
            const secondsLeft = item.ends_at ? Math.max(0, Math.round((new Date(item.ends_at).getTime() - now) / 1000)) : null;
            return (
              <div key={item.id} className={`card p-4 space-y-2 ${item.status === "active" ? "border-brand" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold">{title}</span>
                  <span className="text-xs uppercase text-textDim">{item.status}</span>
                </div>
                {item.shipping_gbp != null && <p className="text-xs text-textDim">P&amp;P £{item.shipping_gbp.toFixed(2)}</p>}
                {item.status === "active" && (
                  <>
                    <p className="text-sm">
                      Current bid: <span className="font-bold">£{floor.toFixed(2)}</span>
                      {secondsLeft !== null && <span className="text-textDim"> · {secondsLeft}s left</span>}
                    </p>
                    <div className="flex gap-2">
                      <button className="btn btn-primary text-xs px-3 py-1.5" onClick={() => placeBid(item.id, floor)} disabled={!myUserId}>
                        Bid £{(floor + 1).toFixed(2)}
                      </button>
                      {item.buy_now_price_gbp && (
                        <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={() => buyNow(item.id)} disabled={!myUserId}>
                          Buy now £{item.buy_now_price_gbp.toFixed(2)}
                        </button>
                      )}
                    </div>
                    {!myUserId && <p className="text-xs text-textDim">Sign in to bid.</p>}
                    {myUserId && myTier === "free" && <p className="text-xs text-textDim">Upgrade from Free to bid.</p>}
                  </>
                )}
                {item.status === "sold" && <p className="text-sm text-brand">Sold for £{item.winning_bid_gbp?.toFixed(2)}</p>}
                {item.status === "unsold" && <p className="text-sm text-textDim">Didn't sell this time.</p>}
                {isHost && item.status === "upcoming" && (
                  <div className="flex gap-2 items-center flex-wrap">
                    <button className="btn btn-primary text-xs px-3 py-1.5" onClick={() => itemAction(item.id, "activate")} disabled={Boolean(activeItem) || show.status !== "live"}>
                      Show this item now
                    </button>
                    <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={() => itemAction(item.id, "skip")}>
                      Skip
                    </button>
                    <button className="btn btn-ghost text-xs px-2 py-1.5" onClick={() => moveItem(item.id, "up")} title="Move earlier in the queue" aria-label="Move up">
                      ↑
                    </button>
                    <button className="btn btn-ghost text-xs px-2 py-1.5" onClick={() => moveItem(item.id, "down")} title="Move later in the queue" aria-label="Move down">
                      ↓
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-0 flex flex-col h-[600px]">
        <p className="text-xs font-bold text-textDim uppercase p-3 border-b border-border">Live chat</p>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chat.map((m) => (
            <p key={m.id} className="text-sm">
              <span className="font-bold">{m.display_name ?? "Someone"}:</span> {m.message}
            </p>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-3 border-t border-border flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
            placeholder={myUserId ? "Say something…" : "Sign in to chat"}
            disabled={!myUserId}
            maxLength={500}
            className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
          />
          <button className="btn btn-primary text-xs px-3" onClick={sendChat} disabled={!myUserId}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

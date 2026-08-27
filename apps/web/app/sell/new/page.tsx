"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SALES_CHANNELS, suggestListingFromOpportunity } from "@flipsta/shared";

type ChannelConnection = { channel: string; connectable: boolean; connected: boolean };

type WonOpportunity = {
  id: string;
  category_id: string;
  categories: { name: string } | null;
  source_tier: string;
  source_retailer: string | null;
  source_price_gbp: number | null;
  estimated_resale_price_gbp: number | null;
  expected_margin_gbp: number;
  product_name: string | null;
  image_url: string | null;
  alreadyListed: boolean;
};

type ListResult = { itemLabel: string; ok: boolean; error?: string; crossPostResults?: any[] };

/**
 * Section 7 / 12.1 — "the AI is automatically filling out the listing, the
 * user needs a switch to auto post it once they click submit and it
 * uploads to eBay, Depop, Etsy, Whatnot, StockX."
 *
 * 27 Aug 2026, Steven: "One click platform listing needs overhauling. Needs
 * to have great features, please think of some to make it a pleasurable and
 * easy experience. the details, photos and everything needs to be auto
 * filled in. you have this info from the opportunity if brought that way."
 * The title/price/description were already auto-filled from
 * suggestListingFromOpportunity, and the photo already came from the
 * opportunity — but the picker was a bare <select>, "one click" wasn't
 * actually one click (every listing still needed the full form + a manual
 * submit), and cross-posting defaulted off even for Pro/Elite sellers with
 * channels already connected. Overhauled to:
 *  - a visual picker (photo + AI price/margin right on each card) instead
 *    of a text dropdown, deep-linkable via /sell/new?opportunityId=... so
 *    Portfolio's "list this item" can jump straight to one win
 *  - a real one-click "Quick list" per card — AI title/price/description/
 *    condition, auto cross-posted to every already-connected channel for
 *    Pro/Elite, no form required
 *  - "Quick list all" to clear every unlisted win in one go
 *  - the full manual form still underneath, unchanged, for anyone who wants
 *    to edit before publishing
 */
export default function NewListingPage() {
  const [won, setWon] = useState<WonOpportunity[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<WonOpportunity | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("New");
  const [autoCrossPost, setAutoCrossPost] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [tier, setTier] = useState<string | null>(null);
  // 27 Aug 2026, Steven: "list an item should not be a thing for someone
  // who hasnt signed in yet" — /api/me returns {profile: null} (200, not
  // 401) when signed out, so the gate is a plain check on that rather than
  // a fetch failure. Same pattern as wants/page.tsx.
  const [signedIn, setSignedIn] = useState(true);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);

  const [quickListingId, setQuickListingId] = useState<string | null>(null);
  const [bulkListing, setBulkListing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [bulkResults, setBulkResults] = useState<ListResult[] | null>(null);

  function loadWon() {
    return fetch("/api/opportunities?won=true")
      .then((r) => r.json())
      .then((d) => {
        const unlisted = (d.opportunities ?? []).filter((o: WonOpportunity) => !o.alreadyListed);
        setWon(unlisted);
        return unlisted as WonOpportunity[];
      });
  }

  useEffect(() => {
    // 26 Aug 2026: instant-win now auto-lists on win (see
    // lib/autoListOpportunity.ts) — exclude anything already listed here so
    // this picker can't create a duplicate listing for the same win.
    loadWon().then((unlisted) => {
      // 27 Aug 2026: deep link from Portfolio's "List this item" button —
      // ?opportunityId=... auto-selects that win instead of leaving the
      // seller to hunt for it again in the picker. Falls back to
      // auto-selecting the only win when there's just one, since there's
      // nothing to actually pick between.
      const params = new URLSearchParams(window.location.search);
      const wantedId = params.get("opportunityId");
      const target = (wantedId && unlisted.find((o) => o.id === wantedId)) || (unlisted.length === 1 ? unlisted[0] : null);
      if (target) selectOpportunity(target.id, unlisted);
    });
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setTier(d.profile?.subscriptionTier ?? null);
        setSignedIn(Boolean(d.profile));
      })
      .finally(() => setCheckedAuth(true));
    fetch("/api/channel-connections")
      .then((r) => r.json())
      .then((d) => setConnections(d.channels ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isChannelConnected = (key: string) => connections.find((c) => c.channel === key)?.connected ?? false;
  const connectedChannelKeys = () => SALES_CHANNELS.map((c) => c.key).filter(isChannelConnected);
  const canCrossPost = tier === "pro" || tier === "elite";

  function buildSuggestion(opp: WonOpportunity) {
    return suggestListingFromOpportunity({
      categoryName: opp.categories?.name ?? "Item",
      sourceTier: opp.source_tier,
      sourcePriceGBP: opp.source_price_gbp ?? 0,
      expectedMarginGBP: opp.expected_margin_gbp,
      productName: opp.product_name,
      sourceRetailer: opp.source_retailer,
    });
  }

  function selectOpportunity(id: string, fromList?: WonOpportunity[]) {
    setSelectedId(id);
    setResult(null);
    const opp = (fromList ?? won).find((o) => o.id === id);
    setSelected(opp ?? null);
    if (!opp) return;
    const suggestion = buildSuggestion(opp);
    setTitle(suggestion.suggestedTitle);
    setPrice(String(suggestion.suggestedPriceGBP));
    setDescription(suggestion.suggestedDescription);
    setCondition("New");
    // 27 Aug 2026, Steven: "great features... pleasurable and easy" — a
    // Pro/Elite seller with channels already connected almost always wants
    // them cross-posted; default that on and pre-tick every connected
    // channel instead of making them re-discover the toggle every time.
    // Still just a default — nothing here is submitted until they click.
    const connectedKeys = connectedChannelKeys();
    if (canCrossPost && connectedKeys.length > 0) {
      setAutoCrossPost(true);
      setChannels(connectedKeys);
    } else {
      setAutoCrossPost(false);
      setChannels([]);
    }
  }

  function toggleChannel(key: string) {
    setChannels((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  async function postListing(opp: WonOpportunity, overrides?: { title?: string; description?: string; priceGBP?: number; condition?: string }) {
    const suggestion = buildSuggestion(opp);
    const listTitle = overrides?.title ?? suggestion.suggestedTitle;
    const connectedKeys = connectedChannelKeys();
    const shouldCrossPost = canCrossPost && connectedKeys.length > 0;
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId: opp.id,
        title: listTitle,
        description: overrides?.description ?? suggestion.suggestedDescription,
        imageUrl: opp.image_url ?? null,
        priceGBP: overrides?.priceGBP ?? suggestion.suggestedPriceGBP,
        condition: overrides?.condition ?? "New",
        autoCrossPost: shouldCrossPost,
        channels: shouldCrossPost ? connectedKeys : [],
      }),
    });
    const data = await res.json();
    return { ok: res.ok, data, itemLabel: listTitle } as { ok: boolean; data: any; itemLabel: string };
  }

  /** 27 Aug 2026 — the actual "one click" per opportunity: no form, no review, just list it with AI defaults. */
  async function quickList(opp: WonOpportunity) {
    setQuickListingId(opp.id);
    setNotice(null);
    const { ok, data, itemLabel } = await postListing(opp);
    if (ok) {
      setNotice({ kind: "success", text: `Listed "${itemLabel}" for £${data.listing.price_gbp}.` });
      setWon((prev) => prev.filter((o) => o.id !== opp.id));
      if (selectedId === opp.id) {
        setSelectedId("");
        setSelected(null);
      }
    } else {
      setNotice({ kind: "error", text: data.error ?? `Couldn't list "${itemLabel}".` });
    }
    setQuickListingId(null);
  }

  /** 27 Aug 2026 — "great features... pleasurable and easy": clear every unlisted win in one go, sequentially so each still gets its own duplicate/eligibility check. */
  async function quickListAll() {
    setBulkListing(true);
    setBulkResults(null);
    setNotice(null);
    const targets = [...won];
    setBulkProgress({ done: 0, total: targets.length });
    const results: ListResult[] = [];
    for (const opp of targets) {
      const { ok, data, itemLabel } = await postListing(opp);
      results.push({ itemLabel, ok, error: ok ? undefined : data.error, crossPostResults: ok ? data.crossPostResults : undefined });
      if (ok) setWon((prev) => prev.filter((o) => o.id !== opp.id));
      setBulkProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
    }
    setBulkResults(results);
    setSelectedId("");
    setSelected(null);
    setBulkListing(false);
    setBulkProgress(null);
  }

  async function submit() {
    if (!selectedId || !title || !price) return;
    setSubmitting(true);
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId: selectedId,
        title,
        description,
        imageUrl: selected?.image_url ?? null,
        priceGBP: Number(price),
        condition,
        autoCrossPost,
        channels: autoCrossPost ? channels : [],
      }),
    });
    const data = await res.json();
    setResult(res.ok ? data : { error: data.error });
    if (res.ok) setWon((prev) => prev.filter((o) => o.id !== selectedId));
    setSubmitting(false);
  }

  if (checkedAuth && !signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to list an item.
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">List an item</h1>
        <p className="text-textDim text-sm">
          Every field below — title, photo, description, and a suggested price — is pulled straight from the
          opportunity you won. Hit Quick list to publish instantly, or edit anything first if you'd rather.
        </p>
      </div>

      {notice && (
        <p className={`text-sm ${notice.kind === "success" ? "text-green" : "text-red"}`}>{notice.text}</p>
      )}

      {won.length === 0 ? (
        <p className="text-textDim text-sm">
          No won opportunities waiting to be listed — win one on the{" "}
          <Link href="/opportunities" className="underline">Opportunities</Link> page first.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-bold text-sm text-textDim uppercase tracking-wide">
              Won and not listed yet ({won.length})
            </h2>
            {won.length > 1 && (
              <button className="btn btn-primary text-xs px-3 py-1.5" disabled={bulkListing} onClick={quickListAll}>
                {bulkListing
                  ? `Listing ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? won.length}…`
                  : `⚡ Quick list all ${won.length}`}
              </button>
            )}
          </div>

          {bulkResults && (
            <div className="card text-xs space-y-1">
              <p className="font-bold">Quick list all — results</p>
              {bulkResults.map((r, i) => (
                <p key={i} className={r.ok ? "text-green" : "text-red"}>
                  {r.ok ? "✓" : "✗"} {r.itemLabel}
                  {!r.ok && r.error ? ` — ${r.error}` : ""}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {won.map((o) => {
              const suggestion = buildSuggestion(o);
              const isSelected = selectedId === o.id;
              return (
                <div
                  key={o.id}
                  className={`card space-y-2 cursor-pointer transition ${isSelected ? "border-brand2 border-2" : ""}`}
                  onClick={() => selectOpportunity(o.id)}
                >
                  <div className="flex gap-3">
                    {o.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={o.image_url}
                        alt={o.product_name ?? o.categories?.name ?? "Item"}
                        className="w-16 h-16 object-contain bg-surface2 rounded-lg border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg border border-border shrink-0 flex items-center justify-center text-[9px] text-textFaint text-center p-1">
                        No photo captured
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">{o.product_name ?? o.categories?.name ?? "Item"}</div>
                      <div className="text-xs text-textDim">{o.source_tier}</div>
                      <div className="text-xs text-green mt-0.5">
                        AI price £{suggestion.suggestedPriceGBP} · profit £{o.expected_margin_gbp.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary w-full text-xs"
                    disabled={quickListingId !== null || bulkListing}
                    onClick={(e) => {
                      e.stopPropagation();
                      quickList(o);
                    }}
                  >
                    {quickListingId === o.id ? "Listing…" : "⚡ Quick list (1 click)"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="space-y-4 pt-2 border-t border-border">
          <h2 className="font-bold text-sm text-textDim uppercase tracking-wide pt-2">
            Customize before listing: {selected.product_name ?? selected.categories?.name ?? "Item"}
          </h2>

          <div>
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Title</label>
            <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Description</label>
            <textarea
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Price (GBP)</label>
              <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Condition</label>
              <select className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option>New</option>
                <option>Like new</option>
                <option>Used</option>
              </select>
            </div>
          </div>

          <div className="card">
            <label className={`flex items-center gap-2 text-sm font-bold mb-2 ${!canCrossPost ? "opacity-40" : ""}`}>
              <input type="checkbox" disabled={!canCrossPost} checked={autoCrossPost} onChange={(e) => setAutoCrossPost(e.target.checked)} />
              Auto cross-post to other marketplaces on submit
            </label>
            {!canCrossPost ? (
              <p className="text-xs text-gold">Upgrade to Pro or Elite to unlock multi-platform listing (Section 7).</p>
            ) : (
              <p className="text-xs text-textDim mb-3">
                Pre-ticked for every marketplace you've already connected. Connect more at{" "}
                <Link href="/settings/connections" className="underline">
                  Connected accounts
                </Link>
                . The actual post to a connected channel is still simulated until each platform's real
                listing-creation API is wired in — see INFRASTRUCTURE_TODO.md.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {SALES_CHANNELS.map((c) => {
                const connected = isChannelConnected(c.key);
                const disabled = !autoCrossPost || !canCrossPost || !connected;
                return (
                  <label key={c.key} className={`flex items-center gap-2 text-sm ${disabled ? "opacity-40" : ""}`}>
                    <input type="checkbox" disabled={disabled} checked={channels.includes(c.key)} onChange={() => toggleChannel(c.key)} />
                    {c.name}
                    {canCrossPost && !connected && <span className="text-textFaint">(not connected)</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <button className="btn btn-primary" disabled={!selectedId || submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit listing"}
          </button>

          {result?.error && <p className="text-red text-sm">{result.error}</p>}
          {result?.listing && (
            <div className="card text-sm space-y-1">
              <p className="font-bold text-green">Listed.</p>
              {(result.crossPostResults ?? []).map((r: any, i: number) => (
                <p key={i} className="text-textDim">
                  {r.channel}: {r.status === "posted" ? `posted -> ${r.external_url}` : "failed, will retry"}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

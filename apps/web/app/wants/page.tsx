"use client";

import { useEffect, useState } from "react";
import PageHero from "@/app/components/PageHero";

type Want = {
  id: string;
  buyer_id: string;
  item_description: string;
  max_price_gbp: number;
  fulfilled_offer_id: string | null;
  ranked_offers: { id: string; sellerId: string; offerPriceGBP: number }[];
};

/**
 * 27 Aug 2026, Steven: after being asked whether Buyer Wants was still
 * relevant, decided to finish it rather than remove it — it's a genuinely
 * different mechanism from Flipsta It! (peer resellers competing downward
 * on price for a specific want, vs an AI-sourced, admin-gated search).
 * The page previously only listed wants and their ranked offers — both
 * POST /api/wants (post a want) and POST /api/wants/:id/offer (make an
 * offer) already existed and worked, they just had no form anywhere in the
 * UI. Both added here; no backend changes needed.
 */
export default function WantsPage() {
  const [wants, setWants] = useState<Want[]>([]);
  // 27 Aug 2026, Steven: "buyer wants should not be a thing for someone who
  // hasnt signed in yet" — /api/wants itself has no auth check (it's a
  // public read), so the gate has to happen here, same signed-in check
  // /api/me already backs elsewhere (see wallet/page.tsx's `signedIn`).
  const [signedIn, setSignedIn] = useState(true);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);

  const [showPostForm, setShowPostForm] = useState(false);
  const [itemDescription, setItemDescription] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [maxPriceGBP, setMaxPriceGBP] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [offerInputs, setOfferInputs] = useState<Record<string, string>>({});
  const [offerSubmitting, setOfferSubmitting] = useState<string | null>(null);
  const [offerErrors, setOfferErrors] = useState<Record<string, string>>({});

  function load() {
    fetch("/api/wants")
      .then((r) => r.json())
      .then((d) => setWants(d.wants ?? []));
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setSignedIn(Boolean(d.profile));
        setMyProfileId(d.profile?.id ?? null);
      })
      .finally(() => setCheckedAuth(true));
    load();
  }, []);

  async function postWant() {
    setPostError(null);
    const price = Number(maxPriceGBP);
    if (!itemDescription.trim() || !Number.isFinite(price) || price <= 0) {
      setPostError("Describe the item and set a positive max price.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/wants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemDescription, conditionNotes: conditionNotes || null, maxPriceGBP: price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setItemDescription("");
      setConditionNotes("");
      setMaxPriceGBP("");
      setShowPostForm(false);
      load();
    } catch (err) {
      setPostError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function makeOffer(wantId: string) {
    const raw = offerInputs[wantId];
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) {
      setOfferErrors((prev) => ({ ...prev, [wantId]: "Enter a positive offer price." }));
      return;
    }
    setOfferSubmitting(wantId);
    setOfferErrors((prev) => ({ ...prev, [wantId]: "" }));
    try {
      const res = await fetch(`/api/wants/${wantId}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerPriceGBP: price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setOfferInputs((prev) => ({ ...prev, [wantId]: "" }));
      load();
    } catch (err) {
      setOfferErrors((prev) => ({ ...prev, [wantId]: (err as Error).message }));
    } finally {
      setOfferSubmitting(null);
    }
  }

  if (checkedAuth && !signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see Buyer Wants.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <PageHero
        title={
          <>
            Buyer <span className="text-gold">Wants</span>
          </>
        }
        subtitle="Post exactly what you're after and your max price. Any reseller holding it can offer — undercutting each other live until one wins."
        decorations={[
          { emoji: "🔍", className: "-top-4 -left-6", animate: "sway" },
          { emoji: "📝", className: "top-1 -right-7", animate: "bob" },
          { emoji: "🤝", className: "-bottom-3 left-1/3 w-11 h-11", boxed: true, animate: "bob", delay: "0.4s" },
        ]}
      />
      <div className="flex items-center justify-end">
        <button className="btn btn-primary whitespace-nowrap" onClick={() => setShowPostForm((v) => !v)}>
          {showPostForm ? "Cancel" : "Post a want"}
        </button>
      </div>

      {showPostForm && (
        <div className="card space-y-3 max-w-lg">
          {postError && <p className="text-sm text-red">{postError}</p>}
          <div>
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">What are you after?</label>
            <textarea
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm min-h-[70px]"
              placeholder="e.g. LEGO Technic 42211, sealed, any colour box condition"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Condition notes (optional)</label>
            <input
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. must be unopened"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Max price you'll pay (GBP)</label>
            <input
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
              value={maxPriceGBP}
              onChange={(e) => setMaxPriceGBP(e.target.value)}
            />
          </div>
          <button className="btn btn-primary w-full" disabled={posting} onClick={postWant}>
            {posting ? "Posting…" : "Post want"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wants.map((w) => {
          const isMine = myProfileId !== null && w.buyer_id === myProfileId;
          const fulfilled = Boolean(w.fulfilled_offer_id);
          return (
            <div key={w.id} className="card space-y-2">
              <div className="font-bold text-sm">{w.item_description}</div>
              <div className="text-xs text-textDim">Max £{w.max_price_gbp}</div>
              {w.ranked_offers.length === 0 && <div className="text-xs text-textDim">No offers yet.</div>}
              {w.ranked_offers.map((o, i) => (
                <div key={o.id} className={`text-xs flex justify-between ${i === 0 ? "text-green font-bold" : "text-textFaint line-through"}`}>
                  <span>Offer</span>
                  <span>£{o.offerPriceGBP}</span>
                </div>
              ))}
              {fulfilled ? (
                <p className="text-xs text-textDim pt-1">Fulfilled.</p>
              ) : isMine ? (
                <p className="text-xs text-textFaint pt-1">This is your own want — sellers will offer here.</p>
              ) : (
                <div className="flex gap-2 pt-1">
                  <input
                    className="flex-1 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
                    placeholder={`At or below £${w.max_price_gbp}`}
                    value={offerInputs[w.id] ?? ""}
                    onChange={(e) => setOfferInputs((prev) => ({ ...prev, [w.id]: e.target.value }))}
                  />
                  <button
                    className="btn btn-ghost text-xs px-2"
                    disabled={offerSubmitting === w.id}
                    onClick={() => makeOffer(w.id)}
                  >
                    {offerSubmitting === w.id ? "…" : "Offer"}
                  </button>
                </div>
              )}
              {offerErrors[w.id] && <p className="text-xs text-red">{offerErrors[w.id]}</p>}
            </div>
          );
        })}
        {wants.length === 0 && <p className="text-textDim text-sm">No open wants right now — be the first to post one.</p>}
      </div>
    </div>
  );
}

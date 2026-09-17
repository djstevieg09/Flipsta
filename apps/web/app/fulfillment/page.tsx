"use client";

import { useEffect, useState } from "react";
import TradingFloorTicker from "./TradingFloorTicker";

type ClaimableJob = {
  id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  our_price_gbp: number;
  fulfillment_reward_gbp: number;
  fulfiller_reimbursement_gbp: number;
  estimated_stock_units: number;
  paid_at: string | null;
  categories: { name: string } | null;
};

type MyClaim = {
  id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  source_retailer: string | null;
  source_url: string | null;
  source_price_gbp: number | null;
  fulfillment_reward_gbp: number;
  fulfiller_reimbursement_gbp: number;
  status: string;
  fulfillment_claimed_at: string | null;
  fulfillment_deadline_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
};

/**
 * 26 Aug 2026, Steven: "the order is then passed onto the pro and elite
 * opptunites as a free button to press to fulfill the order." Claimable
 * jobs are listed oldest-paid-first (the API's fairness ordering — see
 * api/fulfillment/route.ts); claiming one reveals source_retailer/source_url
 * (Flipsta's actual sourcing info, hidden until then), and "Mark shipped"
 * is all a fulfiller does here — the buyer confirming delivery is what
 * actually pays out (see /portfolio's purchases and confirm-delivery).
 */
export default function FulfillmentPage() {
  const [claimable, setClaimable] = useState<ClaimableJob[]>([]);
  const [myClaims, setMyClaims] = useState<MyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [notEntitled, setNotEntitled] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const res = await fetch("/api/fulfillment");
    if (res.status === 401) {
      setSignedIn(false);
      setLoading(false);
      return;
    }
    if (res.status === 403) {
      setNotEntitled(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setClaimable(data.claimable ?? []);
    setMyClaims(data.myClaims ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function claim(id: string) {
    setBusy((b) => ({ ...b, [id]: true }));
    const res = await fetch("/api/fulfillment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Claimed "${data.item.product_name}" — go buy it and mark it shipped once it's on its way.` : data.error);
    setBusy((b) => ({ ...b, [id]: false }));
    load();
  }

  async function markShipped(id: string) {
    setBusy((b) => ({ ...b, [id]: true }));
    const res = await fetch(`/api/fulfillment/${id}/ship`, { method: "POST" });
    const data = await res.json();
    setMessage(res.ok ? "Marked shipped — you'll be paid once the buyer confirms delivery." : data.error);
    setBusy((b) => ({ ...b, [id]: false }));
    load();
  }

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see fulfillment jobs.
      </p>
    );
  }
  if (notEntitled) {
    return <p className="text-textDim text-sm">Fulfilling shop orders is a Pro/Elite benefit — upgrade to claim jobs.</p>;
  }

  return (
    <div className="space-y-8">
      <TradingFloorTicker
        jobs={claimable.map((j) => ({ id: j.id, productName: j.product_name, rewardGBP: j.fulfillment_reward_gbp }))}
      />
      <div>
        <h1 className="text-2xl font-bold">Fulfillment jobs</h1>
        <p className="text-textDim text-sm">
          A free button to press: claim a paid-for order, go buy it, ship it, get paid once the buyer confirms
          delivery. Claims are capped per person and auto-release if not shipped in time, so everyone gets a fair
          shot as orders come in.
        </p>
      </div>
      {message && <p className="text-sm text-brand2">{message}</p>}
      {loading && <p className="text-textDim text-sm">Loading…</p>}

      <section className="space-y-2">
        <h2 className="font-bold text-lg">Open jobs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {claimable.map((job) => (
            <div key={job.id} className="card space-y-1">
              {job.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={job.image_url} alt={job.product_name} className="w-full h-28 object-contain bg-surface2 rounded-lg border border-border mb-1" />
              )}
              <div className="font-bold text-sm">{job.product_name}</div>
              <div className="text-xs text-textDim">{job.categories?.name}</div>
              <div className="text-xs">
                Reimbursed £{job.fulfiller_reimbursement_gbp.toFixed(2)} + <span className="text-green font-bold">£{job.fulfillment_reward_gbp.toFixed(2)} reward</span>
              </div>
              <button
                onClick={() => claim(job.id)}
                disabled={busy[job.id]}
                className="w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50 mt-1"
                style={{ background: "linear-gradient(135deg,#f2b545,#ffd77a)" }}
              >
                Claim this job
              </button>
            </div>
          ))}
          {!loading && claimable.length === 0 && <p className="text-textDim text-sm col-span-full">No open jobs right now.</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">My claims</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {myClaims.map((c) => (
            <div key={c.id} className="card space-y-1">
              {c.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image_url} alt={c.product_name} className="w-full h-28 object-contain bg-surface2 rounded-lg border border-border mb-1" />
              )}
              <div className="flex justify-between items-start gap-2">
                <div className="font-bold text-sm">{c.product_name}</div>
                <div className="text-[10px] text-textDim capitalize shrink-0">{c.status.replace(/_/g, " ")}</div>
              </div>
              <div className="text-xs">
                Reimbursed £{c.fulfiller_reimbursement_gbp.toFixed(2)} + <span className="text-green font-bold">£{c.fulfillment_reward_gbp.toFixed(2)} reward</span>
              </div>
              {/* Reveal-on-claim — same pattern as opportunities' reveal-on-win. */}
              {c.source_retailer && (
                <div className="mt-1 pt-1 border-t border-border space-y-0.5">
                  <div className="text-xs font-bold">{c.source_retailer}</div>
                  {typeof c.source_price_gbp === "number" && (
                    <div className="text-xs text-textDim">Buy from retailer for: £{c.source_price_gbp.toFixed(2)}</div>
                  )}
                  {c.source_url && (
                    <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-xs underline text-brand2 break-all inline-block mt-0.5">
                      Go to purchase link →
                    </a>
                  )}
                </div>
              )}
              {c.status === "fulfillment_claimed" && (
                <>
                  {c.fulfillment_deadline_at && (
                    <div className="text-[10px] text-textFaint">Ship by {new Date(c.fulfillment_deadline_at).toLocaleString()} or this releases back to the pool.</div>
                  )}
                  <button
                    onClick={() => markShipped(c.id)}
                    disabled={busy[c.id]}
                    className="w-full rounded-lg py-2 text-sm font-bold border border-border hover:border-brand2 disabled:opacity-50 mt-1"
                  >
                    Mark shipped
                  </button>
                </>
              )}
              {c.status === "shipped" && <div className="text-[10px] text-textDim">Waiting on the buyer to confirm delivery.</div>}
              {c.status === "delivered" && <div className="text-[10px] text-green">Delivered — paid out to your wallet.</div>}
            </div>
          ))}
          {!loading && myClaims.length === 0 && <p className="text-textDim text-sm col-span-full">You haven't claimed any jobs yet.</p>}
        </div>
      </section>
    </div>
  );
}

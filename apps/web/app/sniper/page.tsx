"use client";

import { useEffect, useState } from "react";
import { SubscriptionTier } from "@flipsta/shared";

type Category = { id: string; name: string; slug: string };
type SniperRule = {
  id: string;
  category_id: string | null;
  max_budget_gbp: number;
  min_margin_pct: number;
  active: boolean;
  created_at: string;
  categories: { name: string } | null;
};

/**
 * 27 Aug 2026, Steven: "Sniper mode needs setting up with its own tab."
 * sniper_rules has existed since day one with real RLS, but had no API, no
 * UI, and nothing ever actually placed a bid — see
 * apps/worker/src/jobs/runSniperBids.ts for the execution half (last 5
 * minutes of an opportunity's action clock, same 30s cadence as
 * closeExpiredAuctions). This page is the UI half: set-and-forget rules —
 * "in this category, up to this budget, only if the margin clears this
 * bar" — and the worker snipes on your behalf with zero manual bidding,
 * matching the business doc's "opt into fully automatic execution."
 *
 * Pro/Elite only (TIER_ENTITLEMENTS.sniperMode) — gated here the same way
 * /sell/new and /wants gate on sign-in, so a Standard/Free user landing on
 * a direct link sees a clear upgrade prompt instead of a 403 from the API.
 */
export default function SniperPage() {
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [tier, setTier] = useState<SubscriptionTier | null>(null);

  const [rules, setRules] = useState<SniperRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [maxBudgetGBP, setMaxBudgetGBP] = useState("");
  const [minMarginPct, setMinMarginPct] = useState("15");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  function loadRules() {
    setLoadingRules(true);
    fetch("/api/sniper-rules")
      .then((r) => r.json())
      .then((d) => setRules(d.rules ?? []))
      .finally(() => setLoadingRules(false));
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setSignedIn(Boolean(d.profile));
        setTier(d.profile?.subscriptionTier ?? null);
      })
      .finally(() => setCheckedAuth(true));
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    loadRules();
  }, []);

  async function createRule() {
    setFormError(null);
    const budget = Number(maxBudgetGBP);
    const marginPct = Number(minMarginPct);
    if (!Number.isFinite(budget) || budget <= 0) {
      setFormError("Set a positive max budget.");
      return;
    }
    if (!Number.isFinite(marginPct) || marginPct < 0 || marginPct > 100) {
      setFormError("Min margin must be between 0 and 100%.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sniper-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: categoryId || null,
          maxBudgetGBP: budget,
          minMarginPct: marginPct / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setCategoryId("");
      setMaxBudgetGBP("");
      setMinMarginPct("15");
      setShowForm(false);
      loadRules();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: SniperRule) {
    setBusyId(rule.id);
    try {
      await fetch(`/api/sniper-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      });
      loadRules();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRule(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/sniper-rules/${id}`, { method: "DELETE" });
      loadRules();
    } finally {
      setBusyId(null);
    }
  }

  if (checkedAuth && !signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to set up Sniper Mode.
      </p>
    );
  }

  if (checkedAuth && tier !== null && tier !== "pro" && tier !== "elite") {
    return (
      <div className="card max-w-lg space-y-2">
        <h1 className="text-xl font-bold">Sniper Mode is a Pro/Elite feature</h1>
        <p className="text-textDim text-sm">
          Set a budget and a minimum margin per category, and let Flipsta place bids on your behalf in the last five
          minutes of an opportunity's action clock — zero manual bidding.
        </p>
        <a href="/upgrade" className="btn btn-primary inline-block">See upgrade options</a>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sniper Mode</h1>
          <p className="text-textDim text-sm">
            Fully automatic bidding. In the last 5 minutes of an opportunity's action clock, Flipsta bids on your
            behalf — only in categories you choose, only up to the budget you set, and only when the deal still
            clears your minimum margin.
          </p>
        </div>
        <button className="btn btn-primary whitespace-nowrap" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New rule"}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          {formError && <p className="text-sm text-red">{formError}</p>}
          <div>
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Category (optional — leave blank for all)</label>
            <select
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Max budget per item (GBP)</label>
              <input
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. 150"
                value={maxBudgetGBP}
                onChange={(e) => setMaxBudgetGBP(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Min margin (%)</label>
              <input
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                value={minMarginPct}
                onChange={(e) => setMinMarginPct(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-textFaint">
            Sniper will never bid above your budget, and only bids while the opportunity's expected margin (against
            its estimated resale price) is at or above this percentage.
          </p>
          <button className="btn btn-primary w-full" disabled={saving} onClick={createRule}>
            {saving ? "Saving…" : "Create rule"}
          </button>
        </div>
      )}

      {loadingRules ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-textDim text-sm">
          No sniper rules yet — create one above and Flipsta will start bidding for you the moment a matching
          opportunity enters its final 5 minutes.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="card flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-sm">{r.categories?.name ?? "All categories"}</div>
                <div className="text-xs text-textDim">
                  Up to £{r.max_budget_gbp} · min {Math.round(r.min_margin_pct * 100)}% margin
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${r.active ? "text-green" : "text-textFaint"}`}>
                  {r.active ? "Active" : "Paused"}
                </span>
                <button className="btn btn-ghost text-xs px-2" disabled={busyId === r.id} onClick={() => toggleActive(r)}>
                  {r.active ? "Pause" : "Resume"}
                </button>
                <button className="btn btn-ghost text-xs px-2 text-red" disabled={busyId === r.id} onClick={() => deleteRule(r.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

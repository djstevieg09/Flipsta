"use client";

import { useEffect, useState } from "react";

type TrendingSignal = {
  id: string;
  keyword: string;
  categorySlugs: string[];
  note: string;
  source: string;
  addedOn: string;
  expiresOn: string;
};

type CategoryOption = { categorySlug: string; categoryName: string };

/**
 * 18 Sept 2026, Steven, after asking what's hottest on TikTok right now
 * and being told about Medicube's PDRN collagen balm, SEESE's cordless
 * pressure washer, etc: "yes add this to make the bot clever." This is
 * that admin page — add a keyword/category the discovery bot should
 * actively favour right now, backed by migration 0036's trending_signals
 * table, the same "admin edits the real thing, nothing hardcoded" pattern
 * as /admin/seasonal. The one real difference from the seasonal calendar:
 * a TikTok trend fades within weeks rather than being a fixed date
 * everyone already knows is coming, so every row here needs a hard expiry
 * — there's no "permanent" entry.
 */
export default function AdminTrendingPage() {
  const [signals, setSignals] = useState<TrendingSignal[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [source, setSource] = useState("tiktok");
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    Promise.all([
      fetch("/api/admin/trending-signals").then((r) => r.json()),
      fetch("/api/admin/discovery-focus").then((r) => r.json()),
    ]).then(([sig, focus]) => {
      setSignals(sig.signals ?? []);
      setCategories((focus.focus ?? []).map((f: any) => ({ categorySlug: f.categorySlug, categoryName: f.categoryName })));
      setLoading(false);
    });
  }

  useEffect(load, []);

  function toggleSlug(slug: string) {
    setSelectedSlugs((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  }

  // Default suggestion: 21 days out — long enough to matter, short enough
  // that a stale trend doesn't linger in the AI's prompt unnoticed.
  function defaultExpiry(): string {
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return d.toISOString().slice(0, 10);
  }

  async function addSignal() {
    setError(null);
    if (!keyword.trim() || !note.trim() || !expiresOn) {
      setError("Keyword, note, and an expiry date are all required.");
      return;
    }
    const res = await fetch("/api/admin/trending-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, categorySlugs: selectedSlugs, note, source, expiresOn }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to add trend signal.");
      return;
    }
    setKeyword("");
    setSelectedSlugs([]);
    setNote("");
    setSource("tiktok");
    setExpiresOn("");
    setShowForm(false);
    load();
  }

  async function deleteSignal(id: string) {
    await fetch(`/api/admin/trending-signals/${id}`, { method: "DELETE" });
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  function statusLabel(s: TrendingSignal): { text: string; className: string } {
    if (s.expiresOn < today) return { text: "Expired", className: "text-red" };
    const daysLeft = Math.round((new Date(s.expiresOn).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 5) return { text: `Active — ${daysLeft}d left, refresh soon`, className: "text-brand2" };
    return { text: `Active — ${daysLeft}d left`, className: "text-green font-bold" };
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm max-w-2xl">
        Tell the discovery bot what&apos;s genuinely trending right now (TikTok, TikTok Shop, wherever) and it
        actively favours matching products when it finds a page with a real discount — it never lowers the
        margin/evidence bar, it just knows what&apos;s worth looking harder for. Unlike the seasonal calendar,
        every entry here needs an expiry date — trends fade fast, so nothing sits here stale by default.
      </p>

      <button className="btn btn-primary text-xs" onClick={() => { setShowForm((v) => !v); if (!expiresOn) setExpiresOn(defaultExpiry()); }}>
        + Add trend signal
      </button>

      {showForm && (
        <div className="card max-w-lg space-y-3">
          {error && <p className="text-red text-xs">{error}</p>}
          <input
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Keyword, e.g. PDRN collagen balm"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <textarea
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Note — why it's trending, real figures/sources if you have them"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div>
            <div className="text-xs text-textDim mb-1">Categories (leave blank for all)</div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.categorySlug}
                  type="button"
                  className={`text-xs px-2 py-1 rounded-lg border ${selectedSlugs.includes(c.categorySlug) ? "bg-brand2 text-white border-brand2" : "bg-surface2 border-border"}`}
                  onClick={() => toggleSlug(c.categorySlug)}
                >
                  {c.categoryName}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-textDim mb-1">Source</div>
              <input
                className="w-full bg-surface2 border border-border rounded-lg px-2 py-2 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-textDim mb-1">Expires</div>
              <input type="date" className="w-full bg-surface2 border border-border rounded-lg px-2 py-2 text-sm" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary text-xs" onClick={addSignal}>
            Add signal
          </button>
        </div>
      )}

      {loading && <p className="text-textDim text-sm">Loading…</p>}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Keyword</th>
              <th className="p-3">Categories</th>
              <th className="p-3">Note</th>
              <th className="p-3">Source</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => {
              const st = statusLabel(s);
              return (
                <tr key={s.id} className="border-b border-border last:border-0 align-top">
                  <td className="p-3 font-bold whitespace-nowrap">{s.keyword}</td>
                  <td className="p-3 text-textDim whitespace-nowrap">
                    {s.categorySlugs.length === 0 ? "All" : s.categorySlugs.join(", ")}
                  </td>
                  <td className="p-3 text-textDim max-w-md">{s.note}</td>
                  <td className="p-3 text-textDim whitespace-nowrap">{s.source}</td>
                  <td className={`p-3 whitespace-nowrap ${st.className}`}>{st.text}</td>
                  <td className="p-3">
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => deleteSignal(s.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {signals.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-textDim">
                  Nothing trending on file yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

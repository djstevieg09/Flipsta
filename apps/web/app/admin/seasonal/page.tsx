"use client";

import { useEffect, useState } from "react";

type SeasonalEvent = {
  id: string;
  name: string;
  categorySlugs: string[];
  searchStartsOn: string;
  searchEndsOn: string;
  expireStockAfter: string;
};

type CategoryOption = { categorySlug: string; categoryName: string };

/**
 * 26 Aug 2026, Steven, "tonight's list": "look at the time of year and
 * think for instance Halloween coming up then start looking for Halloween
 * goods. Also needs to remove Halloween stuff after its past and then
 * start looking for the next big holiday." Confirmed via a clarifying
 * question: "Full calendar" — this page IS that calendar, nothing
 * hardcoded. Add an event with a search window (when the AI should
 * actively favour it) and an expiry date (when unsold matching shop stock
 * gets auto-cleared by expireSeasonalStock.ts).
 */
export default function AdminSeasonalPage() {
  const [events, setEvents] = useState<SeasonalEvent[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [searchStartsOn, setSearchStartsOn] = useState("");
  const [searchEndsOn, setSearchEndsOn] = useState("");
  const [expireStockAfter, setExpireStockAfter] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    Promise.all([
      fetch("/api/admin/seasonal-events").then((r) => r.json()),
      fetch("/api/admin/discovery-focus").then((r) => r.json()),
    ]).then(([ev, focus]) => {
      setEvents(ev.events ?? []);
      setCategories((focus.focus ?? []).map((f: any) => ({ categorySlug: f.categorySlug, categoryName: f.categoryName })));
      setLoading(false);
    });
  }

  useEffect(load, []);

  function toggleSlug(slug: string) {
    setSelectedSlugs((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  }

  async function addEvent() {
    setError(null);
    if (!name.trim() || !searchStartsOn || !searchEndsOn || !expireStockAfter) {
      setError("Name and all three dates are required.");
      return;
    }
    const res = await fetch("/api/admin/seasonal-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, categorySlugs: selectedSlugs, searchStartsOn, searchEndsOn, expireStockAfter }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to add event.");
      return;
    }
    setName("");
    setSelectedSlugs([]);
    setSearchStartsOn("");
    setSearchEndsOn("");
    setExpireStockAfter("");
    setShowForm(false);
    load();
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/admin/seasonal-events/${id}`, { method: "DELETE" });
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  function statusLabel(e: SeasonalEvent): { text: string; className: string } {
    if (today < e.searchStartsOn) return { text: "Upcoming", className: "text-textDim" };
    if (today <= e.searchEndsOn) return { text: "Searching now", className: "text-green font-bold" };
    if (today <= e.expireStockAfter) return { text: "Search ended, stock still live", className: "text-brand2" };
    return { text: "Expired", className: "text-red" };
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm max-w-2xl">
        Add a date, and the AI actively favours matching products in the categories you pick while it&apos;s inside
        the search window — then any unsold shop stock tagged to it is automatically pulled once the expiry date
        passes. Nothing here is hardcoded; add next year&apos;s dates whenever you're ready.
      </p>

      <button className="btn btn-primary text-xs" onClick={() => setShowForm((v) => !v)}>
        + Add seasonal event
      </button>

      {showForm && (
        <div className="card max-w-lg space-y-3">
          {error && <p className="text-red text-xs">{error}</p>}
          <input
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Event name, e.g. Halloween"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-textDim mb-1">Search starts</div>
              <input type="date" className="w-full bg-surface2 border border-border rounded-lg px-2 py-2 text-sm" value={searchStartsOn} onChange={(e) => setSearchStartsOn(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-textDim mb-1">Search ends</div>
              <input type="date" className="w-full bg-surface2 border border-border rounded-lg px-2 py-2 text-sm" value={searchEndsOn} onChange={(e) => setSearchEndsOn(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-textDim mb-1">Stock expires</div>
              <input type="date" className="w-full bg-surface2 border border-border rounded-lg px-2 py-2 text-sm" value={expireStockAfter} onChange={(e) => setExpireStockAfter(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary text-xs" onClick={addEvent}>
            Add to calendar
          </button>
        </div>
      )}

      {loading && <p className="text-textDim text-sm">Loading…</p>}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Event</th>
              <th className="p-3">Categories</th>
              <th className="p-3">Search window</th>
              <th className="p-3">Stock expires</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const s = statusLabel(e);
              return (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold whitespace-nowrap">{e.name}</td>
                  <td className="p-3 text-textDim">
                    {e.categorySlugs.length === 0 ? "All" : e.categorySlugs.join(", ")}
                  </td>
                  <td className="p-3 whitespace-nowrap text-textDim">
                    {e.searchStartsOn} → {e.searchEndsOn}
                  </td>
                  <td className="p-3 whitespace-nowrap text-textDim">{e.expireStockAfter}</td>
                  <td className={`p-3 whitespace-nowrap ${s.className}`}>{s.text}</td>
                  <td className="p-3">
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => deleteEvent(e.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-textDim">
                  Nothing on the calendar yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

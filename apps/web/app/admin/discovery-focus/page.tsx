"use client";

import { useEffect, useState } from "react";

type Focus = {
  categorySlug: string;
  categoryName: string;
  status: "active" | "paused";
  focusNote: string | null;
  updatedAt: string | null;
};

/**
 * 26 Aug 2026, Steven: "in the admin dashboard i need to be able to chosse
 * what the AI should focus on when finding deals. is this possible."
 * Yes — every real category listed, pause/resume it for discovery, and
 * leave a short steering note ("push winter coats this week") that gets
 * read straight into claudeSearchAdapter.ts's search prompt for that
 * category. See api/admin/discovery-focus and migration 0019.
 */
export default function AdminDiscoveryFocusPage() {
  const [rows, setRows] = useState<Focus[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/discovery-focus")
      .then((r) => r.json())
      .then((d) => {
        const focus: Focus[] = d.focus ?? [];
        setRows(focus);
        setDrafts(Object.fromEntries(focus.map((f) => [f.categorySlug, f.focusNote ?? ""])));
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function save(categorySlug: string, status: "active" | "paused", focusNote: string) {
    setSavingSlug(categorySlug);
    await fetch("/api/admin/discovery-focus", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categorySlug, status, focusNote }),
    });
    setSavingSlug(null);
    load();
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm max-w-2xl">
        Pause a category to stop discovery spending any search budget on it, or leave a short note to steer what it
        looks for (e.g. &ldquo;push winter coats, ignore trainers this week&rdquo;). Both are read by the AI on its
        very next run — no restart needed. For a specific upcoming date (Halloween, Christmas, etc.), use the{" "}
        <a href="/admin/seasonal" className="text-brand2 hover:underline">Seasonal calendar</a> instead — it&apos;s
        more precise and expires itself automatically.
      </p>

      {loading && <p className="text-textDim text-sm">Loading…</p>}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Category</th>
              <th className="p-3">Status</th>
              <th className="p-3">Focus note</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.categorySlug} className="border-b border-border last:border-0 align-top">
                <td className="p-3 font-bold whitespace-nowrap">{f.categoryName}</td>
                <td className="p-3 whitespace-nowrap">
                  <span className={f.status === "paused" ? "text-red font-bold" : "text-green font-bold"}>
                    {f.status === "paused" ? "Paused" : "Active"}
                  </span>
                </td>
                <td className="p-3 min-w-[16rem]">
                  <input
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="No note — searches normally"
                    value={drafts[f.categorySlug] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [f.categorySlug]: e.target.value }))}
                  />
                </td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  <button
                    className="btn btn-ghost text-xs px-2 py-1"
                    disabled={savingSlug === f.categorySlug}
                    onClick={() => save(f.categorySlug, f.status === "paused" ? "active" : "paused", drafts[f.categorySlug] ?? "")}
                  >
                    {f.status === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button
                    className="btn btn-primary text-xs px-2 py-1"
                    disabled={savingSlug === f.categorySlug}
                    onClick={() => save(f.categorySlug, f.status, drafts[f.categorySlug] ?? "")}
                  >
                    Save note
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

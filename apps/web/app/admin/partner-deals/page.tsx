"use client";

import { useEffect, useState } from "react";

type SyncConfigRow = {
  id: string;
  advertiserId: string;
  advertiserName: string;
  categoryId: string | null;
  active: boolean;
  addedAt: string;
  productCount: number;
};
type Programme = { id: string; name: string; status: string };
type Category = { id: string; name: string };

/**
 * 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill my
 * store with goods... earn comission off items through affiliate
 * programs, this is seperate from our core buisness." Two states this page
 * can be in: not configured yet (Steven hasn't signed up as an Awin
 * publisher / set the token) — shows exactly what to go get; configured —
 * pick from the merchant programmes actually approved, one at a time, per
 * the confirmed "small pilot — 2-3 merchants first" scope. Synced products
 * show on /partner-deals (public) — see api/affiliate-products/route.ts.
 */
export default function AdminPartnerDealsPage() {
  const [awinConfigured, setAwinConfigured] = useState<boolean | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmesError, setProgrammesError] = useState<string | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfigRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [busyAdvertiserId, setBusyAdvertiserId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/admin/awin-sync")
      .then((r) => r.json())
      .then((d) => {
        setAwinConfigured(Boolean(d.awinConfigured));
        setProgrammes(d.joinedProgrammes ?? []);
        setProgrammesError(d.programmesError ?? null);
        setSyncConfig(d.syncConfig ?? []);
        setCategories(d.categories ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const syncedAdvertiserIds = new Set(syncConfig.map((c) => c.advertiserId));

  async function addAdvertiser(programme: Programme) {
    setAddingId(programme.id);
    await fetch("/api/admin/awin-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        advertiserId: programme.id,
        advertiserName: programme.name,
        categoryId: categoryDrafts[programme.id] || null,
      }),
    });
    setAddingId(null);
    load();
  }

  async function removeAdvertiser(advertiserId: string) {
    setBusyAdvertiserId(advertiserId);
    await fetch(`/api/admin/awin-sync?advertiserId=${encodeURIComponent(advertiserId)}`, { method: "DELETE" });
    setBusyAdvertiserId(null);
    load();
  }

  if (loading) return <p className="text-textDim text-sm">Loading…</p>;

  if (!awinConfigured) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-xl font-bold">Partner Deals — Awin affiliate integration</h1>
        <div className="card space-y-3 text-sm">
          <p className="text-gold font-bold">Not set up yet.</p>
          <p className="text-textDim">
            This section is a separate revenue stream from Flipsta's core buy/resell business — products stay
            listed on the merchant's own site, and Flipsta earns a commission when a shopper clicks through and
            buys there. Nothing here touches payment, shipping, or your Stripe account.
          </p>
          <p className="text-textDim">To turn this on:</p>
          <ol className="list-decimal list-inside text-textDim space-y-1">
            <li>
              Sign up as an Awin publisher at{" "}
              <a href="https://www.awin.com" target="_blank" rel="noopener noreferrer" className="text-brand2 underline">
                awin.com
              </a>{" "}
              (free — this needs your own business details, so it has to be you).
            </li>
            <li>Apply to join 2-3 merchant programmes relevant to Flipsta's categories — each approves separately, usually within a few days.</li>
            <li>
              Once approved, generate your API token at{" "}
              <a href="https://ui.awin.com/awin-api" target="_blank" rel="noopener noreferrer" className="text-brand2 underline">
                ui.awin.com/awin-api
              </a>
              , and find your Publisher ID on your Awin account dashboard.
            </li>
            <li>Send both to whoever manages Render, to set as <code>AWIN_API_TOKEN</code> and <code>AWIN_PUBLISHER_ID</code> on flipsta-web and flipsta-worker.</li>
          </ol>
          <p className="text-textFaint text-xs pt-1">
            Once both are set and the site redeploys, this page will show every merchant programme you're approved
            for — pick 2-3 to start syncing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Partner Deals — Awin affiliate integration</h1>
        <p className="text-textDim text-sm">
          Products from merchants below sync into /partner-deals every few hours. A shopper who clicks through and
          buys on the merchant's site earns Flipsta a commission — Flipsta never holds or ships these.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-bold text-sm text-textDim uppercase tracking-wide">Currently syncing ({syncConfig.length})</h2>
        {syncConfig.length === 0 ? (
          <p className="text-textDim text-sm">Nothing added yet — pick a merchant from your approved programmes below.</p>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                  <th className="p-3">Merchant</th>
                  <th className="p-3">Products synced</th>
                  <th className="p-3">Added</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {syncConfig.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="p-3 font-bold">{c.advertiserName}</td>
                    <td className="p-3">{c.productCount === 0 ? <span className="text-textFaint">Not synced yet</span> : c.productCount}</td>
                    <td className="p-3 text-textDim">{new Date(c.addedAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <button
                        className="btn btn-ghost text-xs px-2 py-1 text-red"
                        disabled={busyAdvertiserId === c.advertiserId}
                        onClick={() => removeAdvertiser(c.advertiserId)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-sm text-textDim uppercase tracking-wide">Your approved Awin programmes</h2>
        {programmesError && <p className="text-red text-sm">{programmesError}</p>}
        {programmes.length === 0 && !programmesError && (
          <p className="text-textDim text-sm">No approved programmes yet — apply to a few merchants on Awin first.</p>
        )}
        <div className="space-y-2">
          {programmes
            .filter((p) => !syncedAdvertiserIds.has(p.id))
            .map((p) => (
              <div key={p.id} className="card flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm">{p.name}</div>
                  <div className="text-xs text-textDim capitalize">{p.status}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
                    value={categoryDrafts[p.id] ?? ""}
                    onChange={(e) => setCategoryDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  >
                    <option value="">Uncategorised</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary text-xs px-3 py-1.5" disabled={addingId === p.id} onClick={() => addAdvertiser(p)}>
                    {addingId === p.id ? "Adding…" : "Add to sync"}
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type LiveShow = {
  id: string;
  title: string;
  description: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduled_at: string | null;
  started_at: string | null;
  hostDisplayName: string;
};

/**
 * 27 Aug 2026, Steven: "i would like to be able to offer my resellers the
 * oppotunity to do live selling via my site. a bit like QVC... i think
 * whatnot does this already so would be a good feature to have."
 * Confirmed answer on who can host: "Any approved reseller".
 */
export default function LivePage() {
  const [shows, setShows] = useState<LiveShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function load() {
      fetch("/api/live-shows")
        .then((r) => r.json())
        .then((d) => setShows(d.shows ?? []))
        .finally(() => setLoading(false));
    }
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const live = shows.filter((s) => s.status === "live");
  const upcoming = shows.filter((s) => s.status === "scheduled");
  const ended = shows.filter((s) => s.status === "ended").slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Selling</h1>
          <p className="text-textDim text-sm">Watch resellers go live and bid on items in real time — like QVC, or Whatnot.</p>
        </div>
        <a href="/live/new" className="btn btn-primary text-sm px-4 py-2">
          Schedule a show
        </a>
      </div>

      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : (
        <>
          <ShowSection title="Live now" shows={live} emptyText="Nobody's live right now — check back soon." highlight />
          <ShowSection title="Upcoming" shows={upcoming} emptyText="No shows scheduled yet." />
          <ShowSection title="Recently ended" shows={ended} emptyText="No past shows yet." />
        </>
      )}
    </div>
  );
}

function ShowSection({ title, shows, emptyText, highlight }: { title: string; shows: LiveShow[]; emptyText: string; highlight?: boolean }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">
        {title}
        {highlight && shows.length > 0 && <span className="text-xs font-bold text-red-400 border border-red-400 rounded-full px-2 py-0.5">● LIVE</span>}
      </h2>
      {shows.length === 0 ? (
        <p className="text-textDim text-sm">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shows.map((s) => (
            <a key={s.id} href={`/live/${s.id}`} className="card p-4 space-y-2 hover:border-brand transition">
              <div className="flex items-center justify-between">
                <span className="font-bold">{s.title}</span>
                {s.status === "live" && <span className="text-xs font-bold text-red-400">● LIVE</span>}
              </div>
              <p className="text-textDim text-xs">Hosted by {s.hostDisplayName}</p>
              {s.description && <p className="text-sm line-clamp-2">{s.description}</p>}
              {s.status === "scheduled" && s.scheduled_at && (
                <p className="text-xs text-textDim">Starts {new Date(s.scheduled_at).toLocaleString()}</p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type LeaderboardEntry = {
  sellerId: string;
  displayName: string;
  profitGBP: number;
  itemsSold: number;
};

/**
 * 27 Aug 2026, Steven: "When someone signs up as a reseller it would be
 * good to have a leaderboard showing who is the top seller by profit on
 * the site, Top 10 is good enough." Confirmed "Fully public with exact
 * profit" — no sign-in gate, visible to anyone including a pre-signup
 * visitor (this is meant to help SELL the reseller opportunity, same
 * reasoning as showing real numbers rather than vague claims).
 */
export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setEntries(d.leaderboard ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Top Resellers</h1>
        <p className="text-textDim text-sm">
          Ranked by real, realized profit from completed sales — not an estimate. Only counts sales sourced through
          Flipsta's own opportunities pipeline.
        </p>
      </div>

      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="card p-6 text-center text-textDim">No completed sales yet — be the first on the board.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                <th className="p-3">Rank</th>
                <th className="p-3">Reseller</th>
                <th className="p-3">Items sold</th>
                <th className="p-3">Total profit</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.sellerId} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </td>
                  <td className="p-3 font-bold">{e.displayName}</td>
                  <td className="p-3">{e.itemsSold}</td>
                  <td className="p-3 font-bold text-brand">£{e.profitGBP.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

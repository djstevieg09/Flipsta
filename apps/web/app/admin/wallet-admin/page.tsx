"use client";

import { useEffect, useState } from "react";

type WalletUser = {
  id: string;
  displayName: string;
  email: string | null;
  subscriptionTier: string;
  flippyCoinBalance: number;
  createdAt: string;
};

/**
 * 18 Sept 2026, Steven: "i need to be able to add flippy coins to peoples
 * flip wallet. this should be done from the admin panel. add a tab wallet
 * admin. In there should be everyone thats signed up. i should be able to
 * search via email address or username (avatar name) and add an amount of
 * coins that i see fit." Everyone signed up, real data from
 * GET /api/admin/wallet-admin; search filters client-side against both
 * displayName and email, same pattern as /admin/sellers. Adding coins
 * posts to the same route and always goes through credit_flippy_coins()
 * server-side (migration 0031_flippy_coins.sql) — never a direct balance
 * edit — so it's reflected on that user's own /coins page and header
 * balance immediately.
 */
export default function AdminWalletPage() {
  const [users, setUsers] = useState<WalletUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/admin/wallet-admin")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function addCoins(user: WalletUser) {
    const raw = amounts[user.id];
    const amountCoins = Number(raw);
    if (!raw || !Number.isInteger(amountCoins) || amountCoins === 0) {
      window.alert("Enter a non-zero whole number of coins, e.g. 50 or -10.");
      return;
    }
    const reason = window.prompt(
      `Reason for ${amountCoins >= 0 ? "adding" : "removing"} ${Math.abs(amountCoins)} coin(s) for ${user.displayName} (goes into the audit log):`,
    );
    if (reason === null) return;

    setBusyId(user.id);
    setMessage(null);
    const res = await fetch("/api/admin/wallet-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: user.id, amountCoins, reason }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      window.alert(data.error ?? "Something went wrong.");
      return;
    }
    setMessage(`Done — ${amountCoins >= 0 ? "+" : ""}${amountCoins} coins for ${data.profileDisplayName}. New balance: ${data.newBalance}.`);
    setAmounts((a) => ({ ...a, [user.id]: "" }));
    load();
  }

  const query = q.trim().toLowerCase();
  const filtered = users.filter(
    (u) => !query || u.displayName.toLowerCase().includes(query) || (u.email ?? "").toLowerCase().includes(query),
  );

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Every signed-up user, real data from <code>/api/admin/wallet-admin</code>. Adding or removing coins always
        goes through <code>credit_flippy_coins()</code> and is recorded in <code>admin_audit_log</code> (Section
        12.1) — it shows up on that user&apos;s own Coins page and header balance right away.
      </p>
      <input
        type="text"
        placeholder="Search by email or display name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm w-80"
      />
      {message && <div className="card text-sm">{message}</div>}
      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                <th className="p-3">User</th>
                <th className="p-3">Tier</th>
                <th className="p-3">Flippy Coin balance</th>
                <th className="p-3">Add / remove coins</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <div className="font-bold">{u.displayName}</div>
                    <div className="text-xs text-textDim">{u.email ?? "—"}</div>
                  </td>
                  <td className="p-3 capitalize">{u.subscriptionTier}</td>
                  <td className="p-3">
                    <span className="font-bold inline-flex items-center gap-1">
                      <span aria-hidden>🪙</span> {u.flippyCoinBalance.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <input
                        type="number"
                        placeholder="e.g. 50 or -10"
                        value={amounts[u.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))}
                        className="bg-surface2 border border-border rounded-lg px-2 py-1.5 text-sm w-28"
                      />
                      <button
                        className="btn btn-ghost text-xs px-2 py-1"
                        disabled={busyId === u.id}
                        onClick={() => addCoins(u)}
                      >
                        {busyId === u.id ? "…" : "Apply"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-textDim">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

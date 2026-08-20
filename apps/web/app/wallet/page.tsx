"use client";

import { useEffect, useState } from "react";

type Transaction = {
  id: string;
  amount_gbp: number;
  kind: string;
  reference_order_id: string | null;
  created_at: string;
};

export default function WalletPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    fetch("/api/wallet").then(async (r) => {
      if (r.status === 401) {
        setSignedIn(false);
        return;
      }
      const d = await r.json();
      setTransactions(d.transactions ?? []);
      setBalance(d.balanceGBP ?? 0);
    });
  }, []);

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see your wallet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <p className="text-textDim text-sm">
        Real transaction ledger — payouts land here the moment{" "}
        <code>apps/worker/src/jobs/releaseEscrow.ts</code> releases escrowed funds for a delivered order.
      </p>
      <div className="card max-w-xs">
        <div className="text-xs text-textDim uppercase tracking-wide mb-2">Balance</div>
        <div className="text-3xl font-extrabold">£{balance.toFixed(2)}</div>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Date</th>
              <th className="p-3">Type</th>
              <th className="p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="p-3 text-textDim">{new Date(t.created_at).toLocaleString()}</td>
                <td className="p-3 capitalize">{t.kind.replace(/_/g, " ")}</td>
                <td className={`p-3 font-bold ${t.amount_gbp >= 0 ? "text-green" : "text-red"}`}>
                  {t.amount_gbp >= 0 ? "+" : ""}£{t.amount_gbp.toFixed(2)}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-textDim">
                  No transactions yet — they'll appear once a sale you made is delivered and the hold period passes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type WonOpportunity = { id: string; categories: { name: string } | null; source_tier: string; status: string };
type Listing = {
  id: string;
  price_gbp: number;
  sold_at: string | null;
  products: { title: string; condition: string } | null;
  listing_channel_posts: { channel: string; status: string; external_url: string | null }[];
};
type Order = { id: string; price_gbp: number; status: string; created_at: string; listings: { products: { title: string } | null } | null };

/**
 * Section 12.1's "self serving" ask, made real: everything a seller needs
 * to see about their own activity — wins, listings (with cross-post
 * status), and orders both bought and sold — without an admin in the loop.
 */
export default function PortfolioPage() {
  const [won, setWon] = useState<WonOpportunity[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [ordersAsBuyer, setOrdersAsBuyer] = useState<Order[]>([]);
  const [ordersAsSeller, setOrdersAsSeller] = useState<Order[]>([]);
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    fetch("/api/opportunities?won=true").then(async (r) => {
      if (r.status === 401) {
        setSignedIn(false);
        return;
      }
      const d = await r.json();
      setWon(d.opportunities ?? []);
    });
    fetch("/api/listings?mine=true")
      .then((r) => r.json())
      .then((d) => setListings(d.listings ?? []));
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => {
        setOrdersAsBuyer(d.asBuyer ?? []);
        setOrdersAsSeller(d.asSeller ?? []);
      });
  }, []);

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see your portfolio.
      </p>
    );
  }

  const unlistedWins = won.filter((o) => o.status === "won");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">Won opportunities</h2>
        {unlistedWins.length > 0 && (
          <p className="text-xs text-gold">
            {unlistedWins.length} won and not listed yet — <a className="underline" href="/sell/new">list one now</a>.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {won.map((o) => (
            <div key={o.id} className="card">
              <div className="font-bold text-sm">{o.categories?.name ?? "Item"}</div>
              <div className="text-xs text-textDim">{o.source_tier}</div>
              <div className="text-xs mt-1 capitalize">{o.status}</div>
            </div>
          ))}
          {won.length === 0 && <p className="text-textDim text-sm">No wins yet — browse Live Opportunities.</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">My listings</h2>
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                <th className="p-3">Item</th>
                <th className="p-3">Price</th>
                <th className="p-3">Status</th>
                <th className="p-3">Cross-posted to</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{l.products?.title ?? "—"}</td>
                  <td className="p-3">£{Number(l.price_gbp).toFixed(2)}</td>
                  <td className="p-3">{l.sold_at ? "Sold" : "Live"}</td>
                  <td className="p-3 text-textDim">
                    {l.listing_channel_posts.length === 0
                      ? "—"
                      : l.listing_channel_posts.map((c) => `${c.channel} (${c.status})`).join(", ")}
                  </td>
                </tr>
              ))}
              {listings.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-textDim">
                    No listings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">My sales</h2>
        <OrdersTable orders={ordersAsSeller} />
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">My purchases</h2>
        <OrdersTable orders={ordersAsBuyer} />
      </section>
    </div>
  );
}

function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-textDim text-xs uppercase border-b border-border">
            <th className="p-3">Item</th>
            <th className="p-3">Price</th>
            <th className="p-3">Status</th>
            <th className="p-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-0">
              <td className="p-3 font-bold">{o.listings?.products?.title ?? "—"}</td>
              <td className="p-3">£{Number(o.price_gbp).toFixed(2)}</td>
              <td className="p-3 capitalize">{o.status.replace(/_/g, " ")}</td>
              <td className="p-3 text-textDim">{new Date(o.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-textDim">
                None yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

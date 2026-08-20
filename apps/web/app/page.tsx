export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Flipsta</h1>
      <p className="text-textDim max-w-xl">
        This is the real, database-backed application — reseller opportunities, buyer wants, and the
        marketplace order book all read and write to Postgres via the API routes in <code>app/api</code>.
        The HTML mockups delivered earlier are the design reference this UI is being built out to match.
      </p>
      <div className="flex gap-3">
        <a href="/opportunities" className="btn btn-primary">Live Opportunities</a>
        <a href="/shop" className="btn btn-ghost">Shop</a>
        <a href="/wants" className="btn btn-ghost">Buyer Wants</a>
      </div>
    </div>
  );
}

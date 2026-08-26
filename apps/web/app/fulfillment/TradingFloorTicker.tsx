"use client";

/**
 * 26 Aug 2026, Steven, with a reference photo of a real stock-exchange LED
 * ticker: "the banner thats running across the top of the page on the
 * resellers needs to be like a traders floor." Purely cosmetic/motivational
 * on top of real data already fetched by the page (claimable jobs) — no new
 * API, no new state, just a different presentation of what's already there.
 *
 * Seamless-loop technique: the item list is rendered twice back-to-back
 * inside one flex row, and the CSS animation slides it left by exactly
 * -50% (one full copy's width) then snaps back to 0 — since the two
 * copies are identical, the snap is invisible and the scroll looks
 * continuous forever.
 */
export type TickerJob = { id: string; productName: string; rewardGBP: number };

export default function TradingFloorTicker({ jobs }: { jobs: TickerJob[] }) {
  const hasJobs = jobs.length > 0;
  const segments = hasJobs
    ? jobs
    : [{ id: "empty", productName: "NO OPEN FULFILLMENT JOBS RIGHT NOW — CHECK BACK SOON", rewardGBP: 0 }];

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-[#1a1a1a] mb-4"
      style={{ background: "#050505" }}
      aria-label="Open fulfillment jobs ticker"
    >
      {/* Subtle dot-matrix texture behind the text, like an actual LED board. */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #1c1c1c 1px, transparent 1px)",
          backgroundSize: "4px 4px",
        }}
      />
      <div className="flex whitespace-nowrap py-2.5 ticker-track" style={{ width: "max-content" }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center shrink-0">
            {segments.map((s, i) => (
              <span
                key={`${copy}-${s.id}-${i}`}
                className="flex items-center gap-2 px-5 text-sm font-bold tracking-wide"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, 'Courier New', monospace" }}
              >
                {hasJobs ? (
                  <>
                    <span style={{ color: "#3ee66b" }}>▲</span>
                    <span style={{ color: "#e8e8e8" }}>{s.productName.toUpperCase()}</span>
                    <span style={{ color: "#3ee66b" }}>+£{s.rewardGBP.toFixed(2)}</span>
                  </>
                ) : (
                  <span style={{ color: "#555" }}>{s.productName}</span>
                )}
                <span style={{ color: "#333" }}>{"//"}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <style>{`
        .ticker-track {
          animation: flipsta-ticker-scroll 28s linear infinite;
        }
        @keyframes flipsta-ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track { animation: none; }
        }
      `}</style>
    </div>
  );
}

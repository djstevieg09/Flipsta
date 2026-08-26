"use client";

import { useState } from "react";
import { useBasket, type BasketLine } from "../BasketProvider";

type LineResult = { key: string; ok: boolean; message: string };

/**
 * 26 Aug 2026, Steven: "shopping basket / multi-item checkout" — confirmed
 * via AskUserQuestion as "one click, several linked charges" rather than a
 * single combined Stripe charge. Checkout here just replays the basket as a
 * sequence of the EXISTING per-item purchase calls (POST /api/shop-items,
 * POST /api/orders), each going through its own already-built escrow flow
 * exactly as if bought individually from /shop — no new payment
 * architecture. A partial failure (e.g. a sibling unit sold out from under
 * someone else mid-checkout) only removes the lines that actually
 * succeeded; everything else stays in the basket to retry.
 */
export default function BasketPage() {
  const basket = useBasket();
  const [checkingOut, setCheckingOut] = useState(false);
  const [results, setResults] = useState<LineResult[]>([]);

  const subtotalGBP = basket.lines.reduce((sum, l) => sum + l.priceGBP * l.quantity, 0);

  async function checkout() {
    setCheckingOut(true);
    setResults([]);
    const outcomes: LineResult[] = [];

    for (const line of basket.lines) {
      if (line.kind === "shop_item") {
        const ids = (line.itemIds ?? []).slice(0, line.quantity);
        let succeededUnits = 0;
        let lastError = "";
        for (const itemId of ids) {
          const res = await fetch("/api/shop-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId }),
          });
          if (res.ok) {
            succeededUnits++;
          } else {
            const data = await res.json().catch(() => ({}));
            lastError = data.error ?? "Failed to buy this item.";
          }
        }
        if (succeededUnits === ids.length) {
          outcomes.push({ key: line.key, ok: true, message: `Bought ${succeededUnits} × ${line.productName}.` });
        } else if (succeededUnits > 0) {
          outcomes.push({
            key: line.key,
            ok: false,
            message: `${succeededUnits}/${ids.length} bought for ${line.productName} — ${lastError} (partial; adjust quantity and retry the rest).`,
          });
        } else {
          outcomes.push({ key: line.key, ok: false, message: `${line.productName}: ${lastError || "Nothing sourced could be bought."}` });
        }
      } else {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: line.listingId }),
        });
        if (res.ok) {
          outcomes.push({ key: line.key, ok: true, message: `Bought ${line.productName}.` });
        } else {
          const data = await res.json().catch(() => ({}));
          outcomes.push({ key: line.key, ok: false, message: `${line.productName}: ${data.error ?? "Failed to buy this item."}` });
        }
      }
    }

    setResults(outcomes);
    // Only clear the lines that fully succeeded — a partial or failed line
    // stays in the basket so the buyer can see what's left and retry.
    outcomes.filter((o) => o.ok).forEach((o) => basket.removeLine(o.key));
    setCheckingOut(false);
  }

  if (basket.lines.length === 0 && results.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Basket</h1>
        <p className="text-textDim text-sm">
          Your basket is empty — browse <a href="/shop" className="underline text-brand2">the shop</a> to add something.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Basket</h1>

      {results.length > 0 && (
        <div className="card space-y-1">
          {results.map((r) => (
            <div key={r.key} className={`text-sm ${r.ok ? "text-green" : "text-red"}`}>
              {r.message}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {basket.lines.map((line) => (
          <BasketLineRow key={line.key} line={line} onUpdateQuantity={basket.updateQuantity} onRemove={basket.removeLine} />
        ))}
      </div>

      {basket.lines.length > 0 && (
        <div className="card flex items-center justify-between">
          <div>
            <div className="text-xs text-textDim">Subtotal</div>
            <div className="text-xl font-extrabold">£{subtotalGBP.toFixed(2)}</div>
          </div>
          <button
            onClick={checkout}
            disabled={checkingOut}
            className="rounded-lg py-2.5 px-6 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}
          >
            {checkingOut ? "Checking out…" : "Checkout"}
          </button>
        </div>
      )}
      {basket.lines.length > 0 && (
        <p className="text-[10px] text-textFaint">
          Each item is bought and held in escrow separately, just like buying it directly — you&apos;ll see every one
          in your Portfolio once it goes through.
        </p>
      )}
    </div>
  );
}

function BasketLineRow({
  line,
  onUpdateQuantity,
  onRemove,
}: {
  line: BasketLine;
  onUpdateQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="card flex items-center gap-3">
      {line.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={line.imageUrl} alt={line.productName} className="w-16 h-16 object-cover rounded-lg border border-border shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-lg border border-border shrink-0 flex items-center justify-center text-[9px] text-textFaint">
          No photo
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{line.productName}</div>
        <div className="text-xs text-textDim">£{line.priceGBP.toFixed(2)} each</div>
        {line.kind === "listing" && <div className="text-[10px] text-textFaint">Peer listing — 1 unit only</div>}
      </div>
      {line.kind === "shop_item" && line.maxQuantity > 1 ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onUpdateQuantity(line.key, line.quantity - 1)}
            className="w-7 h-7 rounded-lg border border-border hover:border-brand2"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-5 text-center text-sm">{line.quantity}</span>
          <button
            onClick={() => onUpdateQuantity(line.key, line.quantity + 1)}
            disabled={line.quantity >= line.maxQuantity}
            className="w-7 h-7 rounded-lg border border-border hover:border-brand2 disabled:opacity-40"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      ) : (
        <div className="text-xs text-textDim shrink-0">Qty {line.quantity}</div>
      )}
      <div className="text-right shrink-0 w-20">
        <div className="font-bold text-sm">£{(line.priceGBP * line.quantity).toFixed(2)}</div>
      </div>
      <button onClick={() => onRemove(line.key)} className="text-textDim hover:text-red text-xs shrink-0" aria-label="Remove">
        Remove
      </button>
    </div>
  );
}

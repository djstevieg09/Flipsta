"use client";

import { useEffect, useState } from "react";

type ShopperProfile = {
  id: string;
  name: string;
  shoe_size_uk: string | null;
  top_size: string | null;
  bottom_size: string | null;
  kids_shoe_size_uk: string | null;
  kids_clothing_size: string | null;
};

/**
 * 26 Aug 2026, Steven: "i want a switch on the main shopping window to ask
 * who are you shopping for and then it will show items in their size."
 * Reads the signed-in user's shopper_profiles (set up at /account) and
 * hands the selected profile's non-blank sizes up to the parent as a flat
 * string list — the parent passes that straight through as ?sizes= to
 * GET /api/shop-items and GET /api/products (see lib/sizeFilter.ts).
 * Renders nothing for a signed-out visitor or someone with no profiles set
 * up yet, rather than showing an empty/broken switch.
 */
export default function ShopperSwitch({ onSizesChange }: { onSizesChange: (sizes: string[]) => void }) {
  const [profiles, setProfiles] = useState<ShopperProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetch("/api/account/shopper-profiles").then(async (r) => {
      if (r.status === 401) {
        setVisible(false);
        return;
      }
      const d = await r.json();
      setProfiles(d.profiles ?? []);
    });
  }, []);

  function select(id: string) {
    setSelectedId(id);
    const profile = profiles.find((p) => p.id === id);
    if (!profile) {
      onSizesChange([]);
      return;
    }
    const sizes = [profile.shoe_size_uk, profile.top_size, profile.bottom_size, profile.kids_shoe_size_uk, profile.kids_clothing_size].filter(
      (s): s is string => Boolean(s),
    );
    onSizesChange(sizes);
  }

  if (!visible || profiles.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-textDim whitespace-nowrap">Shopping for</label>
      <select
        className="bg-surface2 border border-border rounded-lg px-3 py-1.5 text-sm"
        value={selectedId}
        onChange={(e) => select(e.target.value)}
      >
        <option value="">Everyone</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

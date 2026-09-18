"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHero from "@/app/components/PageHero";

type ShopperProfile = {
  id: string;
  name: string;
  shoe_size_uk: string | null;
  top_size: string | null;
  bottom_size: string | null;
  kids_shoe_size_uk: string | null;
  kids_clothing_size: string | null;
};

const BLANK_FORM = {
  name: "",
  shoeSizeUk: "",
  topSize: "",
  bottomSize: "",
  kidsShoeSizeUk: "",
  kidsClothingSize: "",
};

/**
 * 26 Aug 2026, Steven: "Need an accounts page so people can setup their
 * payment methods, add clothes and show sizes." Two sections: payment
 * methods (hands off to Stripe's own hosted page — never touches card
 * data here) and shopper profiles (the sizes /shop's "who are you
 * shopping for" switch reads from). Confirmed via a clarifying question:
 * full sizing, every field optional, leaving a field blank means don't
 * filter on it at all rather than hiding everything.
 */
export default function AccountPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(true);
  const [profiles, setProfiles] = useState<ShopperProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [notifyDealMatches, setNotifyDealMatches] = useState<boolean | null>(null);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyPromotions, setNotifyPromotions] = useState<boolean | null>(null);
  const [promoSaving, setPromoSaving] = useState(false);

  // 18 Sept 2026, Steven: "they should also be able to name themselves how
  // they will be displayed on Flipsta." displayName loads from /api/me
  // (the source of truth, profiles.display_name) and saves via PATCH
  // /api/account/profile — the only self-editable profile field so far.
  const [displayName, setDisplayName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  function loadProfiles() {
    fetch("/api/account/shopper-profiles").then(async (r) => {
      if (r.status === 401) {
        setSignedIn(false);
        setLoading(false);
        return;
      }
      const d = await r.json();
      setProfiles(d.profiles ?? []);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadProfiles();
    fetch("/api/account/notification-prefs").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setNotifyDealMatches(Boolean(d.notifyDealMatches));
      setNotifyPromotions(Boolean(d.notifyPromotions));
    });
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile?.displayName) {
          setDisplayName(d.profile.displayName);
          setNameInput(d.profile.displayName);
        }
      })
      .catch(() => {});
  }, []);

  async function saveDisplayName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Enter a display name.");
      return;
    }
    setNameSaving(true);
    setNameError(null);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: trimmed }),
    });
    const data = await res.json();
    setNameSaving(false);
    if (!res.ok) {
      setNameError(data.error ?? "Couldn't save that right now.");
      return;
    }
    setDisplayName(data.displayName);
    setNameInput(data.displayName);
    setEditingName(false);
    // The header's avatar dropdown (layout.tsx, a Server Component) reads
    // display_name at render time — refresh so it doesn't keep showing the
    // old name until the next full navigation.
    router.refresh();
  }

  // 27 Aug 2026 — see claude/deployment-checklist.md's #-5 research: this
  // is on by default, so switching it off needs to be exactly as easy as
  // that default was, not buried behind a confirmation or a support
  // ticket.
  async function toggleNotifyDealMatches() {
    const next = !notifyDealMatches;
    setNotifySaving(true);
    setNotifyDealMatches(next); // optimistic — a real toggle should feel instant
    const res = await fetch("/api/account/notification-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyDealMatches: next }),
    });
    if (!res.ok) setNotifyDealMatches(!next); // revert on failure
    setNotifySaving(false);
  }

  // 18 Sept 2026 — opt-out for the admin-composed promo broadcasts
  // (/admin/broadcasts, migration 0037), same instant-toggle treatment.
  async function toggleNotifyPromotions() {
    const next = !notifyPromotions;
    setPromoSaving(true);
    setNotifyPromotions(next);
    const res = await fetch("/api/account/notification-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyPromotions: next }),
    });
    if (!res.ok) setNotifyPromotions(!next);
    setPromoSaving(false);
  }

  async function openPaymentPortal() {
    setPortalBusy(true);
    setPortalError(null);
    const res = await fetch("/api/account/payment-portal", { method: "POST" });
    const data = await res.json();
    if (res.ok && data.url) {
      window.location.href = data.url;
    } else {
      setPortalError(data.error ?? "Couldn't open payment methods right now.");
      setPortalBusy(false);
    }
  }

  function startAdd() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
    setError(null);
  }

  function startEdit(p: ShopperProfile) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      shoeSizeUk: p.shoe_size_uk ?? "",
      topSize: p.top_size ?? "",
      bottomSize: p.bottom_size ?? "",
      kidsShoeSizeUk: p.kids_shoe_size_uk ?? "",
      kidsClothingSize: p.kids_clothing_size ?? "",
    });
    setShowForm(true);
    setError(null);
  }

  async function saveProfile() {
    if (!form.name.trim()) {
      setError('Give this profile a name, e.g. "Me" or "Sarah".');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(editingId ? `/api/account/shopper-profiles/${editingId}` : "/api/account/shopper-profiles", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't save that profile.");
      return;
    }
    setShowForm(false);
    loadProfiles();
  }

  async function deleteProfile(id: string) {
    await fetch(`/api/account/shopper-profiles/${id}`, { method: "DELETE" });
    loadProfiles();
  }

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to manage your account.
      </p>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHero
        eyebrow="Your account"
        title={
          <>
            Hey, <span className="text-gold">{displayName || "there"}</span>
          </>
        }
        subtitle="Your display name, payment methods, and the shopping profiles that power &quot;who are you shopping for&quot; on the Shop."
        decorations={[
          { emoji: "👤", className: "-top-4 -left-6", animate: "bob" },
          { emoji: "⚙️", className: "top-1 -right-7", animate: "sway" },
          { emoji: "🔒", className: "-bottom-3 left-1/3 w-10 h-10", boxed: true, sizeClassName: "text-lg", animate: "bob", delay: "0.5s" },
        ]}
      />

      <section className="space-y-2">
        <h2 className="font-bold text-lg">Display name</h2>
        <div className="card space-y-3">
          <p className="text-sm text-textDim">How you show up on Flipsta — activity feeds, the trading floor ticker, and anywhere else your name appears.</p>
          {editingName ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                value={nameInput}
                maxLength={40}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={saveDisplayName} disabled={nameSaving} className="btn btn-primary disabled:opacity-50">
                  {nameSaving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameInput(displayName);
                    setNameError(null);
                  }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-sm">{displayName || "—"}</span>
              <button onClick={() => setEditingName(true)} className="text-xs font-bold border border-border rounded-lg px-3 py-1.5 hover:border-brand2">
                Change
              </button>
            </div>
          )}
          {nameError && <p className="text-xs text-red">{nameError}</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">Payment methods</h2>
        <div className="card space-y-2">
          <p className="text-sm text-textDim">
            Add or update a saved card on Stripe&apos;s own secure page — Flipsta never sees or stores your card
            details directly.
          </p>
          <button onClick={openPaymentPortal} disabled={portalBusy} className="btn btn-primary disabled:opacity-50">
            {portalBusy ? "Opening…" : "Manage payment methods"}
          </button>
          {portalError && <p className="text-xs text-red">{portalError}</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">Notifications</h2>
        <div className="card flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-sm">Email me when a new deal matches me</div>
            <div className="text-xs text-textDim">
              Based on your wishlist and shopping profile sizes — real matches only, and never more than one email
              per check.
            </div>
          </div>
          <button
            onClick={toggleNotifyDealMatches}
            disabled={notifyDealMatches === null || notifySaving}
            className={`shrink-0 w-12 h-7 rounded-full relative transition-colors disabled:opacity-50 ${notifyDealMatches ? "" : "bg-surface2 border border-border"}`}
            style={notifyDealMatches ? { background: "linear-gradient(135deg,#f2b545,#ffd77a)" } : undefined}
            aria-pressed={Boolean(notifyDealMatches)}
            aria-label="Toggle deal-match email notifications"
          >
            <span
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform"
              style={{ transform: notifyDealMatches ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>
        <div className="card flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-sm">Email me promos and offers</div>
            <div className="text-xs text-textDim">
              Occasional marketing emails from Flipsta. Turn this off any time — it won&apos;t affect deal-match
              alerts above.
            </div>
          </div>
          <button
            onClick={toggleNotifyPromotions}
            disabled={notifyPromotions === null || promoSaving}
            className={`shrink-0 w-12 h-7 rounded-full relative transition-colors disabled:opacity-50 ${notifyPromotions ? "" : "bg-surface2 border border-border"}`}
            style={notifyPromotions ? { background: "linear-gradient(135deg,#f2b545,#ffd77a)" } : undefined}
            aria-pressed={Boolean(notifyPromotions)}
            aria-label="Toggle promotional email notifications"
          >
            <span
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform"
              style={{ transform: notifyPromotions ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Shopping profiles</h2>
          <button onClick={startAdd} className="text-xs font-bold border border-border rounded-lg px-3 py-1.5 hover:border-brand2">
            + Add profile
          </button>
        </div>
        <p className="text-textDim text-sm">
          Set up a profile for yourself or anyone you shop for. Fill in whatever sizes you know — leave the rest
          blank and it just won&apos;t filter on that, nothing gets hidden because a size isn&apos;t set.
        </p>

        {loading && <p className="text-textDim text-sm">Loading…</p>}

        <div className="space-y-2">
          {profiles.map((p) => {
            const sizeParts = [
              p.shoe_size_uk && `Shoe UK ${p.shoe_size_uk}`,
              p.top_size && `Top ${p.top_size}`,
              p.bottom_size && `Bottom ${p.bottom_size}`,
              p.kids_shoe_size_uk && `Kids shoe UK ${p.kids_shoe_size_uk}`,
              p.kids_clothing_size && `Kids clothing ${p.kids_clothing_size}`,
            ].filter(Boolean);
            return (
              <div key={p.id} className="card flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm">{p.name}</div>
                  <div className="text-xs text-textDim">
                    {sizeParts.length > 0 ? sizeParts.join(" · ") : "No sizes set — shows everything"}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(p)} className="text-xs font-bold border border-border rounded-lg px-3 py-1.5 hover:border-brand2">
                    Edit
                  </button>
                  <button onClick={() => deleteProfile(p.id)} className="text-xs font-bold border border-border rounded-lg px-3 py-1.5 hover:border-red text-red">
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && profiles.length === 0 && !showForm && (
            <p className="text-textDim text-sm">No shopping profiles yet — add one to use the size filter on the Shop.</p>
          )}
        </div>

        {showForm && (
          <div className="card space-y-3">
            <div className="font-bold text-sm">{editingId ? "Edit profile" : "New profile"}</div>
            <div>
              <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Name</label>
              <input
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Me, Sarah, Jake"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Shoe size (UK)</label>
                <input
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                  value={form.shoeSizeUk}
                  onChange={(e) => setForm((f) => ({ ...f, shoeSizeUk: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Top size</label>
                <input
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="S, M, L…"
                  value={form.topSize}
                  onChange={(e) => setForm((f) => ({ ...f, topSize: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Bottom size</label>
                <input
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                  value={form.bottomSize}
                  onChange={(e) => setForm((f) => ({ ...f, bottomSize: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Kids shoe size (UK)</label>
                <input
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                  value={form.kidsShoeSizeUk}
                  onChange={(e) => setForm((f) => ({ ...f, kidsShoeSizeUk: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Kids clothing size</label>
                <input
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. 5-6 years"
                  value={form.kidsClothingSize}
                  onChange={(e) => setForm((f) => ({ ...f, kidsClothingSize: e.target.value }))}
                />
              </div>
            </div>
            {error && <p className="text-xs text-red">{error}</p>}
            <div className="flex gap-2">
              <button onClick={saveProfile} disabled={saving} className="btn btn-primary disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

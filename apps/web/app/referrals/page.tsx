"use client";

import { useEffect, useState } from "react";
import { FRIEND_INVITE_EFFORT_BONUS_COINS, FRIEND_INVITE_SIGNUP_BONUS_COINS, REFERRAL_REWARD_GBP } from "@flipsta/shared";
import PageHero from "@/app/components/PageHero";

/**
 * 26 Aug 2026, Steven: "we need a referral program." Confirmed via a
 * clarifying question: wallet credit for both sides, paid immediately on
 * signup — the actual crediting is a signup-trigger in migration 0016, this
 * page just shows the code/link and real stats from GET /api/referrals.
 */
export default function ReferralsPage() {
  const [code, setCode] = useState<string | null>(null);
  const [referredCount, setReferredCount] = useState(0);
  const [totalEarnedGBP, setTotalEarnedGBP] = useState(0);
  const [friendInvitesSent, setFriendInvitesSent] = useState(0);
  const [friendInvitesFulfilled, setFriendInvitesFulfilled] = useState(0);
  const [signedIn, setSignedIn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/referrals").then(async (r) => {
      if (r.status === 401) {
        setSignedIn(false);
        return;
      }
      const d = await r.json();
      setCode(d.code ?? null);
      setReferredCount(d.referredCount ?? 0);
      setTotalEarnedGBP(d.totalEarnedGBP ?? 0);
      setFriendInvitesSent(d.friendInvitesSent ?? 0);
      setFriendInvitesFulfilled(d.friendInvitesFulfilled ?? 0);
    });
  }, []);

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see your referral link.
      </p>
    );
  }

  const link = code ? `${origin}/signup?ref=${code}` : "";

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-lg">
      <PageHero
        title={
          <>
            Refer a <span className="text-gold">Friend</span>
          </>
        }
        subtitle={`You both get £${REFERRAL_REWARD_GBP.toFixed(2)} in your wallet the moment they sign up with your link — no purchase needed on either side.`}
        decorations={[
          { emoji: "🤝", className: "-top-4 -left-6", animate: "bob" },
          { emoji: "🎁", className: "top-1 -right-7", animate: "sway" },
          { emoji: "💷", className: "-bottom-3 left-1/3 w-11 h-11", boxed: true, animate: "bob", delay: "0.4s" },
        ]}
      />

      <div className="card space-y-3">
        <div>
          <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Your referral link</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-textDim"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={copyLink}
              disabled={!link}
              className="rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#f2b545,#ffd77a)" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        {code && <div className="text-xs text-textDim">Or just share your code: <span className="font-bold text-text">{code}</span></div>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="text-xs text-textDim uppercase tracking-wide mb-2">Friends referred</div>
          <div className="text-2xl font-extrabold">{referredCount}</div>
        </div>
        <div className="card">
          <div className="text-xs text-textDim uppercase tracking-wide mb-2">Earned from referrals</div>
          <div className="text-2xl font-extrabold text-green">£{totalEarnedGBP.toFixed(2)}</div>
        </div>
      </div>
      <p className="text-xs text-textFaint">
        Credits land in your <a href="/wallet" className="underline">Wallet</a> as soon as someone signs up with your
        link.
      </p>

      {/* 18 Sept 2026 — the newer "invite a friend at signup" coin mechanic
          (a friend's name + email typed into the signup form itself,
          rather than a shared link), shown as its own card since it pays
          Flippy Coins on a different schedule to the GBP link program
          above. */}
      <div className="card space-y-2">
        <div className="text-xs font-bold text-gold uppercase tracking-wide">Friends invited at signup</div>
        <p className="text-xs text-textDim">
          Next time you sign up somewhere new, add a friend's name and email on the form — you get{" "}
          {FRIEND_INVITE_EFFORT_BONUS_COINS} Flippy Coins right away, and {FRIEND_INVITE_SIGNUP_BONUS_COINS} more
          (for both of you) the moment they actually join.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-textDim uppercase tracking-wide mb-1">Friends invited</div>
            <div className="text-xl font-extrabold">{friendInvitesSent}</div>
          </div>
          <div>
            <div className="text-[10px] text-textDim uppercase tracking-wide mb-1">Joined so far</div>
            <div className="text-xl font-extrabold text-green">{friendInvitesFulfilled}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

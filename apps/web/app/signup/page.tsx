"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { REFERRAL_REWARD_GBP } from "@flipsta/shared";
import { SocialAuthButtons } from "@/app/components/SocialAuthButtons";

/**
 * There was previously no way for a real user to create an account through
 * the UI at all — this and /login are the minimum needed to actually test
 * the app end to end. Profile creation itself happens via the
 * `on_auth_user_created` trigger (0004_auth_profile_trigger.sql, redefined
 * by 0016_referral_program.sql to also handle referral_code/referred_by),
 * not here.
 *
 * 18 Sept 2026, Steven: "Looks very bad and bare. Needs to have mascot
 * again and something to fill the page. Also needs to be centre of page.
 * Also need more info like address and maybe if they are a business or
 * personal flipping. ask for business name if there is one and age as
 * need to be 16 to use the site. any other info you can think of would be
 * good also. need to protect from bots making accounts also." Rebuilt as
 * a centred two-column card (mascot + reasons to join on the left, the
 * form on the right, matching the homepage's gold-on-black hero) and
 * expanded to collect account type (personal/business), business name,
 * date of birth (checked against the 16+ minimum both here and, so it
 * can't be bypassed by calling the API directly, as a DB check constraint
 * — see supabase/migrations/0030_signup_profile_details.sql), and a
 * postal address. New fields are passed through signUp's `options.data`
 * exactly like display_name/referral_code already were, so the same
 * trigger picks them up.
 *
 * Bot protection: a Cloudflare Turnstile widget (free, no Google account
 * needed, one line of config once NEXT_PUBLIC_TURNSTILE_SITE_KEY is set —
 * see INFRASTRUCTURE_TODO.md #15). The widget alone only stops naive
 * scripted form-fills; real protection against someone calling Supabase's
 * Auth API directly needs Supabase's own "Enable Captcha protection"
 * toggle turned on (Dashboard → Authentication → Attack Protection) with
 * this same Turnstile site — that's a one-time step only Steven can do
 * from the Supabase dashboard, also covered in INFRASTRUCTURE_TODO.md #15.
 * Until the site key is set, the widget just doesn't render and signup
 * works exactly as it did before, same "not set up yet" pattern as every
 * other optional integration in this codebase (see e.g. Section 9/12).
 *
 * Known gap: Google/Facebook/Apple signup (SocialAuthButtons) goes through
 * Supabase's signInWithOAuth, which has no equivalent of signUp's
 * `options.data` — so none of these new fields (or the age check) apply
 * to a social signup. Worth a follow-up "complete your profile" prompt
 * for OAuth users later; out of scope for this pass.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function isAtLeast16(dobStr: string): boolean {
  if (!dobStr) return false;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 16);
  return dob <= cutoff;
}

function SignupForm() {
  // 26 Aug 2026, Steven: "we need a referral program." /referrals shares a
  // link shaped /signup?ref=CODE — passed through as referral_code in
  // raw_user_meta_data so the signup trigger can resolve and credit it.
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [accountType, setAccountType] = useState<"personal" | "business">("personal");
  const [businessName, setBusinessName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [agreed, setAgreed] = useState(false);

  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Turnstile — rendered manually (rather than the @marsidev/react-turnstile
  // package) so signup has zero new npm dependencies; it's a ~10-line
  // integration against the script's own documented window.turnstile API.
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!turnstileReady || !TURNSTILE_SITE_KEY || !turnstileRef.current) return;
    const turnstile = (window as unknown as { turnstile?: any }).turnstile;
    if (!turnstile) return;
    const widgetId = turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(null),
    });
    return () => turnstile.remove?.(widgetId);
  }, [turnstileReady]);

  const dobValid = isAtLeast16(dateOfBirth);
  const businessNameValid = accountType === "personal" || businessName.trim().length > 0;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const addressValid = addressLine1.trim() && city.trim() && postcode.trim();
  const canSubmit =
    Boolean(email) &&
    passwordsMatch &&
    Boolean(displayName) &&
    dobValid &&
    businessNameValid &&
    Boolean(addressValid) &&
    agreed &&
    (!TURNSTILE_SITE_KEY || Boolean(captchaToken));

  async function submit() {
    setError(null);
    if (!dobValid) {
      setError("You must be at least 16 years old to use Flipsta.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords don't match.");
      return;
    }
    if (!businessNameValid) {
      setError("Add your business name, or switch to a personal account.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split("@")[0],
          account_type: accountType,
          business_name: accountType === "business" ? businessName : null,
          date_of_birth: dateOfBirth,
          address_line1: addressLine1,
          address_line2: addressLine2 || null,
          city,
          postcode,
          country,
          ...(refCode ? { referral_code: refCode } : {}),
        },
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="card max-w-sm w-full space-y-3 text-center py-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/flippy-mascot.jpg" alt="" className="w-20 mx-auto rounded-2xl" />
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-textDim text-sm">
            Confirm your address to finish signing up, then head to <a className="underline" href="/login">/login</a>.
            (If you've disabled email confirmation in Supabase Auth settings for testing, you can sign in immediately.)
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onReady={() => setTurnstileReady(true)}
        />
      )}
      <div className="min-h-[70vh] flex items-center justify-center py-6">
        <div className="card w-full max-w-4xl grid md:grid-cols-2 gap-8 p-6 md:p-10">
          {/* Left: mascot + why-join, hidden on small screens so the form gets full width */}
          <div className="hidden md:flex flex-col items-center text-center justify-center space-y-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/flippy-mascot.jpg"
              alt="Flippy, the Flipsta mascot"
              className="w-44 rounded-3xl drop-shadow-[0_0_50px_rgba(242,181,69,0.35)]"
            />
            <h2 className="text-2xl font-extrabold">
              Join the <span className="text-gold">flip</span>.
            </h2>
            <p className="text-textDim text-sm max-w-xs">
              Sell first, source after — no inventory, no risk. Free to join, free to browse.
            </p>
            <ul className="text-xs text-textDim space-y-2 text-left">
              <li>✓ Wishlist items and get matched to your sizes</li>
              <li>✓ Bid on Opportunities with Flippy Coins</li>
              <li>✓ Cross-post a sale to eBay, Depop, Etsy, Whatnot &amp; StockX</li>
              <li>✓ Earn £{REFERRAL_REWARD_GBP.toFixed(2)} for every friend you refer</li>
            </ul>
          </div>

          {/* Right: the form */}
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Create your account</h1>
            {refCode && (
              <p className="text-xs text-gold bg-gold/10 border border-gold/40 rounded-lg px-3 py-2">
                You were referred with code <span className="font-bold">{refCode}</span> — you&apos;ll both get £
                {REFERRAL_REWARD_GBP.toFixed(2)} in your wallets once you sign up.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Display name</label>
                <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Email</label>
                <input type="email" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Password</label>
                <input type="password" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Confirm password</label>
                <input type="password" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Date of birth</label>
                <input
                  type="date"
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
                {dateOfBirth && !dobValid && (
                  <p className="text-red text-xs mt-1">You must be at least 16 years old to use Flipsta.</p>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Flipping as</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType("personal")}
                    className={`btn ${accountType === "personal" ? "btn-primary" : "btn-ghost"} text-sm`}
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("business")}
                    className={`btn ${accountType === "business" ? "btn-primary" : "btn-ghost"} text-sm`}
                  >
                    Business
                  </button>
                </div>
              </div>
              {accountType === "business" && (
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Business name</label>
                  <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Address line 1</label>
                <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Address line 2 <span className="opacity-60">(optional)</span></label>
                <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">City</label>
                <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Postcode</label>
                <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Country</label>
                <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs text-textDim">
              <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I confirm I'm at least 16 years old and agree to Flipsta's Terms &amp; Conditions.</span>
            </label>

            {TURNSTILE_SITE_KEY && <div ref={turnstileRef} />}

            {error && <p className="text-red text-sm">{error}</p>}
            <button className="btn btn-primary w-full" disabled={!canSubmit} onClick={submit}>
              Sign up
            </button>
            <p className="text-xs text-textDim">
              Already have an account? <a className="underline" href="/login">Sign in</a>
            </p>
            <SocialAuthButtons refCode={refCode} />
          </div>
        </div>
      </div>
    </>
  );
}

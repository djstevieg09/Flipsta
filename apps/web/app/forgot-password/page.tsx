"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * "Someone should be coming to us to reset a password" — this is that:
 * a real, self-serve forgot-password flow using Supabase Auth's own
 * recovery email, not a support ticket. Paired with /reset-password.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="max-w-sm space-y-2">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-textDim text-sm">
          If an account exists for {email}, a password reset link is on its way. It'll bring you back here to set a
          new password.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="text-textDim text-sm">Enter the email on your account and we'll send a reset link.</p>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Email</label>
        <input type="email" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="text-red text-sm">{error}</p>}
      <button className="btn btn-primary" disabled={!email} onClick={submit}>
        Send reset link
      </button>
      <p className="text-xs text-textDim">
        Remembered it? <a className="underline" href="/login">Sign in</a>
      </p>
    </div>
  );
}

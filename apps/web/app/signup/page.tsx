"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * There was previously no way for a real user to create an account through
 * the UI at all — this and /login are the minimum needed to actually test
 * the app end to end. Profile creation itself happens via the
 * `on_auth_user_created` trigger (0004_auth_profile_trigger.sql), not here.
 */
export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split("@")[0] } },
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
      <div className="max-w-sm space-y-2">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-textDim text-sm">
          Confirm your address to finish signing up, then head to <a className="underline" href="/login">/login</a>.
          (If you've disabled email confirmation in Supabase Auth settings for testing, you can sign in immediately.)
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Display name</label>
        <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Email</label>
        <input type="email" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Password</label>
        <input type="password" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-red text-sm">{error}</p>}
      <button className="btn btn-primary" disabled={!email || !password} onClick={submit}>
        Sign up
      </button>
      <p className="text-xs text-textDim">
        Already have an account? <a className="underline" href="/login">Sign in</a>
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Landed on from the email link /forgot-password sends. Supabase's browser
 * client auto-detects the recovery token in the URL and opens a temporary
 * session for exactly this — updateUser({ password }) is what actually
 * changes it.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also handles the case where the event already fired before this mounted.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <div className="max-w-sm space-y-2">
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p className="text-textDim text-sm">Redirecting you to sign in…</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="max-w-sm space-y-2">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="text-textDim text-sm">
          Open this page from the link in your reset email — it needs that link's token to work.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">New password</label>
        <input type="password" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-red text-sm">{error}</p>}
      <button className="btn btn-primary" disabled={password.length < 6} onClick={submit}>
        Update password
      </button>
    </div>
  );
}

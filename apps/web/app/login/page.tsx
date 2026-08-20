"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/opportunities");
    router.refresh();
  }

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Email</label>
        <input type="email" className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Password</label>
        <input
          type="password"
          className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      {error && <p className="text-red text-sm">{error}</p>}
      <button className="btn btn-primary" disabled={!email || !password} onClick={submit}>
        Sign in
      </button>
      <p className="text-xs text-textDim">
        No account yet? <a className="underline" href="/signup">Sign up</a> ·{" "}
        <a className="underline" href="/forgot-password">Forgot password?</a>
      </p>
    </div>
  );
}

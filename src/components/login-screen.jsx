"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button, inputCls, Field } from "@/components/ui";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await login(username, password);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-zinc-100 via-zinc-50 to-amber-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-700 text-3xl font-black text-white shadow-lg dark:from-white dark:to-zinc-200 dark:text-zinc-900">
            C
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to your ChocERP account to continue.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-5 rounded-2xl border border-zinc-200 bg-white/90 p-7 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80"
        >
          {error && (
            <div className="rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <Field label="Username">
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-zinc-400 dark:text-zinc-600">
          ChocERP · Chocolate production &amp; inventory management
        </p>
      </div>
    </div>
  );
}
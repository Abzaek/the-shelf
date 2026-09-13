"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useLibrary } from "@/components/library-provider";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const search = useSearchParams();
  const { refreshSession } = useLibrary();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await authClient.login(email, password);
      else await authClient.register(email, password, displayName);
      await refreshSession();
      const next = search.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      toast.success(mode === "login" ? "Welcome back" : "Your shelf is ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-[32px] font-medium leading-none tracking-tight">
          {mode === "login" ? "Open your shelf" : "Start a shelf"}
        </h1>
        <p className="mt-3 font-serif text-[16px] italic text-muted-foreground">
          {mode === "login" ? "“Pick up where you left off.”" : "“A private library for the books you own.”"}
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {mode === "register" && (
          <div className="grid gap-1.5">
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How should we greet you?" />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && <p className="text-[12px] text-muted-foreground">At least 10 characters.</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy || !email || !password} className="mt-1">
          {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have a shelf?{" "}
            <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function PasswordResetForm({ mode }: { mode: "request" | "reset" }) {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "request") {
        await authClient.requestPasswordReset(email);
        setSent(true);
      } else {
        if (!token) throw new Error("This reset link is missing. Request a new one.");
        if (password !== confirmPassword) throw new Error("The passwords don't match.");
        await authClient.resetPassword(token, password);
        toast.success("Password updated", { description: "Sign in with your new password." });
        router.replace("/login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-[32px] font-medium leading-none tracking-tight">
          {mode === "request" ? "Reset your password" : "Choose a new password"}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          {mode === "request"
            ? sent
              ? "If an account exists for that email, a reset link will arrive shortly."
              : "Enter the email address on your account and we'll send a reset link."
            : "Choose a new password for your Shelf account."}
        </p>
      </div>
      {!(mode === "request" && sent) && (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {mode === "request" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} />
                <p className="text-[12px] text-muted-foreground">At least 10 characters.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" required minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" disabled={busy || (mode === "request" ? !email : !token || !password || !confirmPassword)}>
            {busy ? "One moment…" : mode === "request" ? "Send reset link" : "Update password"}
          </Button>
        </form>
      )}
      {mode === "reset" && !token && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">This reset link is missing. Request a new one.</p>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}

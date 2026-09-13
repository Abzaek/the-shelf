"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useLibrary } from "@/components/library-provider";

type State = "checking" | "verified" | "invalid" | "waiting";

export function VerifyEmail() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token");
  const { user, refreshSession, signOut } = useLibrary();
  const [state, setState] = useState<State>(token ? "checking" : "waiting");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    authClient
      .verifyEmail(token)
      .then(async () => {
        setState("verified");
        await refreshSession();
        toast.success("Email confirmed");
        setTimeout(() => router.replace("/"), 900);
      })
      .catch((err: Error) => {
        setError(err.message);
        setState("invalid");
      });
  }, [token, refreshSession, router]);

  const resend = async () => {
    setSending(true);
    try {
      await authClient.resendVerification();
      toast.success("Email sent", { description: "Check your inbox and spam folder." });
    } catch (err) {
      toast.error("Could not send", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full max-w-sm text-center">
      {state === "verified" ? (
        <MailCheck className="mx-auto mb-6 size-8 text-brass" strokeWidth={1.5} aria-hidden />
      ) : (
        <MailWarning className="mx-auto mb-6 size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      )}
      <h1 className="font-serif text-[30px] font-medium leading-tight tracking-tight">
        {state === "checking" && "Confirming your email…"}
        {state === "verified" && "You're in."}
        {state === "invalid" && "That link didn't work."}
        {state === "waiting" && "Check your inbox."}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        {state === "verified" && "Opening your shelf."}
        {state === "invalid" && (error ?? "The link is invalid or has expired.")}
        {state === "waiting" && (
          <>
            We sent a confirmation link to <span className="text-foreground">{user?.email ?? "your email"}</span>. Open it to start your shelf.
          </>
        )}
      </p>
      {(state === "waiting" || state === "invalid") && user && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <Button onClick={resend} disabled={sending}>
            {sending ? "Sending…" : "Send the email again"}
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => void signOut()}>
            Use a different account
          </Button>
        </div>
      )}
      {state === "invalid" && !user && (
        <Button className="mt-8" onClick={() => router.replace("/login")}>
          Sign in
        </Button>
      )}
    </div>
  );
}

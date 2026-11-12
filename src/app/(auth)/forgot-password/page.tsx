import { Suspense } from "react";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <PasswordResetForm mode="request" />
    </Suspense>
  );
}

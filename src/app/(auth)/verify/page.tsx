import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth/verify-email";

export const metadata = { title: "Verify your email" };

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { RegistrationComplete } from "@/components/auth/RegistrationComplete";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Completing your registration",
  robots: { index: false, follow: false },
};

export default function RegistrationCompletePage() {
  return (
    <Suspense fallback={<LoadingState label="Checking your payment" />}>
      <RegistrationComplete />
    </Suspense>
  );
}

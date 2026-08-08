import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Join RentFinder as a tenant to find your next home, or as a landlord to list your property.",
  robots: { index: true, follow: true },
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RegisterForm />
    </Suspense>
  );
}

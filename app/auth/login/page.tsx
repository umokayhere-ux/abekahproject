import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your RentFinder account to manage rentals, bookings, and payments.",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}

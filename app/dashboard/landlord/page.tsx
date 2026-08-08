import type { Metadata } from "next";
import { Suspense } from "react";
import { LandlordDashboard } from "@/components/dashboard/landlord/LandlordDashboard";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Landlord dashboard",
  robots: { index: false, follow: false },
};

export default function LandlordDashboardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your dashboard" />}>
      <LandlordDashboard />
    </Suspense>
  );
}

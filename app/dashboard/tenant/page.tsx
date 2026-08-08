import type { Metadata } from "next";
import { Suspense } from "react";
import { TenantDashboard } from "@/components/dashboard/tenant/TenantDashboard";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Tenant dashboard",
  robots: { index: false, follow: false },
};

export default function TenantDashboardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your dashboard" />}>
      <TenantDashboard />
    </Suspense>
  );
}

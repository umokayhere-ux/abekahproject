import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/dashboard/admin/AdminDashboard";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Admin dashboard",
  robots: { index: false, follow: false },
};

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading the admin dashboard" />}>
      <AdminDashboard />
    </Suspense>
  );
}

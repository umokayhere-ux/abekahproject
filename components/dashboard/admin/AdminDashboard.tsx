"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Building2,
  CalendarCheck,
  CreditCard,
  LayoutDashboard,
  ShieldAlert,
  Users,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { useRequireRole } from "@/hooks/useAuth";
import { useApiResource } from "@/hooks/useApiResource";
import { AdminOverview } from "./AdminOverview";
import { AdminProperties } from "./AdminProperties";
import { AdminUsers } from "./AdminUsers";
import { AdminBookings } from "./AdminBookings";
import { AdminPayments } from "./AdminPayments";
import { AdminVerifications } from "./AdminVerifications";
import { AdminActivity } from "./AdminActivity";
import { DangerZone } from "./DangerZone";
import type { PaymentDTO, PropertyDTO, SafeUser } from "@/types";

export interface AdminStats {
  users: {
    total: number;
    tenants: number;
    landlords: number;
    admins: number;
    suspended: number;
  };
  properties: { total: number; verified: number; pendingVerification: number };
  verifications: { pendingLandlords: number };
  bookings: { total: number; confirmed: number; pending: number };
  payments: {
    total: number;
    settled: number;
    grossVolume: number;
    platformCommission: number;
    landlordPayouts: number;
  };
  recentUsers: SafeUser[];
  recentProperties: PropertyDTO[];
  recentPayments: PaymentDTO[];
}

const TABS = [
  "overview",
  "properties",
  "users",
  "bookings",
  "payments",
  "verifications",
  "activity",
  "danger",
] as const;
type Tab = (typeof TABS)[number];

export function AdminDashboard() {
  const { user, ready } = useRequireRole("admin");
  const router = useRouter();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const activeTab: Tab = TABS.includes(requested as Tab)
    ? (requested as Tab)
    : "overview";

  // Skipped until the role guard confirms access, so an unauthorised
  // visitor never issues the request at all.
  const { data: stats, refetch: loadStats } = useApiResource<AdminStats>(
    ready ? "/api/admin/stats" : null,
  );

  const setTab = (tab: string) => {
    router.replace(`/dashboard/admin?tab=${tab}`, { scroll: false });
  };

  const pendingVerifications =
    (stats?.verifications.pendingLandlords ?? 0) +
    (stats?.properties.pendingVerification ?? 0);

  const items: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "properties", label: "Properties", icon: Building2 },
    { id: "users", label: "Users", icon: Users },
    { id: "bookings", label: "Bookings", icon: CalendarCheck },
    { id: "payments", label: "Payments", icon: CreditCard },
    {
      id: "verifications",
      label: "Verifications",
      icon: BadgeCheck,
      badge: pendingVerifications,
    },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "danger", label: "Danger zone", icon: ShieldAlert },
  ];

  return (
    <DashboardShell
      title="Administration"
      subtitle={user?.email}
      items={items}
      activeId={activeTab}
      onSelect={setTab}
      variant="admin"
      ready={ready}
    >
      {activeTab === "overview" && (
        <AdminOverview stats={stats} onNavigate={setTab} />
      )}
      {activeTab === "properties" && <AdminProperties onChanged={loadStats} />}
      {activeTab === "users" && <AdminUsers onChanged={loadStats} />}
      {activeTab === "bookings" && <AdminBookings />}
      {activeTab === "payments" && <AdminPayments />}
      {activeTab === "verifications" && (
        <AdminVerifications onChanged={loadStats} />
      )}
      {activeTab === "activity" && <AdminActivity />}
      {activeTab === "danger" && <DangerZone onReset={loadStats} />}
    </DashboardShell>
  );
}

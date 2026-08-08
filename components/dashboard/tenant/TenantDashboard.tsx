"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  CreditCard,
  Heart,
  LayoutDashboard,
  MessageSquare,
  UserCog,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { useRequireRole } from "@/hooks/useAuth";
import { useApiResource } from "@/hooks/useApiResource";
import { TenantOverview } from "./TenantOverview";
import { SavedProperties } from "./SavedProperties";
import { TenantBookings } from "./TenantBookings";
import { PaymentHistory } from "./PaymentHistory";
import { MessagesPanel } from "@/components/dashboard/MessagesPanel";
import { ProfilePanel } from "@/components/dashboard/ProfilePanel";

export interface TenantStats {
  currentBooking: import("@/types").BookingDTO | null;
  pendingBookings: number;
  savedProperties: number;
  unreadMessages: number;
  totalPaid: number;
  recentPayments: import("@/types").PaymentDTO[];
}

const TABS = [
  "overview",
  "saved",
  "bookings",
  "messages",
  "payments",
  "profile",
] as const;
type Tab = (typeof TABS)[number];

export function TenantDashboard() {
  const { user, ready } = useRequireRole("tenant");
  const router = useRouter();
  const searchParams = useSearchParams();

  // The active section lives in the URL so it survives a refresh and can be
  // linked to directly (the Paystack callback returns to ?tab=payments).
  const requested = searchParams.get("tab");
  const activeTab: Tab = TABS.includes(requested as Tab)
    ? (requested as Tab)
    : "overview";

  // Skipped until the role guard confirms access, so an unauthorised
  // visitor never issues the request at all.
  const { data: stats, refetch: loadStats } = useApiResource<TenantStats>(
    ready ? "/api/tenant/stats" : null,
  );

  const setTab = (tab: string) => {
    router.replace(`/dashboard/tenant?tab=${tab}`, { scroll: false });
  };

  const items: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    {
      id: "saved",
      label: "Saved properties",
      icon: Heart,
      badge: stats?.savedProperties,
    },
    { id: "bookings", label: "My bookings", icon: CalendarCheck },
    {
      id: "messages",
      label: "Messages",
      icon: MessageSquare,
      badge: stats?.unreadMessages,
    },
    { id: "payments", label: "Payment history", icon: CreditCard },
    { id: "profile", label: "Profile", icon: UserCog },
  ];

  return (
    <DashboardShell
      title="Tenant dashboard"
      subtitle={user?.email}
      items={items}
      activeId={activeTab}
      onSelect={setTab}
      ready={ready}
    >
      {activeTab === "overview" && (
        <TenantOverview stats={stats} onNavigate={setTab} onRefresh={loadStats} />
      )}
      {activeTab === "saved" && <SavedProperties onChanged={loadStats} />}
      {activeTab === "bookings" && <TenantBookings onChanged={loadStats} />}
      {activeTab === "messages" && <MessagesPanel onChanged={loadStats} />}
      {activeTab === "payments" && <PaymentHistory />}
      {activeTab === "profile" && <ProfilePanel />}
    </DashboardShell>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  LayoutDashboard,
  MessageSquare,
  UserCog,
  Wallet,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { useRequireRole } from "@/hooks/useAuth";
import { useApiResource } from "@/hooks/useApiResource";
import { LandlordOverview } from "./LandlordOverview";
import { MyProperties } from "./MyProperties";
import { LandlordBookings } from "./LandlordBookings";
import { PayoutSetup } from "./PayoutSetup";
import { MessagesPanel } from "@/components/dashboard/MessagesPanel";
import { ProfilePanel } from "@/components/dashboard/ProfilePanel";
import type { BookingDTO, PaymentDTO } from "@/types";

export interface LandlordStats {
  totalListings: number;
  availableListings: number;
  verifiedListings: number;
  totalBookings: number;
  pendingBookings: number;
  totalViews: number;
  earnings: number;
  grossCollected: number;
  paymentsReceived: number;
  unreadMessages: number;
  payoutConfigured: boolean;
  recentBookings: BookingDTO[];
  recentPayments: PaymentDTO[];
}

const TABS = [
  "overview",
  "properties",
  "bookings",
  "messages",
  "payouts",
  "profile",
] as const;
type Tab = (typeof TABS)[number];

export function LandlordDashboard() {
  const { user, ready } = useRequireRole("landlord");
  const router = useRouter();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const activeTab: Tab = TABS.includes(requested as Tab)
    ? (requested as Tab)
    : "overview";

  // Skipped until the role guard confirms access, so an unauthorised
  // visitor never issues the request at all.
  const { data: stats, refetch: loadStats } = useApiResource<LandlordStats>(
    ready ? "/api/landlord/stats" : null,
  );

  const setTab = (tab: string) => {
    router.replace(`/dashboard/landlord?tab=${tab}`, { scroll: false });
  };

  const items: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    {
      id: "properties",
      label: "My properties",
      icon: Building2,
      badge: stats?.totalListings,
    },
    {
      id: "bookings",
      label: "Bookings",
      icon: CalendarCheck,
      badge: stats?.pendingBookings,
    },
    {
      id: "messages",
      label: "Messages",
      icon: MessageSquare,
      badge: stats?.unreadMessages,
    },
    { id: "payouts", label: "Get paid", icon: Wallet },
    { id: "profile", label: "Profile", icon: UserCog },
  ];

  return (
    <DashboardShell
      title="Landlord dashboard"
      subtitle={user?.email}
      items={items}
      activeId={activeTab}
      onSelect={setTab}
      ready={ready}
    >
      {activeTab === "overview" && (
        <LandlordOverview stats={stats} onNavigate={setTab} />
      )}
      {activeTab === "properties" && <MyProperties onChanged={loadStats} />}
      {activeTab === "bookings" && <LandlordBookings onChanged={loadStats} />}
      {activeTab === "messages" && <MessagesPanel onChanged={loadStats} />}
      {activeTab === "payouts" && <PayoutSetup onConfigured={loadStats} />}
      {activeTab === "profile" && <ProfilePanel />}
    </DashboardShell>
  );
}

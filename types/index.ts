/**
 * Shared domain types. These mirror the Mongoose schemas but describe the
 * JSON-serialised shapes that cross the network boundary, so every `_id`
 * is a string and every date is an ISO string.
 */

export const ROLES = ["tenant", "landlord", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Roles the public registration endpoint is allowed to create. */
export const PUBLIC_ROLES = ["tenant", "landlord"] as const;
export type PublicRole = (typeof PUBLIC_ROLES)[number];

export const PROPERTY_TYPES = ["apartment", "room", "house", "studio"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_STATUSES = ["available", "rented"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const RESET_SCOPES = [
  "properties",
  "bookings",
  "tenants",
  "landlords",
  "full",
] as const;
export type ResetScope = (typeof RESET_SCOPES)[number];

/** The only user shape ever sent to a client. Never contains `password`. */
export interface SafeUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatar?: string;
  bio?: string;
  verified: boolean;
  suspended: boolean;
  favorites?: string[];
  /** Presence only — the raw subaccount code is not needed by the browser. */
  hasPayoutAccount?: boolean;
  bankName?: string;
  /** Masked to the last 4 digits. */
  bankAccountLast4?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GeoPoint {
  lat?: number;
  lng?: number;
}

export interface PropertyLocation {
  city: string;
  state: string;
  address: string;
  geo?: GeoPoint;
}

export interface PropertyDTO {
  _id: string;
  title: string;
  description: string;
  price: number;
  type: PropertyType;
  bedrooms: number;
  bathrooms: number;
  location: PropertyLocation;
  images: string[];
  amenities: string[];
  landlord: string | SafeUser;
  verified: boolean;
  status: PropertyStatus;
  views?: number;
  ratingAverage?: number;
  ratingCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BookingDTO {
  _id: string;
  tenant: string | SafeUser;
  property: string | PropertyDTO;
  landlord: string | SafeUser;
  status: BookingStatus;
  moveInDate: string;
  amount?: number;
  paymentStatus?: PaymentStatus | "unpaid";
  createdAt?: string;
  updatedAt?: string;
}

export interface SplitBreakdown {
  /** Total the tenant is charged, in GHS. */
  total: number;
  /** Platform commission in GHS. */
  platform: number;
  /** Landlord's share in GHS. */
  landlord: number;
  /** Commission percentage applied, e.g. 10. */
  commissionPercent: number;
  rent: number;
  deposit: number;
}

export interface PaymentDTO {
  _id: string;
  tenant: string | SafeUser;
  landlord: string | SafeUser;
  property: string | PropertyDTO;
  booking?: string | BookingDTO;
  amount: number;
  currency: "GHS";
  status: PaymentStatus;
  reference: string;
  splitBreakdown?: SplitBreakdown;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationDTO {
  _id: string;
  participants: SafeUser[];
  property?: string | PropertyDTO;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageDTO {
  _id: string;
  conversation: string;
  sender: string | SafeUser;
  text: string;
  read: boolean;
  createdAt?: string;
}

export interface ReviewDTO {
  _id: string;
  property: string | PropertyDTO;
  author: string | SafeUser;
  rating: number;
  comment: string;
  createdAt?: string;
}

export interface ActivityDTO {
  _id: string;
  action: string;
  actor?: string | SafeUser;
  actorEmail?: string;
  actorRole?: Role;
  targetType?: string;
  targetId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt?: string;
}

/** Uniform API envelope used by every route handler. */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string; errors?: Record<string, string> };

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

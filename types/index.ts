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

/**
 * What a payment is for. Rent splits to the landlord's subaccount; the
 * registration fee goes entirely to the platform.
 */
export const PAYMENT_PURPOSES = ["rent", "registration_fee"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/**
 * Whether an account may sign in.
 *
 * Landlords are created `pending` after paying and must be approved by an
 * administrator. Everyone else defaults to `approved`, so the gate applies
 * only where it is meant to — and existing accounts are never locked out.
 */
export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** How a landlord receives their money. */
export const PAYOUT_CHANNELS = ["bank", "mobile_money"] as const;
export type PayoutChannel = (typeof PAYOUT_CHANNELS)[number];

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
  /** Whether payouts settle to a bank account or a mobile money wallet. */
  payoutChannel?: PayoutChannel;
  /** Landlords only: whether the one-off listing fee has been paid. */
  registrationFeePaid?: boolean;
  /** Whether an administrator has approved this account to sign in. */
  approvalStatus?: ApprovalStatus;
  /** Provider name: a bank, or a wallet such as "MTN Mobile Money". */
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
  /** The payer. For a registration fee this is the landlord themselves. */
  tenant: string | SafeUser;
  landlord: string | SafeUser;
  /** Absent for a registration fee, which is not tied to a listing. */
  property?: string | PropertyDTO;
  booking?: string | BookingDTO;
  amount: number;
  currency: "GHS";
  status: PaymentStatus;
  purpose?: PaymentPurpose;
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

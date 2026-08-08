import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";
import { User } from "@/models/User";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Payment } from "@/models/Payment";
import { Conversation } from "@/models/Conversation";
import { Message } from "@/models/Message";
import { Review } from "@/models/Review";
import { Activity } from "@/models/Activity";
import type {
  ApiResponse,
  PropertyStatus,
  PropertyType,
  Role,
} from "@/types";

/** Empties every collection between tests so each starts from a clean slate. */
export async function resetDatabase(): Promise<void> {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Property.deleteMany({}),
    Booking.deleteMany({}),
    Payment.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Review.deleteMany({}),
    Activity.deleteMany({}),
  ]);
}

/** Ensures unique/partial indexes exist, since some tests depend on them. */
export async function syncIndexes(): Promise<void> {
  await connectDB();
  await Promise.all([
    User.syncIndexes(),
    Property.syncIndexes(),
    Booking.syncIndexes(),
    Payment.syncIndexes(),
    Review.syncIndexes(),
  ]);
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  role: Role;
}

/** Creates a user directly in the database and returns a signed token for it. */
export async function createUser(
  overrides: {
    role?: Role;
    email?: string;
    name?: string;
    password?: string;
    verified?: boolean;
    suspended?: boolean;
    paystackSubaccount?: string;
  } = {},
): Promise<TestUser> {
  await connectDB();

  const role = overrides.role ?? "tenant";
  const email =
    overrides.email ?? `${role}-${new mongoose.Types.ObjectId()}@test.local`;

  const user = await User.create({
    name: overrides.name ?? `Test ${role}`,
    email,
    password: await hashPassword(overrides.password ?? "Password123"),
    role,
    verified: overrides.verified ?? false,
    suspended: overrides.suspended ?? false,
    paystackSubaccount: overrides.paystackSubaccount,
  });

  return {
    id: user._id.toString(),
    email: user.email,
    role,
    token: await signToken({
      sub: user._id.toString(),
      email: user.email,
      role,
    }),
  };
}

/** Creates a listing owned by the given landlord. */
export async function createProperty(
  landlordId: string,
  overrides: Partial<{
    title: string;
    price: number;
    city: string;
    type: PropertyType;
    bedrooms: number;
    verified: boolean;
    status: PropertyStatus;
  }> = {},
) {
  await connectDB();
  return Property.create({
    title: overrides.title ?? "A comfortable test apartment in Accra",
    description:
      "A perfectly reasonable description that is comfortably longer than the twenty character minimum.",
    price: overrides.price ?? 1000,
    type: overrides.type ?? "apartment",
    bedrooms: overrides.bedrooms ?? 2,
    bathrooms: 1,
    location: {
      city: overrides.city ?? "Accra",
      state: "Greater Accra",
      address: "1 Test Street, Accra",
    },
    images: [],
    amenities: [],
    landlord: landlordId,
    verified: overrides.verified ?? false,
    status: overrides.status ?? "available",
  });
}

/** Builds a Request the route handlers can consume. */
export function makeRequest(
  url: string,
  {
    method = "GET",
    token,
    body,
    headers = {},
  }: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Request {
  const finalHeaders: Record<string, string> = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";

  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Reads a route handler's response into its status and parsed envelope. */
export async function readResponse<T = unknown>(
  response: Response,
): Promise<{ status: number; body: ApiResponse<T> }> {
  return {
    status: response.status,
    body: (await response.json()) as ApiResponse<T>,
  };
}

/** Narrows a response body to its success payload, failing loudly otherwise. */
export function expectData<T>(body: ApiResponse<T>): T {
  if (!body.success) {
    throw new Error(`Expected a success response, got: ${body.message}`);
  }
  return body.data;
}

/**
 * Route params arrive as a promise in Next 16. Generic over the key names so
 * the object matches each handler's specific `Params` type.
 */
export const params = <T extends Record<string, string>>(values: T) => ({
  params: Promise.resolve(values),
});

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { connectDB } from "./db";
import { HttpError } from "./api";
import { User, type UserDoc } from "@/models/User";
import type { Role, SafeUser } from "@/types";

/** bcrypt cost factor. 12 is the project standard. */
export const BCRYPT_ROUNDS = 12;

/** Tokens are valid for 30 days. */
export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const ISSUER = "rentfinder";
const AUDIENCE = "rentfinder-app";

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.jwtSecret);
}

/**
 * Fails immediately if the signing secret is absent or too short.
 *
 * Call this *before* any database write in a handler that will later issue a
 * token. Registration otherwise creates the account, then throws while signing
 * — leaving an orphaned user whose owner was told sign-up failed, and who then
 * hits "email already exists" when they retry.
 *
 * Reading the getter is the check: it throws `ConfigError`, which the API layer
 * turns into an actionable 503.
 */
export function assertAuthConfigured(): void {
  void env.jwtSecret;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the payload, or null when the token is absent/expired/tampered. */
export async function verifyToken(
  token: string | undefined | null,
): Promise<TokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Pulls the bearer token from the Authorization header or the rf_token cookie. */
export function extractToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim() || undefined;
  }
  // Cookie fallback keeps server-rendered requests working.
  const cookie = request.headers.get("cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "rf_token") return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

/** Strips every sensitive field. This is the only user shape sent to clients. */
export function toSafeUser(user: UserDoc): SafeUser {
  const accountNumber = user.bankAccountNumber;
  return {
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? "",
    avatar: user.avatar ?? "",
    bio: user.bio ?? "",
    verified: Boolean(user.verified),
    suspended: Boolean(user.suspended),
    favorites: (user.favorites ?? []).map((id) => id.toString()),
    hasPayoutAccount: Boolean(user.paystackSubaccount),
    payoutChannel: user.payoutChannel,
    registrationFeePaid: Boolean(user.registrationFeePaid),
    bankName: user.bankName ?? "",
    bankAccountLast4: accountNumber ? accountNumber.slice(-4) : undefined,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

export interface AuthContext {
  user: UserDoc;
  safeUser: SafeUser;
  role: Role;
  userId: string;
}

/**
 * Authenticates a request. Verifies the JWT signature, then re-loads the user
 * so a token cannot outlive a deletion or a suspension.
 */
export async function authenticate(request: Request): Promise<AuthContext> {
  const payload = await verifyToken(extractToken(request));
  if (!payload) {
    throw new HttpError(401, "You must be signed in to do that");
  }

  await connectDB();
  const user = await User.findById(payload.sub);
  if (!user) {
    throw new HttpError(401, "Your account no longer exists");
  }
  if (user.suspended) {
    throw new HttpError(403, "Your account has been suspended");
  }
  // The DB is authoritative: a stale token cannot claim an elevated role.
  if (user.role !== payload.role) {
    throw new HttpError(401, "Your session is out of date. Please sign in again.");
  }

  return {
    user,
    safeUser: toSafeUser(user),
    role: user.role,
    userId: user._id.toString(),
  };
}

/** Authenticates and requires one of the given roles. */
export async function requireRole(
  request: Request,
  ...roles: Role[]
): Promise<AuthContext> {
  const auth = await authenticate(request);
  if (!roles.includes(auth.role)) {
    throw new HttpError(403, "You do not have permission to do that");
  }
  return auth;
}

export const requireAdmin = (request: Request) => requireRole(request, "admin");
export const requireLandlord = (request: Request) =>
  requireRole(request, "landlord");
export const requireTenant = (request: Request) => requireRole(request, "tenant");

/** Authenticates if a token is present, otherwise resolves to null. */
export async function optionalAuth(
  request: Request,
): Promise<AuthContext | null> {
  try {
    return await authenticate(request);
  } catch {
    return null;
  }
}

/**
 * Ownership guard. Admins bypass it; everyone else must own the resource.
 * Never trust an id from the client — always compare against the loaded doc.
 */
export function assertOwnership(
  auth: AuthContext,
  ownerId: { toString(): string },
  message = "You do not have access to this resource",
): void {
  if (auth.role === "admin") return;
  if (ownerId.toString() !== auth.userId) {
    throw new HttpError(403, message);
  }
}

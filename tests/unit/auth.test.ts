import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  approvalBlockReason,
  BCRYPT_ROUNDS,
  TOKEN_TTL_SECONDS,
  extractToken,
  hashPassword,
  signToken,
  toSafeUser,
  verifyPassword,
  verifyToken,
} from "@/lib/auth";
import type { UserDoc } from "@/models/User";

describe("password hashing", () => {
  it("uses bcrypt at cost 12", async () => {
    expect(BCRYPT_ROUNDS).toBe(12);

    const hash = await hashPassword("Password123");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("never stores the plaintext", async () => {
    const hash = await hashPassword("Password123");
    expect(hash).not.toContain("Password123");
  });

  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Password123");

    expect(await verifyPassword("Password123", hash)).toBe(true);
    expect(await verifyPassword("password123", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("produces a different hash each time, thanks to the salt", async () => {
    const [first, second] = await Promise.all([
      hashPassword("Password123"),
      hashPassword("Password123"),
    ]);

    expect(first).not.toBe(second);
    // Both still verify.
    expect(await verifyPassword("Password123", first)).toBe(true);
    expect(await verifyPassword("Password123", second)).toBe(true);
  });
});

describe("JWT signing and verification", () => {
  const payload = {
    sub: "507f1f77bcf86cd799439011",
    email: "ama@example.com",
    role: "tenant" as const,
  };

  it("round-trips a token", async () => {
    const verified = await verifyToken(await signToken(payload));

    expect(verified?.sub).toBe(payload.sub);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.role).toBe("tenant");
  });

  it("expires after 30 days", async () => {
    expect(TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60);

    const token = await signToken(payload);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString(),
    ) as { exp: number; iat: number };

    expect(claims.exp - claims.iat).toBe(TOKEN_TTL_SECONDS);
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await new SignJWT({ email: payload.email, role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setIssuer("rentfinder")
      .setAudience("rentfinder-app")
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode("an-attacker-supplied-secret-value!!!!"));

    expect(await verifyToken(forged)).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signToken(payload);
    const [header, body, signature] = token.split(".");

    // Re-encode the claims with an elevated role, keeping the old signature.
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString());
    claims.role = "admin";
    const forgedBody = Buffer.from(JSON.stringify(claims)).toString("base64url");

    expect(await verifyToken(`${header}.${forgedBody}.${signature}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({ email: payload.email, role: "tenant" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer("rentfinder")
      .setAudience("rentfinder-app")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    expect(await verifyToken(expired)).toBeNull();
  });

  it("rejects a token with the wrong issuer or audience", async () => {
    const wrongIssuer = await new SignJWT({ email: payload.email, role: "tenant" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setIssuer("somewhere-else")
      .setAudience("rentfinder-app")
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    expect(await verifyToken(wrongIssuer)).toBeNull();
  });

  it("rejects empty and malformed tokens", async () => {
    expect(await verifyToken(undefined)).toBeNull();
    expect(await verifyToken(null)).toBeNull();
    expect(await verifyToken("")).toBeNull();
    expect(await verifyToken("not.a.jwt")).toBeNull();
  });
});

describe("extractToken", () => {
  it("reads a bearer token from the Authorization header", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer abc123" },
    });
    expect(extractToken(request)).toBe("abc123");
  });

  it("is case-insensitive about the scheme", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "bearer abc123" },
    });
    expect(extractToken(request)).toBe("abc123");
  });

  it("falls back to the rf_token cookie", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { Cookie: "other=1; rf_token=cookie-token; another=2" },
    });
    expect(extractToken(request)).toBe("cookie-token");
  });

  it("returns undefined when there is no token", () => {
    expect(extractToken(new Request("http://localhost/api/test"))).toBeUndefined();

    const emptyBearer = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer " },
    });
    expect(extractToken(emptyBearer)).toBeUndefined();
  });
});

describe("toSafeUser", () => {
  /** A document shaped like the one Mongoose would hand back. */
  const doc = {
    _id: { toString: () => "507f1f77bcf86cd799439011" },
    name: "Kwame Asante",
    email: "kwame@example.com",
    password: "$2b$12$aVeryRealLookingBcryptHashValue",
    role: "landlord",
    phone: "+233244123456",
    avatar: "",
    bio: "",
    verified: true,
    suspended: false,
    favorites: [],
    paystackSubaccount: "ACCT_secret123",
    bankName: "Test Bank",
    bankCode: "058",
    bankAccountNumber: "0123456789",
    bankAccountName: "Kwame Asante",
    resetTokenHash: "abc123def456",
    resetTokenExpiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as UserDoc;

  it("strips every sensitive field", () => {
    const serialised = JSON.stringify(toSafeUser(doc));

    // The three things that must never cross the network boundary.
    expect(serialised).not.toContain("$2b$12$");
    expect(serialised).not.toContain("ACCT_secret123");
    expect(serialised).not.toContain("abc123def456");
    // Nor the full bank account number.
    expect(serialised).not.toContain("0123456789");
  });

  it("exposes payout status without the subaccount code", () => {
    const safe = toSafeUser(doc);

    expect(safe.hasPayoutAccount).toBe(true);
    expect(safe).not.toHaveProperty("paystackSubaccount");
    // Only the last four digits, enough to recognise the account.
    expect(safe.bankAccountLast4).toBe("6789");
  });

  it("keeps the fields a client legitimately needs", () => {
    const safe = toSafeUser(doc);

    expect(safe._id).toBe("507f1f77bcf86cd799439011");
    expect(safe.name).toBe("Kwame Asante");
    expect(safe.email).toBe("kwame@example.com");
    expect(safe.role).toBe("landlord");
    expect(safe.verified).toBe(true);
    expect(safe.suspended).toBe(false);
  });
});

describe("approvalBlockReason", () => {
  it("lets an approved landlord through", () => {
    expect(
      approvalBlockReason({ role: "landlord", approvalStatus: "approved" }),
    ).toBeNull();
  });

  it("blocks a landlord awaiting a decision", () => {
    const reason = approvalBlockReason({
      role: "landlord",
      approvalStatus: "pending",
    });
    expect(reason).toMatch(/awaiting approval/i);
  });

  it("blocks a rejected landlord with a different message", () => {
    const reason = approvalBlockReason({
      role: "landlord",
      approvalStatus: "rejected",
    });
    expect(reason).toMatch(/not approved/i);
    expect(reason).not.toMatch(/awaiting/i);
  });

  it("never gates tenants or admins", () => {
    for (const role of ["tenant", "admin"] as const) {
      expect(approvalBlockReason({ role, approvalStatus: "pending" })).toBeNull();
    }
  });

  it("lets accounts predating the gate sign in", () => {
    // No approvalStatus at all — an existing landlord must not be locked out.
    expect(approvalBlockReason({ role: "landlord" })).toBeNull();
  });
});

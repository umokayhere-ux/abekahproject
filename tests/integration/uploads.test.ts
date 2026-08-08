import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as upload } from "@/app/api/uploads/route";
import { createUser, readResponse, resetDatabase, syncIndexes } from "../helpers";

/**
 * Upload permissions are decided by *purpose*, not by the caller alone:
 * anyone signed in may set a profile picture, but only landlords and admins
 * may add listing photos.
 */

/** Builds a multipart request carrying a small valid PNG. */
function uploadRequest({
  token,
  purpose,
  fileCount = 1,
}: {
  token?: string;
  purpose?: string;
  fileCount?: number;
}): Request {
  const form = new FormData();
  if (purpose) form.append("purpose", purpose);

  for (let i = 0; i < fileCount; i += 1) {
    form.append(
      "files",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], `photo-${i}.png`, {
        type: "image/png",
      }),
    );
  }

  return new Request("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
}

describe("upload permissions", () => {
  beforeAll(syncIndexes);

  beforeEach(async () => {
    await resetDatabase();
    // Present so the route reaches its permission checks rather than
    // short-circuiting on "uploads not configured".
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    vi.restoreAllMocks();
  });

  it("rejects an unauthenticated upload", async () => {
    const { status } = await readResponse(
      await upload(uploadRequest({ purpose: "avatar" })),
    );
    expect(status).toBe(401);
  });

  it("lets a tenant upload an avatar", async () => {
    const tenant = await createUser({ role: "tenant" });

    const { status } = await readResponse(
      await upload(uploadRequest({ token: tenant.token, purpose: "avatar" })),
    );

    // Reaching Cloudinary is the success signal here — permission passed.
    // A 403 would mean the role check wrongly rejected a tenant.
    expect(status).not.toBe(403);
  });

  it("refuses a tenant uploading listing photos", async () => {
    const tenant = await createUser({ role: "tenant" });

    const { status, body } = await readResponse(
      await upload(uploadRequest({ token: tenant.token, purpose: "property" })),
    );

    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("lets a landlord upload listing photos", async () => {
    const landlord = await createUser({ role: "landlord" });

    const { status } = await readResponse(
      await upload(uploadRequest({ token: landlord.token, purpose: "property" })),
    );

    expect(status).not.toBe(403);
  });

  it("allows only one file for an avatar", async () => {
    const tenant = await createUser({ role: "tenant" });

    const { status, body } = await readResponse(
      await upload(
        uploadRequest({ token: tenant.token, purpose: "avatar", fileCount: 3 }),
      ),
    );

    expect(status).toBe(400);
    if (!body.success) expect(body.message).toContain("one image");
  });

  it("caps listing uploads at twelve files", async () => {
    const landlord = await createUser({ role: "landlord" });

    const { status, body } = await readResponse(
      await upload(
        uploadRequest({ token: landlord.token, purpose: "property", fileCount: 13 }),
      ),
    );

    expect(status).toBe(400);
    if (!body.success) expect(body.message).toContain("at most 12");
  });

  it("rejects an unrecognised purpose", async () => {
    const landlord = await createUser({ role: "landlord" });

    const { status } = await readResponse(
      await upload(uploadRequest({ token: landlord.token, purpose: "anything" })),
    );

    expect(status).toBe(400);
  });

  it("defaults to the listing rules when no purpose is given", async () => {
    // Preserves the behaviour of callers written before `purpose` existed.
    const tenant = await createUser({ role: "tenant" });

    const { status } = await readResponse(
      await upload(uploadRequest({ token: tenant.token })),
    );

    expect(status).toBe(403);
  });

  it("requires at least one file", async () => {
    const landlord = await createUser({ role: "landlord" });

    const { status } = await readResponse(
      await upload(
        uploadRequest({ token: landlord.token, purpose: "property", fileCount: 0 }),
      ),
    );

    expect(status).toBe(400);
  });
});

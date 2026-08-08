import { fail, ok, withErrorHandling } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { uploadImage } from "@/lib/cloudinary";

/**
 * What the upload is for. The two differ in who may upload and how many files
 * are accepted, so the limits are not decided by the caller alone.
 */
const PURPOSES = {
  /** A profile picture. Any signed-in user, one file. */
  avatar: { roles: ["tenant", "landlord", "admin"], maxFiles: 1, folder: "avatars" },
  /** Listing photos. Landlords and admins, up to a full gallery. */
  property: { roles: ["landlord", "admin"], maxFiles: 12, folder: "properties" },
} as const;

type Purpose = keyof typeof PURPOSES;

/**
 * POST /api/uploads
 *
 * Accepts multipart form data and pushes each image to Cloudinary, returning
 * the resulting https URLs. Nothing touches local disk, so this is safe on a
 * serverless platform.
 *
 * Send `purpose` alongside `files`:
 *   - `avatar`   — any signed-in user, one file
 *   - `property` — landlords and admins, up to 12 files (the default)
 *
 * Uploads are foldered by purpose and uploader id, so every asset stays
 * attributable.
 */
export const POST = withErrorHandling(async (request: Request) => {
  // Any signed-in user may reach this; the purpose decides what they may do.
  const auth = await authenticate(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart form upload", 400);
  }

  const requested = String(form.get("purpose") ?? "property");
  if (!(requested in PURPOSES)) {
    return fail(
      `Unknown upload purpose. Expected one of: ${Object.keys(PURPOSES).join(", ")}`,
      400,
    );
  }
  const purpose = PURPOSES[requested as Purpose];

  if (!(purpose.roles as readonly string[]).includes(auth.role)) {
    return fail("You do not have permission to upload that kind of image", 403);
  }

  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return fail("Select at least one image to upload", 400);
  }
  if (files.length > purpose.maxFiles) {
    return fail(
      purpose.maxFiles === 1
        ? "Only one image can be uploaded here"
        : `You can upload at most ${purpose.maxFiles} images at once`,
      400,
    );
  }

  // Uploaded in parallel; a rejection propagates and is translated by the
  // error wrapper into a clean message.
  const uploaded = await Promise.all(
    files.map((file) => uploadImage(file, `${purpose.folder}/${auth.userId}`)),
  );

  return ok({ images: uploaded }, 201);
});

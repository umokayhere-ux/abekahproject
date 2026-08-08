import { fail, ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uploadImage } from "@/lib/cloudinary";

/** Guards against a request trying to upload an unreasonable number of files. */
const MAX_FILES_PER_REQUEST = 12;

/**
 * POST /api/uploads
 *
 * Accepts multipart form data and pushes each image to Cloudinary, returning
 * the resulting https URLs. Nothing is written to local disk, so the route is
 * safe on a serverless platform.
 *
 * Only landlords and admins may upload — the folder is scoped to the uploader's
 * id so assets stay attributable.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord", "admin");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart form upload", 400);
  }

  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return fail("Select at least one image to upload", 400);
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return fail(`You can upload at most ${MAX_FILES_PER_REQUEST} images at once`, 400);
  }

  // Uploaded in parallel; any rejection propagates and is translated by the
  // error wrapper into a clean message.
  const uploaded = await Promise.all(
    files.map((file) => uploadImage(file, auth.userId)),
  );

  return ok({ images: uploaded }, 201);
});

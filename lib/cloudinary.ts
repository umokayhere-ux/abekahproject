import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";
import { HttpError } from "./api";

/**
 * Cloudinary uploads. Server-only.
 *
 * Files go straight to Cloudinary and only the resulting https URL is stored,
 * so nothing depends on local disk and the app stays serverless-safe.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

let configured = false;

function configure(): void {
  const config = env.cloudinary;
  if (!config) {
    throw new HttpError(
      503,
      "Image uploads are not configured on this deployment. Set the CLOUDINARY_* variables.",
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
    configured = true;
  }
}

export function isUploadConfigured(): boolean {
  return Boolean(env.cloudinary);
}

export interface UploadedImage {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
}

/**
 * Uploads one image. `folder` scopes uploads per owner so assets are traceable.
 */
export async function uploadImage(
  file: File,
  folder: string,
): Promise<UploadedImage> {
  configure();

  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    throw new HttpError(
      415,
      "Only JPEG, PNG, WebP, and AVIF images can be uploaded",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new HttpError(413, "Each image must be 5 MB or smaller");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  return new Promise<UploadedImage>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `rentfinder/${folder}`,
        resource_type: "image",
        // Re-encode and cap dimensions so a huge upload cannot bloat pages.
        transformation: [
          { width: 1600, height: 1600, crop: "limit" },
          { quality: "auto", fetch_format: "auto" },
        ],
      },
      (error, result) => {
        if (error || !result) {
          console.error("[cloudinary] upload failed:", error);
          reject(new HttpError(502, "Image upload failed. Please try again."));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });
}

/** Best-effort cleanup; a failure here must not fail the request. */
export async function deleteImage(publicId: string): Promise<void> {
  try {
    configure();
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("[cloudinary] delete failed:", error);
  }
}

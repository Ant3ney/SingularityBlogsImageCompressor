import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

function parseOptionalPositiveInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function isSupportedImageMime(mime: string): boolean {
  // Keep this conservative: SVG is excluded to avoid heavy/unsafe vector parsing.
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/tiff",
    "image/gif",
  ].includes(mime);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return new NextResponse("Missing 'file' field in multipart/form-data.", {
        status: 400,
      });
    }

    if (file.size <= 0) {
      return new NextResponse("Uploaded file is empty.", { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return new NextResponse("File too large (max 25MB).", { status: 413 });
    }

    if (!isSupportedImageMime(file.type)) {
      return new NextResponse(
        "Unsupported image type. Please upload JPEG, PNG, WebP, AVIF, TIFF, or GIF.",
        { status: 415 },
      );
    }

    const targetWidth = parseOptionalPositiveInt(formData.get("targetWidth"));
    const targetHeight = parseOptionalPositiveInt(formData.get("targetHeight"));

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // Read metadata once to implement the "960px default" rule.
    const base = sharp(inputBuffer, {
      // This prevents pathological images from consuming extreme memory.
      limitInputPixels: 268402689, // sharp default (0.33.x)
    });

    const meta = await base.metadata();
    const originalWidth = meta.width ?? null;

    // IMPORTANT: We build a new pipeline from the original buffer so that
    // `metadata()` doesn't consume the pipeline we're about to transform.
    let pipeline = sharp(inputBuffer, {
      limitInputPixels: 268402689,
      animated: true,
    });

    const hasCustomDims = targetWidth !== null || targetHeight !== null;

    if (hasCustomDims) {
      // Custom sizing:
      // - If both are provided: resize exactly to the given dimensions (ignore aspect ratio).
      // - If one is missing: preserve aspect ratio.
      // Upscaling is considered "explicit" when user provides target dims.
      if (targetWidth !== null && targetHeight !== null) {
        pipeline = pipeline.resize({
          width: targetWidth,
          height: targetHeight,
          fit: "fill",
          withoutEnlargement: false,
        });
      } else {
        pipeline = pipeline.resize({
          width: targetWidth ?? undefined,
          height: targetHeight ?? undefined,
          withoutEnlargement: false,
        });
      }
    } else {
      // Default behavior: if width > 960, scale down to 960 wide; never upscale.
      if (typeof originalWidth === "number" && originalWidth > 960) {
        pipeline = pipeline.resize({ width: 960, withoutEnlargement: true });
      }
    }

    // Convert everything to lossy WebP with sane defaults.
    // - quality: 80 is generally a good balance for web images.
    // - effort: 4 keeps CPU reasonable for serverless.
    const outputBuffer = await pipeline
      .rotate() // respect EXIF orientation
      .webp({ quality: 80, effort: 4 })
      .toBuffer();

    // NextResponse expects a Web Fetch API compatible body type.
    // Convert Buffer -> Uint8Array to keep TS + runtime happy on Node/Vercel.
    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "attachment; filename=compressed.webp",
        "Cache-Control": "no-store",
        "X-Original-Bytes": String(file.size),
        "X-Compressed-Bytes": String(outputBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(`Compression failed: ${message}`, { status: 500 });
  }
}


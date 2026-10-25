import { ApiError } from '@/lib/api';
import type { StructuredImage } from '@/lib/ai';

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

type MediaType = StructuredImage['mediaType'];

/** Media type from the file's first bytes; the browser-supplied MIME type is never trusted. */
export function sniffImageType(bytes: Uint8Array): MediaType | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Validate the uploaded screenshots and turn them into base64 blocks for the vision call.
 * Bytes stay in memory for this request only: never logged, stored or written to fixtures.
 */
export function toVisionImages(files: ReadonlyArray<Uint8Array>): StructuredImage[] {
  if (files.length < 1 || files.length > MAX_IMAGES) {
    throw new ApiError('VALIDATION', `Add between 1 and ${MAX_IMAGES} screenshots`, 400, { field: 'images' });
  }
  let total = 0;
  return files.map((bytes, index) => {
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new ApiError('VALIDATION', 'Each screenshot must be under 1.5 MB', 400, { field: `images.${index}` });
    }
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) {
      throw new ApiError('VALIDATION', 'Screenshots must be under 4 MB together', 400, { field: 'images' });
    }
    const mediaType = sniffImageType(bytes);
    if (!mediaType) {
      throw new ApiError('VALIDATION', 'Only PNG, JPEG or WebP screenshots work', 400, { field: `images.${index}` });
    }
    return { mediaType, data: Buffer.from(bytes).toString('base64') };
  });
}

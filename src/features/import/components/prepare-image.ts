/**
 * Browser-side screenshot preparation. Re-encoding through a canvas shrinks the upload and drops
 * EXIF and any other metadata; only pixels survive. Nothing is uploaded until the user taps Send.
 */

export const MAX_EDGE = 1568;
export const JPEG_QUALITY = 0.85;
export const MAX_FILES = 4;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type PreparedImage = { id: string; name: string; blob: Blob; url: string };

/** Target size keeping the aspect ratio, never upscaling. */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(`${file.name} isn't a PNG, JPEG or WebP screenshot.`);
  }
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare images.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error(`Couldn't read ${file.name}.`);
  return { id: crypto.randomUUID(), name: file.name, blob, url: URL.createObjectURL(blob) };
}

export function totalBytes(images: readonly PreparedImage[]): number {
  return images.reduce((sum, image) => sum + image.blob.size, 0);
}

import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, sniffImageType, toVisionImages } from '@/features/import/server/images';

const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const webp = () => Uint8Array.from([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
const padded = (head: Uint8Array, size: number) => {
  const out = new Uint8Array(size);
  out.set(head);
  return out;
};

describe('image validation', () => {
  it('sniffs JPEG, PNG and WebP by magic bytes and rejects the rest', () => {
    expect(sniffImageType(jpeg())).toBe('image/jpeg');
    expect(sniffImageType(png())).toBe('image/png');
    expect(sniffImageType(webp())).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns='))).toBeNull();
  });

  it('returns base64 vision blocks for valid screenshots', () => {
    const [block] = toVisionImages([jpeg()]);
    expect(block).toEqual({ mediaType: 'image/jpeg', data: Buffer.from(jpeg()).toString('base64') });
  });

  it('rejects zero or more than four files', () => {
    expect(() => toVisionImages([])).toThrow(/between 1 and 4/);
    expect(() => toVisionImages([jpeg(), jpeg(), jpeg(), jpeg(), jpeg()])).toThrow(/between 1 and 4/);
  });

  it('rejects a file over 1.5 MB, a total over 4 MB, and a disguised file', () => {
    expect(() => toVisionImages([padded(jpeg(), MAX_IMAGE_BYTES + 1)])).toThrow(/1.5 MB/);
    const big = padded(png(), 1_400_000);
    expect(() => toVisionImages([big, big, big, big])).toThrow(/4 MB/);
    expect(() => toVisionImages([new TextEncoder().encode('not an image')])).toThrow(/PNG, JPEG or WebP/);
  });
});

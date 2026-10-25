import { describe, expect, it, vi } from "vitest";
import { chunk, ID_CHUNK, inChunks } from "@/features/events/server/chunks";

vi.mock("server-only", () => ({}));

describe("chunk / inChunks", () => {
  it("splits into chunks of at most ID_CHUNK and keeps order", () => {
    const ids = Array.from({ length: 250 }, (_, i) => i);
    const parts = chunk(ids);
    expect(parts.map((p) => p.length)).toEqual([ID_CHUNK, ID_CHUNK, 50]);
    expect(parts.flat()).toEqual(ids);
    expect(chunk([])).toEqual([]);
  });

  it("issues one read per chunk and concatenates the rows", async () => {
    const read = vi.fn(async (part: number[]) => part.map((n) => n * 2));
    const rows = await inChunks(Array.from({ length: 205 }, (_, i) => i), read);
    expect(read).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(205);
    expect(rows[204]).toBe(408);
  });

  it("makes no request for an empty id list", async () => {
    const read = vi.fn(async () => [] as number[]);
    expect(await inChunks([], read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});

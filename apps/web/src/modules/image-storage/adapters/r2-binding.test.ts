import { describe, expect, it, vi } from "vitest";
import { createR2BindingImageStorage, type R2BucketLike } from "./r2-binding";

function createFakeBucket(pageSize = 2) {
  const objects = new Map<
    string,
    { body: Blob; uploaded: Date; contentType?: string }
  >();
  const describe = (key: string) => {
    const object = objects.get(key)!;
    return {
      key,
      size: object.body.size,
      uploaded: object.uploaded,
      httpMetadata: { contentType: object.contentType },
    };
  };
  const bucket = {
    head: vi.fn(async (key: string) =>
      objects.has(key) ? describe(key) : null,
    ),
    get: vi.fn(async (key: string) => {
      const object = objects.get(key);
      if (!object) return null;
      return {
        ...describe(key),
        body: object.body.stream(),
        blob: async () => object.body,
      };
    }),
    put: vi.fn(
      async (
        key: string,
        value: ReadableStream | ArrayBuffer | Blob | string,
        options?: { httpMetadata?: { contentType?: string } },
      ) => {
        const body = await new Response(value).blob();
        objects.set(key, {
          body,
          uploaded: new Date("2026-10-19T00:00:00.000Z"),
          contentType: options?.httpMetadata?.contentType,
        });
        return describe(key);
      },
    ),
    delete: vi.fn(async (keys: string | string[]) => {
      for (const key of [keys].flat()) objects.delete(key);
    }),
    list: vi.fn(
      async ({
        prefix = "",
        cursor,
      }: { prefix?: string; cursor?: string } = {}) => {
        const keys = [...objects.keys()]
          .filter((key) => key.startsWith(prefix))
          .sort();
        const start = cursor ? Number(cursor) : 0;
        const page = keys.slice(start, start + pageSize);
        const truncated = start + pageSize < keys.length;
        return {
          objects: page.map(describe),
          truncated,
          cursor: truncated ? String(start + pageSize) : undefined,
        };
      },
    ),
  } satisfies R2BucketLike;
  return { bucket, objects };
}

describe("R2 binding image storage", () => {
  it("lists every page under the prefix and skips folder markers", async () => {
    const { bucket } = createFakeBucket();
    for (const key of ["i/a.png", "i/b.png", "i/c.png", "i/", "other/d.png"]) {
      await bucket.put(key, "x");
    }
    const storage = createR2BindingImageStorage(bucket, { includePath: "i/" });

    const result = await storage.listStoredImages();

    expect(result).toEqual({
      ok: true,
      value: ["i/a.png", "i/b.png", "i/c.png"].map((key) => ({
        key,
        lastModified: "2026-10-19T00:00:00.000Z",
      })),
    });
  });

  it("stores the content type and reports metadata", async () => {
    const { bucket } = createFakeBucket();
    const storage = createR2BindingImageStorage(bucket);

    await storage.putStoredImage({
      key: "i/a.png",
      body: new Blob(["png"], { type: "image/png" }),
    });

    expect(await storage.probeStoredImage("i/a.png")).toEqual({
      ok: true,
      value: {
        key: "i/a.png",
        lastModified: "2026-10-19T00:00:00.000Z",
        contentType: "image/png",
        size: 3,
      },
    });
    expect(await storage.probeStoredImage("missing.png")).toEqual({
      ok: false,
      error: { reason: "not-found", key: "missing.png" },
    });
  });

  it("renames by copying then deleting, refusing to overwrite", async () => {
    const { bucket, objects } = createFakeBucket();
    await bucket.put("a.png", "a", {
      httpMetadata: { contentType: "image/png" },
    });
    await bucket.put("b.png", "b");
    const storage = createR2BindingImageStorage(bucket);

    expect(
      await storage.renameStoredImage({ oldKey: "a.png", newKey: "b.png" }),
    ).toEqual({ ok: false, error: { reason: "already-exists", key: "b.png" } });

    expect(
      await storage.renameStoredImage({ oldKey: "a.png", newKey: "c.png" }),
    ).toEqual({ ok: true, value: { oldKey: "a.png", newKey: "c.png" } });
    expect([...objects.keys()].sort()).toEqual(["b.png", "c.png"]);
    expect(await objects.get("c.png")!.body.text()).toBe("a");
    expect(objects.get("c.png")!.contentType).toBe("image/png");
  });

  it("reports a partial rename when the old object cannot be deleted", async () => {
    const { bucket } = createFakeBucket();
    await bucket.put("a.png", "a");
    bucket.delete.mockRejectedValueOnce(new Error("boom"));
    const storage = createR2BindingImageStorage(bucket);

    expect(
      await storage.renameStoredImage({ oldKey: "a.png", newKey: "c.png" }),
    ).toEqual({
      ok: false,
      error: {
        reason: "partial-rename",
        copiedKey: "c.png",
        failedDeleteKey: "a.png",
      },
    });
  });

  it("deletes in batches of at most 1000 keys", async () => {
    const { bucket } = createFakeBucket();
    const storage = createR2BindingImageStorage(bucket);
    const keys = Array.from({ length: 1500 }, (_, index) => `k${index}`);

    expect(await storage.deleteStoredImages(keys)).toEqual({
      ok: true,
      value: { deletedKeys: keys },
    });
    expect(bucket.delete.mock.calls.map(([batch]) => batch.length)).toEqual([
      1000, 500,
    ]);
  });

  it("streams objects for the proxy and reports missing ones", async () => {
    const { bucket } = createFakeBucket();
    await bucket.put("a.png", "bytes", {
      httpMetadata: { contentType: "image/png" },
    });
    const storage = createR2BindingImageStorage(bucket);

    const opened = await storage.openStoredImage("a.png");
    expect(opened.ok && opened.value.contentType).toBe("image/png");
    expect(opened.ok && (await new Response(opened.value.body).text())).toBe(
      "bytes",
    );
    expect(await storage.openStoredImage("missing.png")).toEqual({
      ok: false,
      error: { reason: "not-found", key: "missing.png" },
    });
  });
});

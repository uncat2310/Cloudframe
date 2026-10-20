import { STORED_IMAGE_CACHE_CONTROL } from "../cache-control";
import type { ImageStorageFailure, StoredImage } from "../schema";
import { requiredStorageAccessMethods } from "../schema";
import type { ServerImageStorage } from "./s3-server";

/**
 * The subset of the Cloudflare Workers R2 binding API this adapter uses, typed
 * structurally so the project doesn't depend on `@cloudflare/workers-types`.
 */
type R2ObjectLike = {
  key: string;
  size: number;
  uploaded: Date;
  httpMetadata?: { contentType?: string; cacheControl?: string };
};

type R2ObjectBodyLike = R2ObjectLike & {
  body: ReadableStream;
  blob(): Promise<Blob>;
};

export type R2BucketLike = {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Blob | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
    },
  ): Promise<R2ObjectLike | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    objects: R2ObjectLike[];
    truncated: boolean;
    cursor?: string;
  }>;
};

export function isR2BucketLike(value: unknown): value is R2BucketLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as R2BucketLike).list === "function" &&
    typeof (value as R2BucketLike).put === "function"
  );
}

function toFailure(error: unknown): ImageStorageFailure {
  return {
    reason: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

/** R2 delete accepts at most 1000 keys per call. */
const DELETE_BATCH_SIZE = 1000;

/**
 * Image storage backed by a Workers R2 binding: no S3 credentials or request
 * signing, the Worker talks to its bound bucket directly.
 */
export function createR2BindingImageStorage(
  bucket: R2BucketLike,
  { includePath = "" }: { includePath?: string } = {},
): ServerImageStorage {
  return {
    async listStoredImages() {
      try {
        const images: StoredImage[] = [];
        let cursor: string | undefined;
        do {
          const page = await bucket.list({
            prefix: includePath || undefined,
            cursor,
            limit: 1000,
          });
          for (const object of page.objects) {
            if (object.key.endsWith("/")) continue;
            images.push({
              key: object.key,
              lastModified: object.uploaded.toISOString(),
            });
          }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        return { ok: true, value: images };
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
    },
    async putStoredImage({ key, body, contentType }) {
      try {
        await bucket.put(key, body, {
          httpMetadata: {
            contentType:
              contentType ||
              (typeof body === "string" ? "text/plain" : body.type) ||
              undefined,
            cacheControl: STORED_IMAGE_CACHE_CONTROL,
          },
        });
        return { ok: true, value: { key } };
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
    },
    async deleteStoredImages(keys) {
      try {
        for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
          await bucket.delete(keys.slice(start, start + DELETE_BATCH_SIZE));
        }
        return { ok: true, value: { deletedKeys: [...keys] } };
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
    },
    async renameStoredImage({ oldKey, newKey, overwrite = false }) {
      try {
        if (!overwrite && (await bucket.head(newKey))) {
          return {
            ok: false,
            error: { reason: "already-exists", key: newKey },
          };
        }
        // R2 bindings have no server-side copy: stream the object across.
        const source = await bucket.get(oldKey);
        if (!source) {
          return { ok: false, error: { reason: "not-found", key: oldKey } };
        }
        await bucket.put(newKey, source.body, {
          httpMetadata: {
            ...source.httpMetadata,
            // Images uploaded before Cache-Control was set get it now.
            cacheControl:
              source.httpMetadata?.cacheControl ?? STORED_IMAGE_CACHE_CONTROL,
          },
        });
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
      try {
        await bucket.delete(oldKey);
      } catch {
        return {
          ok: false,
          error: {
            reason: "partial-rename",
            copiedKey: newKey,
            failedDeleteKey: oldKey,
          },
        };
      }
      return { ok: true, value: { oldKey, newKey } };
    },
    async downloadStoredImage(key) {
      try {
        const object = await bucket.get(key);
        if (!object) return { ok: false, error: { reason: "not-found", key } };
        return { ok: true, value: { key, body: await object.blob() } };
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
    },
    async probeStoredImage(key) {
      try {
        const object = await bucket.head(key);
        if (!object) return { ok: false, error: { reason: "not-found", key } };
        return {
          ok: true,
          value: {
            key,
            lastModified: object.uploaded.toISOString(),
            contentType: object.httpMetadata?.contentType,
            size: object.size,
          },
        };
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
    },
    async checkAccess() {
      try {
        await bucket.list({ prefix: includePath || undefined, limit: 1 });
        return {
          ok: true,
          value: { allowedMethods: [...requiredStorageAccessMethods] },
        };
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
    },
    async openStoredImage(key) {
      try {
        const object = await bucket.get(key);
        if (!object) return { ok: false, error: { reason: "not-found", key } };
        return {
          ok: true,
          value: {
            body: object.body,
            contentType: object.httpMetadata?.contentType,
            size: object.size,
          },
        };
      } catch (error) {
        return { ok: false, error: toFailure(error) };
      }
    },
  };
}

import ImageS3Client from "./image-s3-client";
import { createS3ImageStorage, toStorageFailure } from "./s3";
import type { S3Options } from "@/stores/schemas/settings";
import {
  requiredStorageAccessMethods,
  type ImageStorageFailureResult,
} from "../schema";
import type { ImageStorage } from "../storage";

export type StoredImageStream = {
  body: ReadableStream;
  contentType?: string;
  size?: number;
};

export type ServerImageStorage = ImageStorage & {
  /** Stream a stored image's bytes, e.g. to proxy them to the browser. */
  openStoredImage(
    key: string,
  ): Promise<
    { ok: true; value: StoredImageStream } | ImageStorageFailureResult
  >;
};

/**
 * S3 storage used on the server (self-hosted mode). The browser never talks
 * to the bucket, so access checks only need the credentials to list objects;
 * CORS rules are irrelevant (and object-scoped R2 tokens can't read them).
 */
export function createServerS3ImageStorage(
  settings: S3Options,
): ServerImageStorage {
  const client = new ImageS3Client(settings);

  return {
    ...createS3ImageStorage(settings),
    async checkAccess() {
      try {
        await client.checkList();
        return {
          ok: true,
          value: { allowedMethods: [...requiredStorageAccessMethods] },
        };
      } catch (error) {
        return { ok: false, error: toStorageFailure(error) };
      }
    },
    async openStoredImage(key) {
      try {
        const response = await client.get(key);
        if (!response.Body) {
          return { ok: false, error: { reason: "not-found", key } };
        }
        return {
          ok: true,
          value: {
            body: response.Body.transformToWebStream(),
            contentType: response.ContentType,
            size: response.ContentLength,
          },
        };
      } catch (error) {
        return { ok: false, error: toStorageFailure(error, key) };
      }
    },
  };
}

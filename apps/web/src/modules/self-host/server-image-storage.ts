import { ORPCError } from "@orpc/client";
import { client } from "@/lib/orpc/client";
import { TRASH_BATCH_SIZE } from "@/lib/self-host/policy";
import type {
  ImageStorage,
  ImageStorageFailureResult,
} from "@/modules/image-storage";
import { notifySelfHostSignedOut } from "./session";

async function call<T>(
  request: () => Promise<T>,
): Promise<T | ImageStorageFailureResult> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
      notifySelfHostSignedOut();
      return { ok: false, error: { reason: "access-denied" } };
    }
    return {
      ok: false,
      error: {
        reason: "unknown",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Image storage for the self-hosted mode: every operation runs on the server,
 * which holds the R2 credentials.
 */
export function createServerImageStorage(): ImageStorage {
  const storage = client.selfHost.storage;
  return {
    listStoredImages: () => call(() => storage.list()),
    putStoredImage: ({ key, body, contentType }) =>
      call(() =>
        storage.put({
          key,
          body:
            typeof body === "string"
              ? new Blob([body], { type: "text/plain" })
              : body,
          contentType,
        }),
      ),
    deleteStoredImages: (keys) =>
      call(async () => {
        // Deleting moves each image to the trash, three R2 calls apiece; keep
        // every request within the Workers free plan's subrequest limit.
        const deletedKeys: string[] = [];
        for (let start = 0; start < keys.length; start += TRASH_BATCH_SIZE) {
          const batch = keys.slice(start, start + TRASH_BATCH_SIZE);
          const result = await storage.delete({ keys: batch });
          if (!result.ok) {
            return deletedKeys.length > 0
              ? { ok: true as const, value: { deletedKeys } }
              : result;
          }
          deletedKeys.push(...result.value.deletedKeys);
        }
        return { ok: true as const, value: { deletedKeys } };
      }),
    renameStoredImage: (input) => call(() => storage.rename(input)),
    downloadStoredImage: (key) => call(() => storage.download({ key })),
    probeStoredImage: (key) => call(() => storage.probe({ key })),
    checkAccess: () => call(() => storage.checkAccess()),
  };
}

import { createR2BindingImageStorage } from "@/modules/image-storage/adapters/r2-binding";
import {
  createServerS3ImageStorage,
  type ServerImageStorage,
} from "@/modules/image-storage/adapters/s3-server";
import type { SelfHostConfig } from "./config";
import { TRASH_PREFIX } from "./policy";

function createStorage(config: SelfHostConfig, includePath: string) {
  return config.backend.type === "r2-binding"
    ? createR2BindingImageStorage(config.backend.bucket, { includePath })
    : createServerS3ImageStorage({ ...config.s3, includePath });
}

let cached:
  | {
      config: SelfHostConfig;
      storage: ServerImageStorage;
      trash: ServerImageStorage;
    }
  | undefined;

function cachedFor(config: SelfHostConfig) {
  if (cached?.config !== config) {
    cached = {
      config,
      storage: createStorage(config, config.s3.includePath),
      trash: createStorage(config, TRASH_PREFIX + config.s3.includePath),
    };
  }
  return cached;
}

/** Server-side image storage backed by the credentials from the environment. */
export function getSelfHostStorage(config: SelfHostConfig) {
  return cachedFor(config).storage;
}

/**
 * The same bucket, listing only the trash (under TRASH_PREFIX, then the
 * include path). Other operations take full keys, trash or not.
 */
export function getSelfHostTrashStorage(config: SelfHostConfig) {
  return cachedFor(config).trash;
}

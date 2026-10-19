import {
  createServerS3ImageStorage,
  type ServerImageStorage,
} from "@/modules/image-storage/adapters/s3-server";
import type { SelfHostConfig } from "./config";

let cached: { config: SelfHostConfig; storage: ServerImageStorage } | undefined;

/** Server-side image storage backed by the credentials from the environment. */
export function getSelfHostStorage(config: SelfHostConfig) {
  if (cached?.config !== config) {
    cached = { config, storage: createServerS3ImageStorage(config.s3) };
  }
  return cached.storage;
}

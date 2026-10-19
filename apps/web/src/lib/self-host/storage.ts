import { createR2BindingImageStorage } from "@/modules/image-storage/adapters/r2-binding";
import {
  createServerS3ImageStorage,
  type ServerImageStorage,
} from "@/modules/image-storage/adapters/s3-server";
import type { SelfHostConfig } from "./config";

let cached: { config: SelfHostConfig; storage: ServerImageStorage } | undefined;

/** Server-side image storage backed by the credentials from the environment. */
export function getSelfHostStorage(config: SelfHostConfig) {
  if (cached?.config !== config) {
    cached = {
      config,
      storage:
        config.backend.type === "r2-binding"
          ? createR2BindingImageStorage(config.backend.bucket, {
              includePath: config.s3.includePath,
            })
          : createServerS3ImageStorage(config.s3),
    };
  }
  return cached.storage;
}

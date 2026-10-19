import {
  createS3ImageStorage,
  type CreateImageStorageFromSettings,
} from "@/modules/image-storage";
import { selfHostMode } from "@/lib/self-host/flag";
import { createServerImageStorage } from "./server-image-storage";

/** Default storage factory: server-proxied in self-hosted mode, direct S3 otherwise. */
export const createImageStorage: CreateImageStorageFromSettings = (settings) =>
  selfHostMode ? createServerImageStorage() : createS3ImageStorage(settings);

import type { CreateImageStorageFromSettings } from "@/modules/image-storage";
import { createServerImageStorage } from "./server-image-storage";

/**
 * Default storage factory: every operation is proxied through the server,
 * which holds the R2 access, so the browser-side settings are not needed.
 */
export const createImageStorage: CreateImageStorageFromSettings = () =>
  createServerImageStorage();

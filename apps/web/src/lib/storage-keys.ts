const STORAGE_PREFIX = "cloudframe:";

/** Everything Cloudframe keeps in the browser's localStorage. */
export const storageKeys = {
  locale: `${STORAGE_PREFIX}locale`,
  theme: `${STORAGE_PREFIX}root:theme`,
  profiles: `${STORAGE_PREFIX}profiles-list`,
  galleryPhotos: `${STORAGE_PREFIX}gallery:photos`,
  naturalSizeCache: `${STORAGE_PREFIX}gallery:naturalSizeCache`,
} as const;

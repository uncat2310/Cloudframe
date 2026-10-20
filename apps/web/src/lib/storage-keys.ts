const STORAGE_PREFIX = "cloudframe:";
/** Prefix used before the project was renamed from S3 Image Port. */
const LEGACY_STORAGE_PREFIX = "s3ip:";

/** Everything Cloudframe keeps in the browser's localStorage. */
export const storageKeys = {
  locale: `${STORAGE_PREFIX}locale`,
  theme: `${STORAGE_PREFIX}root:theme`,
  profiles: `${STORAGE_PREFIX}profiles-list`,
  galleryPhotos: `${STORAGE_PREFIX}gallery:photos`,
  naturalSizeCache: `${STORAGE_PREFIX}gallery:naturalSizeCache`,
} as const;

/**
 * Move values saved under the pre-rename `s3ip:` keys to their `cloudframe:`
 * names, so a browser keeps its settings across the rename. A value already
 * stored under the new key wins. Runs before anything reads storage; does
 * nothing when storage is unavailable.
 */
export function migrateLegacyStorageKeys(
  storage: Storage | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
) {
  if (!storage) return;
  try {
    for (const key of Object.values(storageKeys)) {
      const legacyKey =
        LEGACY_STORAGE_PREFIX + key.slice(STORAGE_PREFIX.length);
      const legacyValue = storage.getItem(legacyKey);
      if (legacyValue === null) continue;
      if (storage.getItem(key) === null) storage.setItem(key, legacyValue);
      storage.removeItem(legacyKey);
    }
  } catch {
    // Storage can throw (private mode, quota): keep the defaults.
  }
}

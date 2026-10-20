/**
 * Cache-Control stored with every uploaded image, so browsers and
 * Cloudflare's cache in front of the public bucket URL keep it instead of
 * reading it from R2 again on each view. Keys are unique by default (ULID in
 * the key template); seven days bounds how long an image re-uploaded under
 * the same key can show its old version.
 */
export const STORED_IMAGE_CACHE_CONTROL = "public, max-age=604800";

import mime from "mime";

/**
 * Whether `key` lies under the configured R2_INCLUDE_PATH. With a prefix set,
 * the panel only lists those objects, so it should not be able to write,
 * read or delete anything outside it either.
 */
export function isInsideIncludePath(includePath: string, key: string) {
  return includePath === "" || key.startsWith(includePath);
}

/**
 * Content type to store an upload with: what the browser declared when that
 * is an image or video, otherwise the file's extension (browsers report some
 * formats, like HEIC on some systems, as empty or `application/octet-stream`).
 */
export function resolveUploadContentType(
  key: string,
  declared: string | undefined,
) {
  const type = declared?.split(";")[0]?.trim().toLowerCase() || undefined;
  if (isImageOrVideoType(type)) return type;
  return mime.getType(key) ?? type;
}

/**
 * An image host only stores images and videos (Live Photo `.mov`s), and the
 * same-origin object proxy only serves those inline: anything else could run
 * as a page on the panel's origin.
 */
export function isImageOrVideoType(
  contentType: string | undefined,
): contentType is string {
  return (
    contentType !== undefined &&
    (contentType.startsWith("image/") || contentType.startsWith("video/"))
  );
}

/**
 * Deleting from the panel moves an image under this prefix (keeping its
 * path), where it can be restored; a bucket lifecycle rule purges it after
 * 30 days. The gallery never lists these keys.
 */
export const TRASH_PREFIX = ".trash/";

export function isTrashKey(key: string) {
  return key.startsWith(TRASH_PREFIX);
}

export function toTrashKey(key: string) {
  return TRASH_PREFIX + key;
}

/** The key a trashed image had before it was deleted. */
export function fromTrashKey(trashKey: string) {
  return isTrashKey(trashKey) ? trashKey.slice(TRASH_PREFIX.length) : undefined;
}

/**
 * Keys per delete/restore request. Moving an image costs three R2 calls
 * (read, write, delete), and the Workers free plan allows 50 subrequests per
 * request, so the browser sends larger selections in batches of this size.
 */
export const TRASH_BATCH_SIZE = 10;

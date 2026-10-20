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

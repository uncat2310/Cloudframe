import { describe, expect, it } from "vitest";
import {
  fromTrashKey,
  isImageOrVideoType,
  isInsideIncludePath,
  isTrashKey,
  resolveUploadContentType,
  toTrashKey,
} from "./policy";

describe("self-host storage policy", () => {
  it("allows every key without an include path", () => {
    expect(isInsideIncludePath("", "anything/at/all.png")).toBe(true);
  });

  it("keeps keys under the include path", () => {
    expect(isInsideIncludePath("i/", "i/2026/a.png")).toBe(true);
    expect(isInsideIncludePath("i/", "other/a.png")).toBe(false);
    expect(isInsideIncludePath("i/", "i")).toBe(false);
  });

  it("only accepts images and videos", () => {
    expect(isImageOrVideoType("image/png")).toBe(true);
    expect(isImageOrVideoType("video/quicktime")).toBe(true);
    expect(isImageOrVideoType("text/html")).toBe(false);
    expect(isImageOrVideoType("application/octet-stream")).toBe(false);
    expect(isImageOrVideoType(undefined)).toBe(false);
  });

  it("keeps a declared image or video type", () => {
    expect(resolveUploadContentType("a.bin", "image/webp")).toBe("image/webp");
    expect(resolveUploadContentType("a.png", "Image/PNG; q=1")).toBe(
      "image/png",
    );
  });

  it("falls back to the extension for missing or generic types", () => {
    expect(resolveUploadContentType("a.heic", undefined)).toBe("image/heic");
    expect(resolveUploadContentType("a.heic", "")).toBe("image/heic");
    expect(resolveUploadContentType("a.mov", "application/octet-stream")).toBe(
      "video/quicktime",
    );
  });

  it("does not turn a disguised page into an image", () => {
    expect(resolveUploadContentType("a.html", "application/octet-stream")).toBe(
      "text/html",
    );
    expect(resolveUploadContentType("noext", "text/html")).toBe("text/html");
  });

  it("maps keys to and from the trash", () => {
    expect(toTrashKey("i/2026/a.png")).toBe(".trash/i/2026/a.png");
    expect(fromTrashKey(".trash/i/2026/a.png")).toBe("i/2026/a.png");
    expect(fromTrashKey("i/a.png")).toBeUndefined();
    expect(isTrashKey(".trash/x.png")).toBe(true);
    expect(isTrashKey("x.trash/a.png")).toBe(false);
    expect(fromTrashKey(toTrashKey(".hidden/a.png"))).toBe(".hidden/a.png");
  });
});

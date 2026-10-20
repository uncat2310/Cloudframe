import { describe, expect, it } from "vitest";
import { toThumbnailUrl } from "./thumbnail";

const OPTIONS = "width=800,height=800,fit=scale-down,quality=80,format=auto";

describe("toThumbnailUrl", () => {
  it("is off unless Cloudflare thumbnails are enabled", () => {
    expect(toThumbnailUrl("https://img.example.com/i/a.jpg", "off")).toBe(
      undefined,
    );
  });

  it("puts the transformation in front of the image path", () => {
    expect(
      toThumbnailUrl(
        "https://img.example.com/i/2026/10/a%20b.JPG",
        "cloudflare",
      ),
    ).toBe(
      `https://img.example.com/cdn-cgi/image/${OPTIONS}/i/2026/10/a%20b.JPG`,
    );
    expect(toThumbnailUrl("https://img.example.com/x.webp", "cloudflare")).toBe(
      `https://img.example.com/cdn-cgi/image/${OPTIONS}/x.webp`,
    );
  });

  it("leaves formats Cloudflare cannot transform alone", () => {
    for (const name of ["a.heic", "a.HEIF", "a.svg", "a.mov", "noext"]) {
      expect(
        toThumbnailUrl(`https://img.example.com/i/${name}`, "cloudflare"),
      ).toBe(undefined);
    }
  });

  it("ignores non-HTTPS and unparsable URLs", () => {
    expect(toThumbnailUrl("http://img.example.com/a.jpg", "cloudflare")).toBe(
      undefined,
    );
    expect(toThumbnailUrl("blob:abc", "cloudflare")).toBe(undefined);
    expect(toThumbnailUrl("not a url", "cloudflare")).toBe(undefined);
  });
});

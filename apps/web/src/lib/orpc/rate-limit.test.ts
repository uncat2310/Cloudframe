import { describe, expect, it, vi } from "vitest";
import {
  createWorkersLimiter,
  getClientIp,
  isWorkersRateLimitBinding,
} from "./rate-limit";

describe("getClientIp", () => {
  const headers = new Headers({
    "cf-connecting-ip": "203.0.113.1",
    "x-forwarded-for": "198.51.100.9, 192.0.2.5",
    "x-real-ip": "192.0.2.7",
  });

  it("uses CF-Connecting-IP on Workers and ignores forwarding headers", () => {
    expect(getClientIp(headers, { onWorker: true })).toBe("203.0.113.1");
    expect(
      getClientIp(new Headers({ "x-forwarded-for": "198.51.100.9" }), {
        onWorker: true,
      }),
    ).toBe("unknown");
  });

  it("trusts no header off Workers unless one is configured", () => {
    expect(getClientIp(headers, { onWorker: false })).toBe("unknown");
    expect(
      getClientIp(headers, { onWorker: false, trustedHeader: "X-Real-IP" }),
    ).toBe("192.0.2.7");
  });

  it("takes the proxy-appended (last) X-Forwarded-For entry", () => {
    expect(
      getClientIp(headers, {
        onWorker: false,
        trustedHeader: "x-forwarded-for",
      }),
    ).toBe("192.0.2.5");
  });
});

describe("createWorkersLimiter", () => {
  it("passes the key to the binding and reports the configured limit", async () => {
    const binding = {
      limit: vi.fn(async ({ key }: { key: string }) => ({
        success: key !== "blocked",
      })),
    };
    expect(isWorkersRateLimitBinding(binding)).toBe(true);
    const limiter = createWorkersLimiter(binding, {
      windowMs: 60_000,
      maxRequests: 10,
    });

    expect(await limiter.limit("ok")).toMatchObject({
      success: true,
      limit: 10,
    });
    expect(await limiter.limit("blocked")).toMatchObject({
      success: false,
      limit: 10,
      remaining: 0,
    });
    expect(binding.limit).toHaveBeenCalledWith({ key: "blocked" });
  });

  it("does not mistake other bindings for a rate limiter", () => {
    expect(isWorkersRateLimitBinding(undefined)).toBe(false);
    expect(isWorkersRateLimitBinding({ list() {}, put() {} })).toBe(false);
  });
});

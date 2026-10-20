import type {
  Ratelimiter,
  RatelimiterLimitResult,
} from "@orpc/experimental-ratelimit";
import { MemoryRatelimiter } from "@orpc/experimental-ratelimit/memory";

/**
 * In-memory limiter. Per process on Node, per isolate on Workers: enough to
 * slow down password guessing for a single-user panel.
 */
export function createMemoryLimiter(options: {
  windowMs: number;
  maxRequests: number;
}) {
  return new MemoryRatelimiter({
    maxRequests: options.maxRequests,
    window: options.windowMs,
  });
}

/** The Workers Rate Limiting binding (`ratelimits` in wrangler.jsonc). */
export type WorkersRateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export function isWorkersRateLimitBinding(
  value: unknown,
): value is WorkersRateLimitBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkersRateLimitBinding).limit === "function"
  );
}

/**
 * Limiter backed by the Workers Rate Limiting binding, whose counters are
 * shared by every isolate in a Cloudflare location (unlike memory). The
 * binding only answers pass/fail, so the rest of the result is the
 * configured limit.
 */
export function createWorkersLimiter(
  binding: WorkersRateLimitBinding,
  options: { windowMs: number; maxRequests: number },
): Ratelimiter {
  return {
    async limit(key): Promise<RatelimiterLimitResult> {
      const { success } = await binding.limit({ key });
      return {
        success,
        limit: options.maxRequests,
        remaining: success ? undefined : 0,
        reset: Date.now() + options.windowMs,
      };
    },
  };
}

/**
 * The client IP, from a header that only a trusted party can set:
 *
 * - On Workers, `CF-Connecting-IP`, which Cloudflare's edge always overwrites.
 * - Elsewhere, only the header named by `trustedHeader` (S3IP_CLIENT_IP_HEADER),
 *   for a server behind a reverse proxy that sets it. For `X-Forwarded-For`
 *   the last entry is used: it is the one the proxy appended, the earlier
 *   ones are whatever the client sent.
 *
 * Without a trusted source every client shares one bucket, which still
 * limits guessing (and is why `X-Forwarded-For` is never read by default:
 * anyone can send a fresh one per attempt).
 */
export function getClientIp(
  headers: Headers | undefined,
  options: { onWorker: boolean; trustedHeader?: string },
): string {
  const header = options.onWorker
    ? "cf-connecting-ip"
    : options.trustedHeader?.toLowerCase();
  const value = header ? headers?.get(header) : undefined;
  if (!value) return "unknown";
  if (header === "x-forwarded-for") {
    return value.split(",").at(-1)!.trim() || "unknown";
  }
  return value.trim();
}

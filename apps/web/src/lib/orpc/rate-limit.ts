import { MemoryRatelimiter } from "@orpc/experimental-ratelimit/memory";
import type { RequestHeadersPluginContext } from "@orpc/server/plugins";

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

export function getClientIp(context: RequestHeadersPluginContext): string {
  const headers = context.reqHeaders;
  const forwarded = headers?.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  const candidates = [
    "cf-connecting-ip",
    "x-real-ip",
    "x-client-ip",
    "fastly-client-ip",
    "true-client-ip",
  ];
  for (const header of candidates) {
    const value = headers?.get(header);
    if (value) {
      return value.trim();
    }
  }
  return "unknown";
}

import { createRatelimitMiddleware } from "@orpc/experimental-ratelimit";
import { z } from "zod";
import {
  imageStorageAccessResultSchema,
  storageKeySchema,
  storedImageDeleteResultSchema,
  storedImageDownloadResultSchema,
  storedImageListResultSchema,
  storedImageMetadataResultSchema,
  storedImageRenameResultSchema,
  storedImageResultSchema,
} from "@/modules/image-storage/schema";
import {
  loadSelfHostConfig,
  publicStorageSchema,
  toPublicStorage,
} from "@/lib/self-host/config";
import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  isSecureRequest,
  passwordMatches,
} from "@/lib/self-host/session";
import { getSelfHostStorage } from "@/lib/self-host/storage";
import { createHybridLimiter, getClientIp } from "../rate-limit";
import { baseOs } from "./base-router";

const selfHostOs = baseOs.errors({
  UNAUTHORIZED: {},
  SELF_HOST_NOT_CONFIGURED: {
    status: 503,
    data: z.object({ problems: z.array(z.string()) }),
  },
});

const requireSession = selfHostOs.middleware(
  async ({ context, next, errors }) => {
    const result = loadSelfHostConfig();
    if (!result.ok) {
      throw errors.SELF_HOST_NOT_CONFIGURED({
        data: { problems: result.problems },
      });
    }
    if (!(await hasValidSession(result.config, context.reqHeaders))) {
      throw errors.UNAUTHORIZED();
    }
    return next({ context: { storage: getSelfHostStorage(result.config) } });
  },
);

const isTestEnv = process.env.NODE_ENV === "test";

const loginRateLimitByIp = createRatelimitMiddleware({
  limiter: createHybridLimiter({
    prefix: "self-host:login:ratelimit:",
    ...(isTestEnv
      ? { windowMs: 1_000, maxRequests: 10_000 }
      : { windowMs: 60_000, maxRequests: 10 }),
  }),
  key: (options) => `ip:${getClientIp(options.context)}`,
});

export const selfHostSessionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("not-configured"),
    problems: z.array(z.string()),
  }),
  z.object({ status: z.literal("signed-out") }),
  z.object({
    status: z.literal("signed-in"),
    storage: publicStorageSchema,
    keyTemplate: z.string().nullable(),
  }),
]);

const session = selfHostOs
  .output(selfHostSessionSchema)
  .handler(async ({ context }) => {
    const result = loadSelfHostConfig();
    if (!result.ok) {
      return { status: "not-configured" as const, problems: result.problems };
    }
    if (!(await hasValidSession(result.config, context.reqHeaders))) {
      return { status: "signed-out" as const };
    }
    return {
      status: "signed-in" as const,
      storage: toPublicStorage(result.config),
      keyTemplate: result.config.keyTemplate ?? null,
    };
  });

const login = selfHostOs
  .errors({
    TOO_MANY_REQUESTS: {
      status: 429,
      data: z.object({
        limit: z.number(),
        remaining: z.number(),
        reset: z.number(),
      }),
    },
  })
  .input(z.object({ password: z.string().nonempty() }))
  .use(loginRateLimitByIp)
  .handler(async ({ input, context, errors }) => {
    const result = loadSelfHostConfig();
    if (!result.ok) {
      throw errors.SELF_HOST_NOT_CONFIGURED({
        data: { problems: result.problems },
      });
    }
    if (!(await passwordMatches(result.config, input.password))) {
      throw errors.UNAUTHORIZED();
    }
    context.resHeaders?.append(
      "Set-Cookie",
      await createSessionCookie(
        result.config,
        isSecureRequest(context.reqHeaders, context.requestUrl),
      ),
    );
  });

const logout = selfHostOs.handler(({ context }) => {
  context.resHeaders?.append(
    "Set-Cookie",
    clearSessionCookie(isSecureRequest(context.reqHeaders, context.requestUrl)),
  );
});

const storageOs = selfHostOs.use(requireSession);
const keyInput = z.object({ key: storageKeySchema });

export const selfHostRouter = {
  session,
  login,
  logout,
  storage: {
    list: storageOs
      .output(storedImageListResultSchema)
      .handler(({ context }) => context.storage.listStoredImages()),
    put: storageOs
      .input(
        z.object({
          key: storageKeySchema,
          body: z.instanceof(Blob),
          contentType: z.string().optional(),
        }),
      )
      .output(storedImageResultSchema)
      .handler(({ input, context }) => context.storage.putStoredImage(input)),
    delete: storageOs
      .input(z.object({ keys: z.array(storageKeySchema) }))
      .output(storedImageDeleteResultSchema)
      .handler(({ input, context }) =>
        context.storage.deleteStoredImages(input.keys),
      ),
    rename: storageOs
      .input(
        z.object({
          oldKey: storageKeySchema,
          newKey: storageKeySchema,
          overwrite: z.boolean().optional(),
        }),
      )
      .output(storedImageRenameResultSchema)
      .handler(({ input, context }) =>
        context.storage.renameStoredImage(input),
      ),
    download: storageOs
      .input(keyInput)
      .output(storedImageDownloadResultSchema)
      .handler(({ input, context }) =>
        context.storage.downloadStoredImage(input.key),
      ),
    probe: storageOs
      .input(keyInput)
      .output(storedImageMetadataResultSchema)
      .handler(({ input, context }) =>
        context.storage.probeStoredImage(input.key),
      ),
    checkAccess: storageOs
      .output(imageStorageAccessResultSchema)
      .handler(({ context }) => context.storage.checkAccess({ origin: "" })),
  },
};

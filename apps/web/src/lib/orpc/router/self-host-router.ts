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
  isCloudflareWorker,
  loadSelfHostConfig,
  readSetting,
  publicStorageSchema,
  toPublicStorage,
  workerBinding,
} from "@/lib/self-host/config";
import {
  isImageOrVideoType,
  isInsideIncludePath,
  resolveUploadContentType,
} from "@/lib/self-host/policy";
import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  isSecureRequest,
  passwordMatches,
} from "@/lib/self-host/session";
import {
  getSettingsStore,
  MAX_SETTINGS_BYTES,
  syncedSettingsSchema,
} from "@/lib/self-host/settings-store";
import { getSelfHostStorage } from "@/lib/self-host/storage";
import {
  createMemoryLimiter,
  createWorkersLimiter,
  getClientIp,
  isWorkersRateLimitBinding,
} from "../rate-limit";
import { baseOs } from "./base-router";

const selfHostOs = baseOs.errors({
  UNAUTHORIZED: {},
  SETTINGS_SYNC_UNAVAILABLE: { status: 501 },
  SETTINGS_TOO_LARGE: { status: 413 },
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
    return next({
      context: {
        storage: getSelfHostStorage(result.config),
        includePath: result.config.s3.includePath,
      },
    });
  },
);

const isTestEnv = process.env.NODE_ENV === "test";

const LOGIN_WINDOW_MS = 60_000;
/** Name of the Workers Rate Limiting binding in `wrangler.jsonc`. */
const LOGIN_RATE_LIMITER_BINDING = "LOGIN_RATE_LIMITER";
const loginLimits = isTestEnv
  ? { windowMs: 1_000, perIp: 10_000, total: 10_000 }
  : { windowMs: LOGIN_WINDOW_MS, perIp: 10, total: 60 };

const perIpMemoryLimiter = createMemoryLimiter({
  windowMs: loginLimits.windowMs,
  maxRequests: loginLimits.perIp,
});

/**
 * Attempts per client IP. On Workers the counter lives in the Rate Limiting
 * binding, shared across isolates; a memory counter alone resets whenever a
 * new connection lands on another isolate.
 */
const loginRateLimitByIp = createRatelimitMiddleware({
  limiter: () => {
    const binding = workerBinding(LOGIN_RATE_LIMITER_BINDING);
    return isWorkersRateLimitBinding(binding)
      ? createWorkersLimiter(binding, {
          windowMs: loginLimits.windowMs,
          maxRequests: loginLimits.perIp,
        })
      : perIpMemoryLimiter;
  },
  key: ({ context }) =>
    `ip:${getClientIp(context.reqHeaders, {
      onWorker: isCloudflareWorker(),
      trustedHeader: readSetting("CLIENT_IP_HEADER"),
    })}`,
});

/** Attempts from all clients together, against guessing from many IPs. */
const loginRateLimitTotal = createRatelimitMiddleware({
  limiter: createMemoryLimiter({
    windowMs: loginLimits.windowMs,
    maxRequests: loginLimits.total,
  }),
  key: "all",
});

function rejected(message: string) {
  return { ok: false as const, error: { reason: "unknown" as const, message } };
}

function outsideIncludePath(key: string) {
  return rejected(`"${key}" is outside R2_INCLUDE_PATH`);
}

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
    /** Whether upload and gallery settings are kept on the server. */
    settingsSync: z.boolean(),
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
      settingsSync: getSettingsStore() !== undefined,
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
  .input(z.object({ password: z.string().nonempty().max(1024) }))
  .use(loginRateLimitByIp)
  .use(loginRateLimitTotal)
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

const settingsRouter = {
  /** The shared settings, or `null` until a browser first saves them. */
  get: storageOs
    .output(
      z.object({
        value: syncedSettingsSchema.nullable(),
        updatedAt: z.number(),
      }),
    )
    .handler(async ({ errors }) => {
      const store = getSettingsStore();
      if (!store) throw errors.SETTINGS_SYNC_UNAVAILABLE();
      const stored = await store.read();
      return {
        value: stored?.value ?? null,
        updatedAt: stored?.updatedAt ?? 0,
      };
    }),
  put: storageOs
    .input(z.object({ value: syncedSettingsSchema }))
    .output(z.object({ updatedAt: z.number() }))
    .handler(async ({ input, errors }) => {
      const store = getSettingsStore();
      if (!store) throw errors.SETTINGS_SYNC_UNAVAILABLE();
      if (JSON.stringify(input.value).length > MAX_SETTINGS_BYTES) {
        throw errors.SETTINGS_TOO_LARGE();
      }
      const { updatedAt } = await store.write(input.value);
      return { updatedAt };
    }),
};

export const selfHostRouter = {
  session,
  login,
  logout,
  settings: settingsRouter,
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
      .handler(({ input, context }) => {
        if (!isInsideIncludePath(context.includePath, input.key)) {
          return outsideIncludePath(input.key);
        }
        const contentType = resolveUploadContentType(
          input.key,
          input.contentType || input.body.type,
        );
        if (!isImageOrVideoType(contentType)) {
          return rejected(
            `Only images and videos can be uploaded (got ${contentType ?? "an unknown type"})`,
          );
        }
        return context.storage.putStoredImage({ ...input, contentType });
      }),
    delete: storageOs
      .input(z.object({ keys: z.array(storageKeySchema) }))
      .output(storedImageDeleteResultSchema)
      .handler(({ input, context }) => {
        const outside = input.keys.find(
          (key) => !isInsideIncludePath(context.includePath, key),
        );
        if (outside !== undefined) return outsideIncludePath(outside);
        return context.storage.deleteStoredImages(input.keys);
      }),
    rename: storageOs
      .input(
        z.object({
          oldKey: storageKeySchema,
          newKey: storageKeySchema,
          overwrite: z.boolean().optional(),
        }),
      )
      .output(storedImageRenameResultSchema)
      .handler(({ input, context }) => {
        for (const key of [input.oldKey, input.newKey]) {
          if (!isInsideIncludePath(context.includePath, key)) {
            return outsideIncludePath(key);
          }
        }
        return context.storage.renameStoredImage(input);
      }),
    download: storageOs
      .input(keyInput)
      .output(storedImageDownloadResultSchema)
      .handler(({ input, context }) =>
        isInsideIncludePath(context.includePath, input.key)
          ? context.storage.downloadStoredImage(input.key)
          : outsideIncludePath(input.key),
      ),
    probe: storageOs
      .input(keyInput)
      .output(storedImageMetadataResultSchema)
      .handler(({ input, context }) =>
        isInsideIncludePath(context.includePath, input.key)
          ? context.storage.probeStoredImage(input.key)
          : outsideIncludePath(input.key),
      ),
    checkAccess: storageOs
      .output(imageStorageAccessResultSchema)
      .handler(({ context }) => context.storage.checkAccess({ origin: "" })),
  },
};

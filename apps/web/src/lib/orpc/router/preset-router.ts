import { createRatelimitMiddleware } from "@orpc/experimental-ratelimit";
import { z } from "zod";
import { sha256 } from "@/lib/utils/hash";
import { defaultKeyTemplate } from "@/lib/s3/s3-key";
import { getDefaultOptions, optionsSchema } from "@/stores/schemas/settings";
import { createHybridLimiter, getClientIp } from "../rate-limit";
import { baseOs } from "./base-router";

/**
 * Preset profile: a self-hosted deployment can put its S3 settings in server
 * environment variables, so a fresh browser only needs the access password
 * instead of re-entering every field. Disabled unless both the password and a
 * valid S3 configuration are present.
 */
const ENV_PREFIX = "S3IP_PRESET_";

type PresetProfile = { name: string; data: z.infer<typeof optionsSchema> };

function readEnv(name: string) {
  const value = process.env[`${ENV_PREFIX}${name}`]?.trim();
  return value ? value : undefined;
}

export function loadPresetFromEnv():
  | { password: string; profile: PresetProfile }
  | undefined {
  const password = readEnv("PASSWORD");
  if (!password) return undefined;

  const defaults = getDefaultOptions();
  const parsed = optionsSchema.safeParse({
    s3: {
      endpoint: readEnv("ENDPOINT") ?? "",
      bucket: readEnv("BUCKET") ?? "",
      region: readEnv("REGION") ?? "auto",
      accKeyId: readEnv("ACCESS_KEY_ID") ?? "",
      secretAccKey: readEnv("SECRET_ACCESS_KEY") ?? "",
      forcePathStyle: readEnv("FORCE_PATH_STYLE") === "true",
      pubUrl: readEnv("PUBLIC_URL") ?? "",
      includePath: readEnv("INCLUDE_PATH") ?? "",
    },
    upload: {
      ...defaults.upload,
      keyTemplate: readEnv("KEY_TEMPLATE") ?? defaultKeyTemplate,
    },
    gallery: defaults.gallery,
  });
  if (!parsed.success) {
    console.warn(
      `[preset] ${ENV_PREFIX}PASSWORD is set but the preset S3 settings are invalid, preset disabled:\n${z.prettifyError(parsed.error)}`,
    );
    return undefined;
  }
  return {
    password,
    profile: { name: readEnv("PROFILE_NAME") ?? "Preset", data: parsed.data },
  };
}

const isTestEnv = process.env.NODE_ENV === "test";

const presetRateLimitByIp = createRatelimitMiddleware({
  limiter: createHybridLimiter({
    prefix: "preset:ratelimit:",
    ...(isTestEnv
      ? { windowMs: 1_000, maxRequests: 10_000 }
      : { windowMs: 60_000, maxRequests: 10 }),
  }),
  key: (options) => `ip:${getClientIp(options.context)}`,
});

const status = baseOs
  .output(z.object({ available: z.boolean() }))
  .handler(() => ({ available: loadPresetFromEnv() !== undefined }));

const fetchPreset = baseOs
  .errors({
    // using BAD_REQUEST instead of NOT_FOUND because nitro erases all header and body
    // in 404 responses
    BAD_REQUEST: {
      data: z.object({ type: z.enum(["not-configured"]) }),
    },
    UNAUTHORIZED: {},
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
  .use(presetRateLimitByIp)
  .output(z.object({ name: z.string(), data: optionsSchema }))
  .handler(async ({ input, errors }) => {
    const preset = loadPresetFromEnv();
    if (!preset) {
      throw errors.BAD_REQUEST({ data: { type: "not-configured" } });
    }
    // compare digests so the comparison time doesn't depend on the password
    const [expected, received] = await Promise.all([
      sha256(preset.password),
      sha256(input.password),
    ]);
    if (expected !== received) {
      throw errors.UNAUTHORIZED();
    }
    return preset.profile;
  });

export const presetRouter = {
  status,
  fetch: fetchPreset,
};

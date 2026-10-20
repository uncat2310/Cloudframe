import { z } from "zod";
import {
  isR2BucketLike,
  type R2BucketLike,
} from "@/modules/image-storage/adapters/r2-binding";
import { optionsSchema, type S3Options } from "@/stores/schemas/settings";

export type SelfHostConfig = {
  /**
   * `r2-binding` on Cloudflare Workers with a `BUCKET` binding; `s3` (R2's S3
   * API with an access key) everywhere else.
   */
  backend: { type: "r2-binding"; bucket: R2BucketLike } | { type: "s3" };
  s3: S3Options;
  password: string;
  sessionSecret: string;
  keyTemplate: string | undefined;
};

/** Name of the R2 bucket binding in `wrangler.jsonc`. */
export const R2_BINDING_NAME = "BUCKET";

export type SelfHostConfigResult =
  | { ok: true; config: SelfHostConfig }
  | { ok: false; problems: string[] };

/** Per-request Worker bindings, which Nitro's Cloudflare preset exposes here. */
function workerEnv() {
  return (globalThis as { __env__?: Record<string, unknown> }).__env__;
}

/** Whether this request is being served by a Cloudflare Worker. */
export function isCloudflareWorker() {
  return workerEnv() !== undefined;
}

/** A Worker binding (R2 bucket, rate limiter…) by name, if bound. */
export function workerBinding(name: string): unknown {
  return workerEnv()?.[name];
}

function readEnv(name: string) {
  const fromWorker = workerEnv()?.[name];
  const value = (
    process.env[name] ?? (typeof fromWorker === "string" ? fromWorker : "")
  ).trim();
  return value ? value : undefined;
}

/** A Cloudframe setting, read from the `CLOUDFRAME_<name>` variable. */
export function readSetting(name: string) {
  return readEnv(`CLOUDFRAME_${name}`);
}

const fieldEnvNames: Partial<Record<keyof S3Options, string>> = {
  endpoint: "R2_ACCOUNT_ID / R2_ENDPOINT",
  bucket: "R2_BUCKET",
  accKeyId: "R2_ACCESS_KEY_ID",
  secretAccKey: "R2_SECRET_ACCESS_KEY",
  pubUrl: "R2_PUBLIC_URL",
};

const BINDING_ENDPOINT = "https://r2-binding.invalid";

let cached: SelfHostConfigResult | undefined;

/**
 * Read the self-hosted R2 settings from server environment variables (or
 * Worker vars/secrets). A complete config is cached because it does not change
 * at runtime; on Workers it is first read inside a request, once bindings
 * exist. An incomplete one is re-read on every request, so fixing the
 * variables takes effect without restarting the server.
 */
export function loadSelfHostConfig(): SelfHostConfigResult {
  if (cached) return cached;

  const problems: string[] = [];
  const password = readSetting("PASSWORD");
  if (!password) problems.push("CLOUDFRAME_PASSWORD is not set");

  const binding = workerBinding(R2_BINDING_NAME);
  const backend: SelfHostConfig["backend"] = isR2BucketLike(binding)
    ? { type: "r2-binding", bucket: binding }
    : { type: "s3" };

  const accountId = readEnv("R2_ACCOUNT_ID");
  const raw: S3Options =
    backend.type === "r2-binding"
      ? {
          // Only the public URL and prefix matter with a binding; the rest
          // just has to satisfy the S3 settings schema shared with the UI.
          endpoint: BINDING_ENDPOINT,
          bucket: readEnv("R2_BUCKET") ?? R2_BINDING_NAME,
          region: "auto",
          accKeyId: "binding",
          secretAccKey: "binding",
          forcePathStyle: false,
          pubUrl: readEnv("R2_PUBLIC_URL") ?? "",
          includePath: readEnv("R2_INCLUDE_PATH") ?? "",
        }
      : {
          endpoint:
            readEnv("R2_ENDPOINT") ??
            (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""),
          bucket: readEnv("R2_BUCKET") ?? "",
          region: "auto",
          accKeyId: readEnv("R2_ACCESS_KEY_ID") ?? "",
          secretAccKey: readEnv("R2_SECRET_ACCESS_KEY") ?? "",
          forcePathStyle: false,
          pubUrl: readEnv("R2_PUBLIC_URL") ?? "",
          includePath: readEnv("R2_INCLUDE_PATH") ?? "",
        };
  const s3 = optionsSchema.shape.s3.safeParse(raw);
  if (
    !s3.success &&
    backend.type === "s3" &&
    workerEnv() &&
    !readEnv("R2_ACCESS_KEY_ID")
  ) {
    problems.push(
      `R2 bucket binding "${R2_BINDING_NAME}" not found: add it under r2_buckets in wrangler.jsonc`,
    );
  } else if (!s3.success) {
    for (const issue of s3.error.issues) {
      const field = issue.path[0] as keyof S3Options;
      const envName = fieldEnvNames[field] ?? String(field);
      problems.push(
        raw[field] === ""
          ? `${envName} is not set`
          : `${envName}: ${issue.message}`,
      );
    }
  }

  if (!s3.success || !password) {
    console.error(
      `[self-host] R2 configuration is incomplete:\n- ${problems.join("\n- ")}`,
    );
    return { ok: false, problems };
  }

  const sessionSecret = readSetting("SESSION_SECRET");
  if (!sessionSecret && backend.type === "r2-binding") {
    console.warn(
      "[self-host] CLOUDFRAME_SESSION_SECRET is not set: login cookies are signed with a key derived from the password alone. Add a long random secret.",
    );
  }

  cached = {
    ok: true,
    config: {
      backend,
      s3: s3.data,
      password,
      // Sessions are signed with a key derived from this secret and the
      // password, so changing the password signs every browser out.
      sessionSecret:
        sessionSecret ?? (backend.type === "s3" ? s3.data.secretAccKey : ""),
      keyTemplate: readSetting("KEY_TEMPLATE"),
    },
  };
  return cached;
}

/** The storage settings the browser may see: everything except credentials. */
export const publicStorageSchema = z.object({
  backend: z.enum(["r2-binding", "s3"]),
  endpoint: z.string(),
  bucket: z.string(),
  pubUrl: z.string(),
  includePath: z.string(),
});

export function toPublicStorage({
  backend,
  s3,
}: SelfHostConfig): z.infer<typeof publicStorageSchema> {
  return {
    backend: backend.type,
    endpoint: s3.endpoint,
    bucket: s3.bucket,
    pubUrl: s3.pubUrl,
    includePath: s3.includePath,
  };
}

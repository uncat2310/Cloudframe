import { z } from "zod";
import { optionsSchema, type S3Options } from "@/stores/schemas/settings";

export type SelfHostConfig = {
  s3: S3Options;
  password: string;
  sessionSecret: string;
  keyTemplate: string | undefined;
};

export type SelfHostConfigResult =
  | { ok: true; config: SelfHostConfig }
  | { ok: false; problems: string[] };

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const fieldEnvNames: Partial<Record<keyof S3Options, string>> = {
  endpoint: "R2_ACCOUNT_ID / R2_ENDPOINT",
  bucket: "R2_BUCKET",
  accKeyId: "R2_ACCESS_KEY_ID",
  secretAccKey: "R2_SECRET_ACCESS_KEY",
  pubUrl: "R2_PUBLIC_URL",
};

let cached: SelfHostConfigResult | undefined;

/**
 * Read the self-hosted R2 settings from server environment variables. The
 * result is cached because the environment does not change at runtime.
 */
export function loadSelfHostConfig(): SelfHostConfigResult {
  if (cached) return cached;

  const problems: string[] = [];
  const password = readEnv("S3IP_PASSWORD");
  if (!password) problems.push("S3IP_PASSWORD is not set");

  const accountId = readEnv("R2_ACCOUNT_ID");
  const endpoint =
    readEnv("R2_ENDPOINT") ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  const raw: S3Options = {
    endpoint,
    bucket: readEnv("R2_BUCKET") ?? "",
    region: "auto",
    accKeyId: readEnv("R2_ACCESS_KEY_ID") ?? "",
    secretAccKey: readEnv("R2_SECRET_ACCESS_KEY") ?? "",
    forcePathStyle: false,
    pubUrl: readEnv("R2_PUBLIC_URL") ?? "",
    includePath: readEnv("R2_INCLUDE_PATH") ?? "",
  };
  const s3 = optionsSchema.shape.s3.safeParse(raw);
  if (!s3.success) {
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
    cached = { ok: false, problems };
    console.error(
      `[self-host] R2 configuration is incomplete:\n- ${problems.join("\n- ")}`,
    );
    return cached;
  }

  cached = {
    ok: true,
    config: {
      s3: s3.data,
      password,
      // Sessions are signed with a key derived from this secret and the
      // password, so changing the password signs every browser out.
      sessionSecret: readEnv("S3IP_SESSION_SECRET") ?? s3.data.secretAccKey,
      keyTemplate: readEnv("S3IP_KEY_TEMPLATE"),
    },
  };
  return cached;
}

/** The storage settings the browser may see: everything except credentials. */
export const publicStorageSchema = z.object({
  endpoint: z.string(),
  bucket: z.string(),
  pubUrl: z.string(),
  includePath: z.string(),
});

export function toPublicStorage(
  s3: S3Options,
): z.infer<typeof publicStorageSchema> {
  return {
    endpoint: s3.endpoint,
    bucket: s3.bucket,
    pubUrl: s3.pubUrl,
    includePath: s3.includePath,
  };
}

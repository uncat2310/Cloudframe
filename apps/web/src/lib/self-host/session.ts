import type { SelfHostConfig } from "./config";

const COOKIE_NAME = "s3ip_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function sha256Bytes(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

async function signingKey(config: SelfHostConfig) {
  return crypto.subtle.importKey(
    "raw",
    await sha256Bytes(`${config.sessionSecret}\0${config.password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(config: SelfHostConfig, payload: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(config),
    encoder.encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

/** Constant-time password check (digests have a fixed length). */
export async function passwordMatches(config: SelfHostConfig, input: string) {
  const [expected, received] = await Promise.all([
    sha256Bytes(config.password),
    sha256Bytes(input),
  ]);
  return equalBytes(expected, received);
}

function cookieAttributes(secure: boolean, maxAge: number) {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export async function createSessionCookie(
  config: SelfHostConfig,
  secure: boolean,
) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const value = `${expiresAt}.${await sign(config, String(expiresAt))}`;
  return `${COOKIE_NAME}=${value}; ${cookieAttributes(secure, SESSION_MAX_AGE_SECONDS)}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${COOKIE_NAME}=; ${cookieAttributes(secure, 0)}`;
}

function readCookie(cookieHeader: string | null | undefined, name: string) {
  for (const part of cookieHeader?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export async function hasValidSession(
  config: SelfHostConfig,
  headers: Headers | undefined,
) {
  const value = readCookie(headers?.get("cookie"), COOKIE_NAME);
  const [expiresAt, signature] = value?.split(".") ?? [];
  if (!expiresAt || !signature) return false;
  if (Number(expiresAt) * 1000 < Date.now()) return false;
  const expected = await sign(config, expiresAt);
  return equalBytes(encoder.encode(expected), encoder.encode(signature));
}

/** Only mark the cookie Secure behind HTTPS, so plain-HTTP LAN use still works. */
export function isSecureRequest(headers: Headers | undefined) {
  return (
    headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
    headers?.get("cf-visitor")?.includes('"https"') === true
  );
}

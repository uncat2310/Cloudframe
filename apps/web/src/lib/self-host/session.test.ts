import { afterEach, describe, expect, it, vi } from "vitest";
import type { SelfHostConfig } from "./config";
import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  isSecureRequest,
  passwordMatches,
} from "./session";

const config: SelfHostConfig = {
  s3: {
    endpoint: "https://account.r2.cloudflarestorage.com",
    bucket: "images",
    region: "auto",
    accKeyId: "key",
    secretAccKey: "secret",
    forcePathStyle: false,
    pubUrl: "https://img.example.com",
    includePath: "",
  },
  password: "correct horse",
  sessionSecret: "secret",
  keyTemplate: undefined,
};

function requestWith(setCookie: string) {
  return new Headers({ cookie: setCookie.split(";")[0] });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("self-host session", () => {
  it("checks the password", async () => {
    expect(await passwordMatches(config, "correct horse")).toBe(true);
    expect(await passwordMatches(config, "correct hors")).toBe(false);
  });

  it("accepts a cookie it issued", async () => {
    const cookie = await createSessionCookie(config, false);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toMatch(/Secure/);
    expect(await hasValidSession(config, requestWith(cookie))).toBe(true);
  });

  it("rejects missing, tampered or cleared cookies", async () => {
    const cookie = await createSessionCookie(config, true);
    expect(cookie).toMatch(/Secure/);
    const [name, value] = cookie.split(";")[0].split("=");
    const [expiresAt, signature] = value.split(".");

    expect(await hasValidSession(config, new Headers())).toBe(false);
    expect(
      await hasValidSession(
        config,
        new Headers({
          cookie: `${name}=${Number(expiresAt) + 1}.${signature}`,
        }),
      ),
    ).toBe(false);
    expect(
      await hasValidSession(config, requestWith(clearSessionCookie(false))),
    ).toBe(false);
  });

  it("signs out every browser when the password changes", async () => {
    const cookie = await createSessionCookie(config, false);
    expect(
      await hasValidSession(
        { ...config, password: "new password" },
        requestWith(cookie),
      ),
    ).toBe(false);
  });

  it("expires sessions after 30 days", async () => {
    const cookie = await createSessionCookie(config, false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await hasValidSession(config, requestWith(cookie))).toBe(false);
  });

  it("detects HTTPS behind a reverse proxy", () => {
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "https" }))).toBe(
      true,
    );
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "http" }))).toBe(
      false,
    );
    expect(isSecureRequest(undefined)).toBe(false);
  });
});

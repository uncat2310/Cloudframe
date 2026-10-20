import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyStorageKeys, storageKeys } from "./storage-keys";

describe("migrateLegacyStorageKeys", () => {
  beforeEach(() => localStorage.clear());

  it("moves values from the old s3ip: keys to the cloudframe: keys", () => {
    localStorage.setItem("s3ip:locale", "en");
    localStorage.setItem("s3ip:root:theme", "dark");
    localStorage.setItem("s3ip:profiles-list", '{"list":[],"current":0}');

    migrateLegacyStorageKeys(localStorage);

    expect(localStorage.getItem(storageKeys.locale)).toBe("en");
    expect(localStorage.getItem(storageKeys.theme)).toBe("dark");
    expect(localStorage.getItem(storageKeys.profiles)).toBe(
      '{"list":[],"current":0}',
    );
    expect(localStorage.getItem("s3ip:locale")).toBeNull();
    expect(localStorage.getItem("s3ip:root:theme")).toBeNull();
    expect(localStorage.getItem("s3ip:profiles-list")).toBeNull();
  });

  it("keeps a value already saved under the new key", () => {
    localStorage.setItem("s3ip:locale", "en");
    localStorage.setItem(storageKeys.locale, "zh");

    migrateLegacyStorageKeys(localStorage);

    expect(localStorage.getItem(storageKeys.locale)).toBe("zh");
    expect(localStorage.getItem("s3ip:locale")).toBeNull();
  });

  it("leaves unrelated and pre-v3 upstream keys alone", () => {
    localStorage.setItem("s3ip:options", "{}");
    localStorage.setItem("other", "1");

    migrateLegacyStorageKeys(localStorage);

    expect(localStorage.getItem("s3ip:options")).toBe("{}");
    expect(localStorage.getItem("other")).toBe("1");
  });

  it("does nothing without storage", () => {
    expect(() => migrateLegacyStorageKeys(undefined)).not.toThrow();
  });
});

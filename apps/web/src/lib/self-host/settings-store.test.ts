import { afterEach, describe, expect, it } from "vitest";
import { getSettingsStore, type SyncedSettings } from "./settings-store";

const value: SyncedSettings = {
  upload: {
    keyTemplate: "i/{{ulid}}.{{ext}}",
    keyTemplatePresets: [{ key: "1", value: "a/{{filename}}.{{ext}}" }],
    compressionOption: { type: "avif", quality: 60 },
  },
  gallery: { autoRefresh: false },
};

const env = globalThis as { __env__?: Record<string, unknown> };

function fakeKv() {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, stored: string) => {
      data.set(key, stored);
    },
  };
}

afterEach(() => {
  delete env.__env__;
});

describe("getSettingsStore", () => {
  it("is unavailable without a KV binding or data directory", () => {
    env.__env__ = {};
    expect(getSettingsStore()).toBeUndefined();
  });

  it("reads back what it wrote to the SETTINGS binding", async () => {
    const kv = fakeKv();
    env.__env__ = { SETTINGS: kv };
    const store = getSettingsStore()!;
    expect(store.kind).toBe("workers-kv");
    expect(await store.read()).toBeNull();
    await store.write(value);
    expect(await store.read()).toEqual(value);
  });

  it("treats stored data that isn't valid settings as missing", async () => {
    const kv = fakeKv();
    env.__env__ = { SETTINGS: kv };
    const store = getSettingsStore()!;
    for (const stored of ["not json", "{}", '{"upload":{"keyTemplate":""}}']) {
      kv.data.set("settings", stored);
      expect(await store.read()).toBeNull();
    }
  });
});

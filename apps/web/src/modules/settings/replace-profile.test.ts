import { createStore } from "jotai";
import { beforeEach, describe, expect, it } from "vitest";

import { profileGenerationAtom } from "@/modules/settings/profile-generation";
import {
  naturalSizesAtom,
  setNaturalSizesAtom,
} from "@/stores/atoms/photo-size";
import { settings } from "@/stores/atoms/settings";
import { getDefaultOptions } from "@/stores/schemas/settings";
import { replaceSettingsProfileAtom } from "./replace-profile";

const serverProfile = {
  ...getDefaultOptions(),
  s3: {
    endpoint: "https://r2-binding.invalid",
    bucket: "images",
    region: "auto",
    accKeyId: "server-managed",
    secretAccKey: "server-managed",
    forcePathStyle: false,
    pubUrl: "https://img.example.com",
    includePath: "",
  },
};

beforeEach(() => {
  localStorage.clear();
});

describe("replaceSettingsProfileAtom", () => {
  it("resets profile-scoped caches once when the active profile changes", () => {
    const store = createStore();
    store.sub(naturalSizesAtom, () => {});
    store.set(setNaturalSizesAtom, ["i/old.webp", [1200, 800]]);

    const outcome = store.set(replaceSettingsProfileAtom, {
      type: "apply-imported",
      value: { list: [["Cloudflare R2", serverProfile]], current: 0 },
    });

    expect(outcome).toMatchObject({ status: "applied", profileReplaced: true });
    expect(store.get(profileGenerationAtom)).toBe(1);
    expect(store.get(naturalSizesAtom)[0].size).toBe(0);
    expect(store.get(settings.storage).validation.status).toBe("valid");
  });

  it("leaves everything alone when nothing changes", () => {
    const store = createStore();
    const replacement = {
      type: "apply-imported" as const,
      value: {
        list: [["Cloudflare R2", serverProfile]] as [
          string,
          typeof serverProfile,
        ][],
        current: 0,
      },
    };
    store.set(replaceSettingsProfileAtom, replacement);
    store.set(setNaturalSizesAtom, ["i/kept.webp", [10, 10]]);

    const outcome = store.set(replaceSettingsProfileAtom, replacement);

    expect(outcome).toMatchObject({
      status: "unchanged",
      profileReplaced: false,
    });
    expect(store.get(profileGenerationAtom)).toBe(1);
    expect(store.get(naturalSizesAtom)[0].size).toBe(1);
  });
});

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";

import { settings } from "@/stores/atoms/settings";
import { getDefaultOptions } from "@/stores/schemas/settings";
import { applyPresetProfileAtom } from "./apply-preset";

const presetOptions = {
  ...getDefaultOptions(),
  s3: {
    endpoint: "https://s3.example.com",
    bucket: "images",
    region: "auto",
    accKeyId: "key",
    secretAccKey: "secret",
    forcePathStyle: false,
    pubUrl: "https://img.example.com",
    includePath: "",
  },
};

describe("applyPresetProfileAtom", () => {
  it("replaces the untouched default profile list", () => {
    const store = createStore();
    store.set(applyPresetProfileAtom, { name: "Preset", data: presetOptions });

    expect(store.get(settings.profiles).profiles).toEqual({
      list: [["Preset", presetOptions]],
      current: 0,
    });
    expect(store.get(settings.storage).validation.status).toBe("valid");
  });

  it("adds the preset next to existing profiles and activates it", () => {
    const store = createStore();
    store.set(settings.profiles, {
      type: "import",
      value: { name: "Other", data: getDefaultOptions() },
    });
    store.set(applyPresetProfileAtom, { name: "Preset", data: presetOptions });

    const { profiles } = store.get(settings.profiles);
    expect(profiles.list.map(([name]) => name)).toEqual([
      "Default",
      "Other",
      "Preset",
    ]);
    expect(profiles.current).toBe(2);
  });

  it("overwrites an existing profile with the same name", () => {
    const store = createStore();
    store.set(settings.profiles, {
      type: "import",
      value: { name: "Preset", data: getDefaultOptions() },
    });
    store.set(applyPresetProfileAtom, { name: "Preset", data: presetOptions });

    const { profiles } = store.get(settings.profiles);
    expect(profiles.list).toEqual([
      ["Default", getDefaultOptions()],
      ["Preset", presetOptions],
    ]);
    expect(profiles.current).toBe(1);
  });
});

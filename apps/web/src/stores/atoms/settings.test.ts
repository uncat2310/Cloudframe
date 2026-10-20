import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { Provider, useAtomValue } from "jotai";

import { getDefaultOptions } from "../schemas/settings";
import { settings } from "./settings";

beforeEach(() => localStorage.clear());

function useSettingsTestSeam() {
  return {
    storage: useAtomValue(settings.storage),
    upload: useAtomValue(settings.upload),
    gallery: useAtomValue(settings.gallery),
  };
}

describe("persisted settings", () => {
  it("loads the existing versioned envelope without rewriting its shape", async () => {
    localStorage.setItem(
      "cloudframe:profiles-list",
      JSON.stringify({
        data: {
          list: [
            [
              "Default",
              {
                ...getDefaultOptions(),
                upload: {
                  ...getDefaultOptions().upload,
                  keyTemplate: "A_TEST/{{ulid-dayslice}}/{{ext}}",
                },
              },
            ],
          ],
          current: 0,
        },
        version: 3,
      }),
    );

    const { result } = await renderHook(useSettingsTestSeam, {
      wrapper: Provider,
    });
    expect(result.current.upload.keyTemplate).toMatch(/A_TEST/);
  });

  it.each([
    ["empty", undefined],
    ["corrupted", { random: "thing" }],
    ["unknown version", { version: 999, data: "random" }],
  ])("uses defaults for %s storage", async (_name, stored) => {
    if (stored !== undefined) {
      localStorage.setItem("cloudframe:profiles-list", JSON.stringify(stored));
    }
    const { result } = await renderHook(useSettingsTestSeam, {
      wrapper: Provider,
    });
    const defaults = getDefaultOptions();
    expect(result.current.storage.raw).toEqual(defaults.s3);
    expect(result.current.upload).toEqual(defaults.upload);
    expect(result.current.gallery).toEqual(defaults.gallery);
  });
});

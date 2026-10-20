import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { Provider, useAtomValue, useSetAtom } from "jotai";
import { produce } from "immer";

import { migrateFromV1 } from "../schemas/settings/migrations/v1-v3";
import { getDefaultOptions } from "../schemas/settings";
import { settings } from "./settings";

beforeEach(() => localStorage.clear());

function useSettingsTestSeam() {
  const projection = useAtomValue(settings.profiles);
  return {
    ...projection,
    replace: useSetAtom(settings.replaceProfile),
    updateStorage: useSetAtom(settings.storage),
  };
}

function currentOptions(
  profiles: ReturnType<typeof useSettingsTestSeam>["profiles"],
) {
  return profiles.list[profiles.current][1];
}

describe("persisted settings profiles", () => {
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
    expect(currentOptions(result.current.profiles).upload.keyTemplate).toMatch(
      /A_TEST/,
    );
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
    expect(currentOptions(result.current.profiles)).toEqual(
      getDefaultOptions(),
    );
  });
});

describe("v1 profile parsing", () => {
  const validV1Config = {
    s3: {
      endpoint: "https://example.com",
      bucket: "image-dev",
      region: "auto",
      accKeyId: "1234567890",
      secretAccKey: "1234567890",
      pubUrl: "https://pub.example.com",
      forcePathStyle: false,
    },
    app: {
      noLongerShowRootPage: true,
      convertType: "none",
      compressionMaxSize: "",
      compressionMaxWidthOrHeight: "",
      keyTemplate: "test/{{random}}/{{ext}}",
      enableAutoRefresh: false,
      enableFuzzySearch: true,
      fuzzySearchThreshold: 0.6,
    },
  };

  it("migrates valid string and object inputs", () => {
    for (const input of [
      JSON.stringify(validV1Config),
      structuredClone(validV1Config),
    ]) {
      const result = migrateFromV1(input);
      expect(result).not.toBeInstanceOf(Error);
      if (result instanceof Error) throw result;
      expect(result.s3.endpoint).toBe(validV1Config.s3.endpoint);
      expect(result.upload.keyTemplate).toBe(validV1Config.app.keyTemplate);
    }
  });

  it("uses the default key template for an empty legacy template", () => {
    const input = structuredClone(validV1Config);
    input.app.keyTemplate = "";
    const result = migrateFromV1(input);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) throw result;
    expect(result.upload.keyTemplate).toBe(
      getDefaultOptions().upload.keyTemplate,
    );
  });

  it.each(["invalid", 1])("rejects invalid input %j", (input) => {
    expect(migrateFromV1(input)).toBeInstanceOf(Error);
  });
});

describe("sync-format projection and replacement", () => {
  it("omits current and preserves active profile by name", async () => {
    const { result, act } = await renderHook(useSettingsTestSeam, {
      wrapper: Provider,
    });
    await act(() =>
      result.current.replace({
        type: "apply-imported",
        value: {
          current: 2,
          list: [
            ["Profile A", getDefaultOptions()],
            ["Profile B", getDefaultOptions()],
            ["Profile C", getDefaultOptions()],
          ],
        },
      }),
    );
    expect(result.current.sync.data).not.toHaveProperty("current");

    await act(() =>
      result.current.replace({
        type: "apply-sync",
        value: {
          version: 3,
          data: {
            list: [
              ["Profile C", getDefaultOptions()],
              ["Profile B", getDefaultOptions()],
              ["Profile A", getDefaultOptions()],
            ],
          },
        },
      }),
    );
    expect(result.current.profiles.current).toBe(0);
    expect(result.current.profiles.list[0][0]).toBe("Profile C");
  });

  it("uses the old index when the active name disappears", async () => {
    const { result, act } = await renderHook(useSettingsTestSeam, {
      wrapper: Provider,
    });
    await act(() =>
      result.current.replace({
        type: "apply-imported",
        value: {
          current: 1,
          list: [
            ["A", getDefaultOptions()],
            ["B", getDefaultOptions()],
            ["C", getDefaultOptions()],
          ],
        },
      }),
    );
    await act(() =>
      result.current.replace({
        type: "apply-sync",
        value: {
          version: 3,
          data: {
            list: [
              ["X", getDefaultOptions()],
              ["Y", getDefaultOptions()],
            ],
          },
        },
      }),
    );
    expect(result.current.profiles.current).toBe(1);
    expect(result.current.profiles.list[1][0]).toBe("Y");
  });

  it("falls back to zero when the old index is out of bounds", async () => {
    const { result, act } = await renderHook(useSettingsTestSeam, {
      wrapper: Provider,
    });
    await act(() =>
      result.current.replace({
        type: "apply-imported",
        value: {
          current: 2,
          list: [
            ["A", getDefaultOptions()],
            ["B", getDefaultOptions()],
            ["C", getDefaultOptions()],
          ],
        },
      }),
    );
    await act(() =>
      result.current.replace({
        type: "apply-sync",
        value: {
          version: 3,
          data: { list: [["Only", getDefaultOptions()]] },
        },
      }),
    );
    expect(result.current.profiles.current).toBe(0);
  });

  it("supports function updates and equal round trips", async () => {
    const { result, act } = await renderHook(useSettingsTestSeam, {
      wrapper: Provider,
    });
    const before = result.current.sync;
    await act(() =>
      result.current.replace({ type: "apply-sync", value: before }),
    );
    expect(result.current.sync).toBe(before);

    await act(() =>
      result.current.replace({
        type: "apply-sync",
        value: (current) =>
          produce(current, (draft) => {
            draft.data.list[0][1].s3.bucket = "updated-bucket";
          }),
      }),
    );
    expect(result.current.profiles.list[0][1].s3.bucket).toBe("updated-bucket");
  });
});

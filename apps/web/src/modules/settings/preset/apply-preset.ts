import deepEqual from "fast-deep-equal";
import { produce } from "immer";
import { atom } from "jotai";
import { z } from "zod";

import { getDefaultProfiles, optionsSchema } from "@/stores/schemas/settings";
import { replaceSettingsProfileAtom } from "../replace-profile";

export type PresetProfile = {
  name: string;
  data: z.infer<typeof optionsSchema>;
};

/**
 * Activate the preset profile fetched from the server. An existing profile
 * with the same name is overwritten, and an untouched default profile list is
 * replaced instead of keeping an empty "Default" profile around.
 */
export const applyPresetProfileAtom = atom(
  null,
  (_get, set, preset: PresetProfile) =>
    set(replaceSettingsProfileAtom, {
      type: "apply-imported",
      value: (previous) => {
        if (deepEqual(previous, getDefaultProfiles())) {
          return { list: [[preset.name, preset.data]], current: 0 };
        }
        return produce(previous, (draft) => {
          const index = draft.list.findIndex(([name]) => name === preset.name);
          if (index === -1) {
            draft.list.push([preset.name, preset.data]);
            draft.current = draft.list.length - 1;
          } else {
            draft.list[index][1] = preset.data;
            draft.current = index;
          }
        });
      },
    }),
);

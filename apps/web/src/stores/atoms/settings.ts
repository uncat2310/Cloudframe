import { atomWithStorageMigration } from "@/lib/atoms/atomWithStorageMigration";
import deepEqual from "fast-deep-equal";
import { enableMapSet, produce } from "immer";
import { atom, type SetStateAction } from "jotai";
import { focusAtom } from "jotai-optics";
import { createJSONStorage, selectAtom } from "jotai/utils";
import { z } from "zod";

import {
  type CreateImageStorageFromSettings,
  type ImageStorageFailure,
  type StorageAccessMethod,
} from "@/modules/image-storage";
import { createImageStorage } from "@/modules/self-host/create-image-storage";
import {
  SETTINGS_STORE_VERSION,
  getDefaultStoredSettings,
  optionsSchema,
  profilesSchemaForLoad,
  storedSettingsSchema,
} from "../schemas/settings";
import { storageKeys } from "@/lib/storage-keys";

enableMapSet();

const SETTINGS_STORE_KEY = storageKeys.profiles;
const replacementProfilesSchema = profilesSchemaForLoad.superRefine(
  (profiles, context) => {
    if (
      !Number.isInteger(profiles.current) ||
      profiles.current < 0 ||
      profiles.current >= profiles.list.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Current profile index is out of range",
        path: ["current"],
      });
    }
  },
);

export type SettingsProfileReplacement = {
  type: "apply-imported";
  value: SetStateAction<z.infer<typeof profilesSchemaForLoad>>;
};

const idleAccess = { status: "idle" as const };
const testingAccess = { status: "testing" as const };

function activeOptions(value: z.infer<typeof profilesSchemaForLoad>) {
  return value.list.at(value.current)?.[1] ?? value.list[0][1];
}

function normalizeCurrent(value: z.infer<typeof profilesSchemaForLoad>) {
  return Number.isInteger(value.current) &&
    value.current >= 0 &&
    value.current < value.list.length
    ? value
    : { ...value, current: 0 };
}

function validateStorage(raw: z.infer<typeof optionsSchema.shape.s3>) {
  const result = optionsSchema.shape.s3.safeParse(raw);
  if (result.success) {
    return { status: "valid" as const, value: result.data };
  }
  const errors: Partial<
    Record<
      keyof z.infer<typeof optionsSchema.shape.s3>,
      Array<{ code: string; message: string }>
    >
  > = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || !(field in raw)) continue;
    const key = field as keyof typeof raw;
    (errors[key] ??= []).push({ code: issue.code, message: issue.message });
  }
  return { status: "invalid" as const, errors };
}

function activeProfile(value: z.infer<typeof profilesSchemaForLoad>) {
  return value.list.at(value.current) ?? value.list[0];
}

function replacementOutcome(
  previous: z.infer<typeof profilesSchemaForLoad>,
  next: z.infer<typeof profilesSchemaForLoad>,
) {
  const [previousActiveName, previousOptions] = activeProfile(previous);
  const [nextActiveName, nextOptions] = activeProfile(next);
  const changed = !deepEqual(previous, next);
  const activeIdentityPreserved =
    previousActiveName === nextActiveName ||
    (previous.current === next.current &&
      previous.list.length === next.list.length &&
      deepEqual(
        previous,
        produce(next, (draft) => {
          draft.list[draft.current][0] = previousActiveName;
        }),
      ));
  return {
    status: changed ? ("applied" as const) : ("unchanged" as const),
    changed,
    profileReplaced:
      changed &&
      (!activeIdentityPreserved || !deepEqual(previousOptions, nextOptions)),
    previousActiveName,
    nextActiveName,
  };
}

function preserveEqualActiveBranches(
  previous: z.infer<typeof profilesSchemaForLoad>,
  next: z.infer<typeof profilesSchemaForLoad>,
) {
  const previousOptions = activeProfile(previous)[1];
  const nextOptions = activeProfile(next)[1];
  return produce(next, (draft) => {
    const draftOptions = draft.list[draft.current][1];
    if (deepEqual(previousOptions.s3, nextOptions.s3)) {
      draftOptions.s3 = previousOptions.s3;
    }
    if (deepEqual(previousOptions.upload, nextOptions.upload)) {
      draftOptions.upload = previousOptions.upload;
    }
    if (deepEqual(previousOptions.gallery, nextOptions.gallery)) {
      draftOptions.gallery = previousOptions.gallery;
    }
  });
}

function storageSemanticsChanged(
  previous: z.infer<typeof profilesSchemaForLoad>,
  next: z.infer<typeof profilesSchemaForLoad>,
) {
  return !deepEqual(
    validateStorage(activeOptions(previous).s3),
    validateStorage(activeOptions(next).s3),
  );
}

function projectStorage(
  raw: z.infer<typeof optionsSchema.shape.s3>,
  revision: number,
) {
  const validation = validateStorage(raw);
  return {
    raw,
    validation,
    revision,
    targetId:
      validation.status === "valid"
        ? JSON.stringify([
            validation.value.endpoint,
            validation.value.bucket,
            validation.value.includePath,
          ])
        : undefined,
  };
}

export function createSettings({
  storage,
  createStorage = createImageStorage,
  getOrigin = () =>
    typeof window === "undefined" ? "" : window.location.origin,
}: {
  storage?: Storage;
  createStorage?: CreateImageStorageFromSettings;
  getOrigin?: () => string;
} = {}) {
  const persistence = storage
    ? createJSONStorage<unknown>(() => storage)
    : undefined;
  const { valueAtom: persistedProfiles } = atomWithStorageMigration(
    SETTINGS_STORE_KEY,
    {
      initialFn: getDefaultStoredSettings,
      schema: storedSettingsSchema,
      version: SETTINGS_STORE_VERSION,
      migrate: (stored, oldVersionNumber) => {
        console.error(
          `Should not have any migration for now, but got ${oldVersionNumber}, stored: ${JSON.stringify(stored)}`,
        );
        return getDefaultStoredSettings();
      },
    },
    {
      storage: persistence,
    },
  );

  const accessState = atom({
    status: idleAccess as
      | typeof idleAccess
      | typeof testingAccess
      | { status: "success"; allowedMethods: readonly StorageAccessMethod[] }
      | { status: "failed"; error: ImageStorageFailure }
      | {
          status: "cors-incomplete";
          allowedMethods: readonly StorageAccessMethod[];
          missingMethods: readonly StorageAccessMethod[];
        },
    lifecycle: "never" as "never" | "mounted" | "disposed",
    lifetime: 0,
    request: 0,
    revision: 0,
  });
  accessState.onMount = (update) => {
    update((current) => ({
      ...current,
      lifecycle: "mounted",
      lifetime: current.lifetime + 1,
    }));
    return () => {
      update((current) => ({
        ...current,
        status: idleAccess,
        lifecycle: "disposed",
        lifetime: current.lifetime + 1,
        request: current.request + 1,
      }));
    };
  };
  const normalizedProfiles = selectAtom(
    persistedProfiles,
    (profiles, previous?: z.infer<typeof profilesSchemaForLoad>) => {
      const normalized = normalizeCurrent(profiles);
      return previous
        ? preserveEqualActiveBranches(previous, normalized)
        : normalized;
    },
    deepEqual,
  );
  const storageProjection = selectAtom(
    normalizedProfiles,
    (profiles, previous?: ReturnType<typeof projectStorage>) => {
      const raw = activeOptions(profiles).s3;
      if (previous && deepEqual(previous.raw, raw)) return previous;
      const projected = projectStorage(raw, previous?.revision ?? 0);
      const semanticsChanged =
        previous !== undefined &&
        !deepEqual(previous.validation, projected.validation);
      return {
        ...projected,
        validation:
          previous && !semanticsChanged
            ? previous.validation
            : projected.validation,
        revision: projected.revision + (semanticsChanged ? 1 : 0),
      };
    },
  );
  const revision = selectAtom(
    storageProjection,
    (projection) => projection.revision,
  );
  const validation = selectAtom(
    storageProjection,
    (projection) => projection.validation,
  );
  const access = atom((get) => {
    const state = get(accessState);
    return state.revision === get(revision) ? state.status : idleAccess;
  });
  const root = atom(
    (get) => get(normalizedProfiles),
    (
      get,
      set,
      update: SetStateAction<z.infer<typeof profilesSchemaForLoad>>,
    ) => {
      const previous = get(normalizedProfiles);
      const next = typeof update === "function" ? update(previous) : update;
      if (deepEqual(previous, next)) return false;
      if (storageSemanticsChanged(previous, next)) {
        set(accessState, (current) => ({
          ...current,
          status: idleAccess,
          request: current.request + 1,
        }));
      }
      set(persistedProfiles, next);
      return true;
    },
  );
  const options = atom(
    (get) => activeOptions(get(root)),
    (get, set, update: SetStateAction<z.infer<typeof optionsSchema>>) => {
      const profiles = get(root);
      set(
        root,
        produce(profiles, (draft) => {
          const previous = draft.list[draft.current][1];
          draft.list[draft.current][1] =
            typeof update === "function" ? update(previous) : update;
        }),
      );
    },
  );
  const rawStorage = focusAtom(options, (optic) => optic.prop("s3"));
  const upload = focusAtom(options, (optic) => optic.prop("upload"));
  const gallery = focusAtom(options, (optic) => optic.prop("gallery"));
  const storageAtom = atom(
    (get) => ({ ...get(storageProjection), access: get(access) }),
    (
      get,
      set,
      action:
        | {
            type: "update";
            value: SetStateAction<z.infer<typeof optionsSchema.shape.s3>>;
          }
        | { type: "test-access" },
    ) => {
      if (action.type === "test-access") {
        return testStorageAccess();
      }
      const previous = get(rawStorage);
      const next =
        typeof action.value === "function"
          ? action.value(previous)
          : action.value;
      if (deepEqual(previous, next)) return { status: "unchanged" as const };
      set(rawStorage, next);
      return { status: "updated" as const };

      async function testStorageAccess() {
        const lifecycle = get(accessState);
        if (lifecycle.lifecycle === "disposed") {
          return { status: "disposed" as const };
        }
        const current = get(validation);
        if (current.status === "invalid") {
          return {
            status: "invalid-settings" as const,
            errors: current.errors,
          };
        }

        const request = lifecycle.request + 1;
        const startedRevision = get(revision);
        const startedLifetime = lifecycle.lifetime;
        set(accessState, {
          ...lifecycle,
          status: testingAccess,
          request,
          revision: startedRevision,
        });

        let outcome:
          | {
              status: "success";
              allowedMethods: readonly StorageAccessMethod[];
            }
          | { status: "failed"; error: ImageStorageFailure }
          | {
              status: "cors-incomplete";
              allowedMethods: readonly StorageAccessMethod[];
              missingMethods: readonly StorageAccessMethod[];
            };
        try {
          const result = await createStorage(current.value).checkAccess({
            origin: getOrigin(),
          });
          if (result.ok) {
            outcome = {
              status: "success",
              allowedMethods: result.value.allowedMethods,
            };
          } else if (result.error.reason === "cors-incomplete") {
            outcome = {
              status: "cors-incomplete",
              allowedMethods: result.error.allowedMethods,
              missingMethods: result.error.missingMethods,
            };
          } else {
            outcome = { status: "failed", error: result.error };
          }
        } catch (cause) {
          outcome = {
            status: "failed",
            error: {
              reason: "unknown",
              message: cause instanceof Error ? cause.message : "Unknown error",
              cause,
            },
          };
        }

        const latest = get(accessState);
        if (
          latest.lifecycle !== "disposed" &&
          latest.lifetime === startedLifetime &&
          latest.request === request &&
          get(revision) === startedRevision
        ) {
          set(accessState, { ...latest, status: outcome });
        }
        return outcome;
      }
    },
  );
  const replaceProfile = atom(
    null,
    (get, set, action: SettingsProfileReplacement) => {
      const previous = get(root);
      const candidate =
        typeof action.value === "function"
          ? action.value(previous)
          : action.value;
      const parsed = replacementProfilesSchema.safeParse(candidate);
      if (!parsed.success) {
        return {
          status: "invalid" as const,
          changed: false,
          profileReplaced: false,
          error: parsed.error,
        };
      }
      const next = preserveEqualActiveBranches(previous, parsed.data);
      const outcome = replacementOutcome(previous, next);
      if (outcome.changed) set(root, next);
      return outcome;
    },
  );

  return { storage: storageAtom, upload, gallery, replaceProfile };
}
export const settings = createSettings();

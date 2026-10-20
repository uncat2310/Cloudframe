import { createStorageMigration } from "@/lib/atoms/atomWithStorageMigration";
import { z } from "zod";

import {
  SETTINGS_STORE_VERSION,
  getDefaultStoredSettings,
  storedSettingsSchema,
} from ".";

const migrateRawData = createStorageMigration({
  initialFn: getDefaultStoredSettings,
  schema: storedSettingsSchema,
  version: SETTINGS_STORE_VERSION,
  migrate: () => getDefaultStoredSettings(),
});

export function storedSettingsIntoSyncFormat(
  value: z.infer<typeof storedSettingsSchema>,
) {
  const { current: _, ...data } = value;
  return { version: SETTINGS_STORE_VERSION, data };
}

export function settingsForSyncFromUnknown(rawData: unknown) {
  return storedSettingsIntoSyncFormat(migrateRawData(rawData));
}

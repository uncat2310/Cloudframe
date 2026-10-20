import { z } from "zod";
import { optionsSchema } from "@/stores/schemas/settings";
import { isCloudflareWorker, readSetting, workerBinding } from "./config";

/**
 * Settings every browser shares once signed in: upload (key template,
 * presets, compression) and gallery options. Storage comes from the server
 * config, and language and theme stay per browser.
 */
export const syncedSettingsSchema = z.object({
  upload: optionsSchema.shape.upload,
  gallery: optionsSchema.shape.gallery,
});
export type SyncedSettings = z.infer<typeof syncedSettingsSchema>;

/** Name of the Workers KV binding in `wrangler.jsonc`. */
export const SETTINGS_KV_BINDING = "SETTINGS";
const KV_KEY = "settings";
const FILE_NAME = "settings.json";
/** Generous for a few dozen key template presets; rejects anything odd. */
export const MAX_SETTINGS_BYTES = 64 * 1024;

export type SettingsStore = {
  kind: "workers-kv" | "file";
  read(): Promise<SyncedSettings | null>;
  write(value: SyncedSettings): Promise<void>;
};

type KvNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

function isKvNamespaceLike(value: unknown): value is KvNamespaceLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as KvNamespaceLike).get === "function" &&
    typeof (value as KvNamespaceLike).put === "function"
  );
}

/** Stored JSON back to settings, or `null` when missing or not valid. */
function parseStored(raw: string | null): SyncedSettings | null {
  if (raw === null) return null;
  try {
    const parsed = syncedSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function kvStore(kv: KvNamespaceLike): SettingsStore {
  return {
    kind: "workers-kv",
    read: async () => parseStored(await kv.get(KV_KEY)),
    write: (value) => kv.put(KV_KEY, JSON.stringify(value)),
  };
}

/** `settings.json` in a directory on disk, for Docker / Node deployments. */
function fileStore(directory: string): SettingsStore {
  const paths = async () => {
    const { join } = await import("node:path");
    return {
      file: join(directory, FILE_NAME),
      temp: join(directory, `.${FILE_NAME}.tmp`),
    };
  };
  return {
    kind: "file",
    async read() {
      const { readFile } = await import("node:fs/promises");
      try {
        return parseStored(await readFile((await paths()).file, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async write(value) {
      const { mkdir, rename, writeFile } = await import("node:fs/promises");
      const { file, temp } = await paths();
      await mkdir(directory, { recursive: true });
      // Write then rename, so a crash never leaves a half-written file.
      await writeFile(temp, JSON.stringify(value), "utf8");
      await rename(temp, file);
    },
  };
}

/**
 * Where synced settings live: the `SETTINGS` KV binding on Workers, or
 * CLOUDFRAME_DATA_DIR elsewhere. `undefined` keeps settings per browser.
 */
export function getSettingsStore(): SettingsStore | undefined {
  const kv = workerBinding(SETTINGS_KV_BINDING);
  if (isKvNamespaceLike(kv)) return kvStore(kv);
  const directory = readSetting("DATA_DIR");
  if (directory && !isCloudflareWorker()) return fileStore(directory);
  return undefined;
}

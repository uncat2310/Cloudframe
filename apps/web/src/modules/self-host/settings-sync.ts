import deepEqual from "fast-deep-equal";
import type {
  StoredSettings,
  SyncedSettings,
} from "@/lib/self-host/settings-store";

export type SettingsSyncDeps = {
  /** The browser's current upload and gallery settings. */
  readLocal: () => SyncedSettings;
  writeLocal: (value: SyncedSettings) => void;
  /** The server's copy, or `null` when none has been saved yet. */
  fetchRemote: () => Promise<StoredSettings | null>;
  /** Saves to the server and returns the server time of the save. */
  pushRemote: (value: SyncedSettings) => Promise<number>;
  /** Quiet period after the last change before saving. */
  debounceMs?: number;
  /** Delay before retrying a failed save. */
  retryMs?: number;
};

/**
 * Keeps one browser's upload and gallery settings in step with the server.
 *
 * - On start, the server's copy wins, unless the user already changed
 *   something locally; with no server copy yet, the local one seeds it.
 * - Local changes are saved after a quiet period, so a burst of edits costs
 *   one write.
 * - `refresh()` (when the tab comes back) picks up changes made elsewhere,
 *   but never overwrites local changes that haven't been saved yet, and
 *   ignores a copy older than the newest one seen (Workers KV can briefly
 *   serve a stale value after a write).
 */
export function createSettingsSync({
  readLocal,
  writeLocal,
  fetchRemote,
  pushRemote,
  debounceMs = 1000,
  retryMs = 15_000,
}: SettingsSyncDeps) {
  /**
   * The value both sides agree on: `undefined` until the first fetch,
   * `null` while the server has no copy yet.
   */
  let synced: SyncedSettings | null | undefined;
  /** Server time of `synced`; older remote copies are stale. */
  let syncedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pushing: Promise<number> | undefined;
  let stopped = false;

  const isDirty = () =>
    synced !== undefined &&
    (synced === null || !deepEqual(readLocal(), synced));

  function schedule(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(() => void push(), delay);
  }

  async function push() {
    timer = undefined;
    if (stopped || !isDirty()) return;
    if (pushing) {
      // A save is in flight; check again once it settles.
      await pushing;
      return push();
    }
    const value = readLocal();
    pushing = pushRemote(value);
    try {
      syncedAt = Math.max(syncedAt, await pushing);
      synced = value;
    } catch {
      if (!stopped) schedule(retryMs);
    } finally {
      pushing = undefined;
    }
    // Changes made while saving get their own save.
    if (!stopped && isDirty()) schedule(debounceMs);
  }

  return {
    async start() {
      const before = readLocal();
      const remote = await fetchRemote();
      if (stopped) return;
      if (remote === null) {
        // Nothing on the server yet: this browser's settings become the
        // shared ones (retried like any other save if it fails).
        synced = null;
        await push();
        return;
      }
      synced = remote.value;
      syncedAt = remote.updatedAt;
      if (deepEqual(readLocal(), before)) {
        if (!deepEqual(before, remote.value)) writeLocal(remote.value);
      } else {
        // Edited while the server's copy was loading: keep the edit.
        schedule(debounceMs);
      }
    },
    /** Call whenever the local settings change. */
    onLocalChange() {
      if (stopped || synced === undefined) return;
      if (isDirty()) schedule(debounceMs);
      else clearTimeout(timer);
    },
    async refresh() {
      if (stopped || synced === undefined || isDirty() || pushing) return;
      const remote = await fetchRemote();
      if (stopped || remote === null || isDirty() || pushing) return;
      if (remote.updatedAt <= syncedAt) return;
      syncedAt = remote.updatedAt;
      if (!deepEqual(remote.value, synced)) {
        synced = remote.value;
        writeLocal(remote.value);
      }
    },
    /** Save a pending change now (e.g. when the tab is being hidden). */
    flush() {
      if (timer !== undefined) {
        clearTimeout(timer);
        void push();
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

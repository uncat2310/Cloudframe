import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncedSettings } from "@/lib/self-host/settings-store";
import { createSettingsSync } from "./settings-sync";

const base: SyncedSettings = {
  upload: {
    keyTemplate: "i/{{year}}/{{ulid-dayslice}}.{{ext}}",
    keyTemplatePresets: [],
    compressionOption: null,
  },
  gallery: { autoRefresh: true },
};
const withWebp: SyncedSettings = {
  ...base,
  upload: { ...base.upload, compressionOption: { type: "webp", quality: 80 } },
};
const noRefresh: SyncedSettings = { ...base, gallery: { autoRefresh: false } };

function setup(initialLocal: SyncedSettings, remote: SyncedSettings | null) {
  let local = initialLocal;
  let server = remote;
  const deps = {
    readLocal: () => local,
    writeLocal: vi.fn((value: SyncedSettings) => {
      local = value;
    }),
    fetchRemote: vi.fn(async () => server),
    pushRemote: vi.fn(async (value: SyncedSettings) => {
      server = value;
    }),
  };
  const sync = createSettingsSync({ ...deps, debounceMs: 1000, retryMs: 5000 });
  return {
    sync,
    deps,
    edit(value: SyncedSettings) {
      local = value;
      sync.onLocalChange();
    },
    get local() {
      return local;
    },
    get server() {
      return server;
    },
    setServer(value: SyncedSettings) {
      server = value;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSettingsSync", () => {
  it("adopts the server's settings on start", async () => {
    const t = setup(base, withWebp);
    await t.sync.start();
    expect(t.local).toEqual(withWebp);
    expect(t.deps.pushRemote).not.toHaveBeenCalled();
  });

  it("seeds the server with this browser's settings when it has none", async () => {
    const t = setup(withWebp, null);
    await t.sync.start();
    expect(t.deps.pushRemote).toHaveBeenCalledTimes(1);
    expect(t.server).toEqual(withWebp);
    expect(t.deps.writeLocal).not.toHaveBeenCalled();
  });

  it("saves a burst of changes once, after a quiet period", async () => {
    const t = setup(base, base);
    await t.sync.start();
    t.edit(withWebp);
    await vi.advanceTimersByTimeAsync(500);
    t.edit(noRefresh);
    await vi.advanceTimersByTimeAsync(999);
    expect(t.deps.pushRemote).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.deps.pushRemote).toHaveBeenCalledTimes(1);
    expect(t.server).toEqual(noRefresh);
  });

  it("doesn't save when a change is undone before the quiet period ends", async () => {
    const t = setup(base, base);
    await t.sync.start();
    t.edit(withWebp);
    t.edit(base);
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.deps.pushRemote).not.toHaveBeenCalled();
  });

  it("keeps an edit made while the server's copy was loading", async () => {
    const t = setup(base, withWebp);
    const started = t.sync.start();
    t.edit(noRefresh);
    await started;
    expect(t.local).toEqual(noRefresh);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.server).toEqual(noRefresh);
  });

  it("picks up changes made elsewhere on refresh", async () => {
    const t = setup(base, base);
    await t.sync.start();
    t.setServer(withWebp);
    await t.sync.refresh();
    expect(t.local).toEqual(withWebp);
  });

  it("never lets a refresh overwrite unsaved local changes", async () => {
    const t = setup(base, base);
    await t.sync.start();
    t.edit(noRefresh);
    t.setServer(withWebp);
    await t.sync.refresh();
    expect(t.local).toEqual(noRefresh);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.server).toEqual(noRefresh);
  });

  it("retries a failed save", async () => {
    const t = setup(base, base);
    await t.sync.start();
    t.deps.pushRemote.mockRejectedValueOnce(new Error("offline"));
    t.edit(withWebp);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.deps.pushRemote).toHaveBeenCalledTimes(1);
    expect(t.server).toEqual(base);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.deps.pushRemote).toHaveBeenCalledTimes(2);
    expect(t.server).toEqual(withWebp);
  });

  it("saves a pending change immediately on flush", async () => {
    const t = setup(base, base);
    await t.sync.start();
    t.edit(withWebp);
    t.sync.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.server).toEqual(withWebp);
  });

  it("does nothing after stop", async () => {
    const t = setup(base, base);
    await t.sync.start();
    t.edit(withWebp);
    t.sync.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.deps.pushRemote).not.toHaveBeenCalled();
  });
});

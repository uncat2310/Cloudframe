import { ORPCError } from "@orpc/client";
import { useStore } from "jotai";
import { useEffect } from "react";
import { client } from "@/lib/orpc/client";
import type { SyncedSettings } from "@/lib/self-host/settings-store";
import { settings } from "@/stores/atoms/settings";
import { notifySelfHostSignedOut } from "./session";
import { createSettingsSync } from "./settings-sync";

async function signedOutAware<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
      notifySelfHostSignedOut();
    }
    throw error;
  }
}

/**
 * Keeps the upload and gallery settings in step with the server while
 * signed in. Renders nothing.
 */
export function SettingsSyncRunner() {
  const store = useStore();

  useEffect(() => {
    const readLocal = (): SyncedSettings => ({
      upload: store.get(settings.upload),
      gallery: store.get(settings.gallery),
    });
    const sync = createSettingsSync({
      readLocal,
      writeLocal: (value) => {
        store.set(settings.upload, value.upload);
        store.set(settings.gallery, value.gallery);
      },
      fetchRemote: async () => {
        const remote = await signedOutAware(() =>
          client.selfHost.settings.get(),
        );
        return remote.value === null
          ? null
          : { value: remote.value, updatedAt: remote.updatedAt };
      },
      pushRemote: async (value) =>
        (await signedOutAware(() => client.selfHost.settings.put({ value })))
          .updatedAt,
    });

    const unsubscribe = [
      store.sub(settings.upload, sync.onLocalChange),
      store.sub(settings.gallery, sync.onLocalChange),
    ];
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void sync.refresh();
      else sync.flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", sync.flush);
    void sync.start().catch(() => {
      // Offline or signed out: settings stay per browser for this visit.
    });

    return () => {
      sync.flush();
      sync.stop();
      for (const off of unsubscribe) off();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", sync.flush);
    };
  }, [store]);

  return null;
}

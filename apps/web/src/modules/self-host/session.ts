import { queryOptions } from "@tanstack/react-query";
import { client } from "@/lib/orpc/client";

export const selfHostSessionQuery = queryOptions({
  queryKey: ["self-host-session"],
  queryFn: () => client.selfHost.session(),
  staleTime: Infinity,
  retry: 1,
});

const signedOutListeners = new Set<() => void>();

/** Called when the server rejects a storage request because the session ended. */
export function notifySelfHostSignedOut() {
  for (const listener of signedOutListeners) listener();
}

export function onSelfHostSignedOut(listener: () => void) {
  signedOutListeners.add(listener);
  return () => {
    signedOutListeners.delete(listener);
  };
}

import { createRouter } from "@tanstack/react-router";
import messages from "../messages/en.json";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { migrateLegacyStorageKeys } from "./lib/storage-keys";

// Create a new router instance
export function getRouter() {
  // Before any settings are read: carry over values saved under the
  // pre-rename storage keys.
  migrateLegacyStorageKeys();
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultHashScrollIntoView: { behavior: "smooth" },
  });
  return router;
}

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

declare module "use-intl" {
  interface AppConfig {
    // ...
    Messages: typeof messages;
  }
}

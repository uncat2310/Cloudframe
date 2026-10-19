import { selfHostRouter } from "./self-host-router";
import { profilesRouter } from "./sync-profiles-router";

export const router = {
  profiles: profilesRouter,
  selfHost: selfHostRouter,
};

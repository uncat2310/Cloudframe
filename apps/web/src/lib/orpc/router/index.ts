import { presetRouter } from "./preset-router";
import { profilesRouter } from "./sync-profiles-router";

export const router = {
  profiles: profilesRouter,
  preset: presetRouter,
};

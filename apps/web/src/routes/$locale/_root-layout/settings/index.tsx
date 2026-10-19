import { createFileRoute, Navigate } from "@tanstack/react-router";
import { selfHostMode } from "@/lib/self-host/flag";

export const Route = createFileRoute("/$locale/_root-layout/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Navigate
      from="/$locale/settings"
      to={selfHostMode ? "/$locale/settings/s3" : "/$locale/settings/profile"}
      params={(prev) => ({ locale: prev.locale })}
    />
  );
}

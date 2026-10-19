import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/$locale/_root-layout/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Navigate
      from="/$locale/settings"
      to="/$locale/settings/s3"
      params={(prev) => ({ locale: prev.locale })}
    />
  );
}

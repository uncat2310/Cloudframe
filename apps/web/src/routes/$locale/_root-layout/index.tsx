import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useLocale } from "use-intl";

export const Route = createFileRoute("/$locale/_root-layout/")({
  component: RouteComponent,
});

function RouteComponent() {
  const locale = useLocale();
  return <Navigate to="/$locale/gallery" params={{ locale }} replace />;
}

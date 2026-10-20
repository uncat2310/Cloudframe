import { TrashSettings } from "@/modules/settings/trash/trash";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$locale/_root-layout/settings/trash")({
  component: RouteComponent,
});

function RouteComponent() {
  return <TrashSettings />;
}

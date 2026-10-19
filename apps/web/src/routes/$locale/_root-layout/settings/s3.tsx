import { createFileRoute } from "@tanstack/react-router";
import { SelfHostStorageInfo } from "@/modules/self-host/storage-info";

export const Route = createFileRoute("/$locale/_root-layout/settings/s3")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SelfHostStorageInfo />;
}

import { S3Settings } from "@/modules/settings/s3/s3";
import { createFileRoute } from "@tanstack/react-router";
import { selfHostMode } from "@/lib/self-host/flag";
import { SelfHostStorageInfo } from "@/modules/self-host/storage-info";

export const Route = createFileRoute("/$locale/_root-layout/settings/s3")({
  component: RouteComponent,
});

function RouteComponent() {
  return selfHostMode ? <SelfHostStorageInfo /> : <S3Settings />;
}

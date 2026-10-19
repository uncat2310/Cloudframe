"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/orpc/client";
import { settings } from "@/stores/atoms/settings";
import { selfHostSessionQuery } from "./session";

/** Read-only view of the server-managed bucket, replacing the S3 settings form. */
export function SelfHostStorageInfo() {
  const t = useTranslations("selfHost");
  const { raw } = useAtomValue(settings.storage);
  const runStorage = useSetAtom(settings.storage);
  const queryClient = useQueryClient();
  const { data: session } = useQuery(selfHostSessionQuery);
  const backend =
    session?.status === "signed-in" ? session.storage.backend : undefined;

  const rows = [
    [
      t("backend"),
      backend === "r2-binding" ? t("backendBinding") : t("backendS3"),
    ],
    [t("bucket"), raw.bucket],
    ...(backend === "r2-binding" ? [] : [[t("endpoint"), raw.endpoint]]),
    [t("publicUrl"), raw.pubUrl],
    [t("includePath"), raw.includePath || t("none")],
  ];

  async function testAccess() {
    const outcome = await runStorage({ type: "test-access" });
    if (outcome.status === "success") {
      toast.success(t("accessOk"));
    } else {
      const message =
        outcome.status === "failed"
          ? outcome.error.reason === "unknown"
            ? outcome.error.message
            : outcome.error.reason
          : outcome.status;
      toast.error(t("accessFailed", { message }));
    }
  }

  async function logout() {
    await client.selfHost.logout();
    await queryClient.invalidateQueries({
      queryKey: selfHostSessionQuery.queryKey,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("storageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("storageDesc")}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-mono">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => void logout()}>
          {t("logout")}
        </Button>
        <Button onClick={() => void testAccess()}>{t("testAccess")}</Button>
      </div>
    </div>
  );
}

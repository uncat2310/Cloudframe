import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { DeleteSecondConfirm } from "@/components/misc/delete-second-confirm";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/orpc/client";
import { TRASH_BATCH_SIZE, toTrashKey } from "@/lib/self-host/policy";
import { imageCatalog } from "@/modules/image-catalog";

/** Matches the bucket lifecycle rule that purges the trash. */
const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const trashQueryKey = ["self-host-trash"] as const;

function chunks<T>(items: readonly T[], size: number) {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

function previewUrl(key: string) {
  return `/api/self-host/object?key=${encodeURIComponent(toTrashKey(key))}`;
}

export function TrashSettings() {
  const t = useTranslations("trash");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const runCatalog = useSetAtom(imageCatalog.run);
  const [busy, setBusy] = useState(false);
  const trash = useQuery({
    queryKey: trashQueryKey,
    queryFn: () => client.selfHost.trash.list(),
  });

  const formatTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  async function settle() {
    await queryClient.invalidateQueries({ queryKey: trashQueryKey });
    void runCatalog({
      type: "refresh",
      intent: "background",
      reason: "reconciliation",
    });
  }

  async function restore(keys: string[]) {
    setBusy(true);
    try {
      const total = { restored: 0, conflicts: 0, failed: 0 };
      for (const batch of chunks(keys, TRASH_BATCH_SIZE)) {
        const outcome = await client.selfHost.trash.restore({ keys: batch });
        total.restored += outcome.restored.length;
        total.conflicts += outcome.conflicts.length;
        total.failed += outcome.failed.length;
      }
      if (total.restored)
        toast.success(t("restored", { count: total.restored }));
      if (total.conflicts)
        toast.warning(t("conflicts", { count: total.conflicts }));
      if (total.failed) toast.error(t("failed", { count: total.failed }));
    } catch {
      toast.error(t("failed", { count: keys.length }));
    } finally {
      setBusy(false);
      await settle();
    }
  }

  async function purge(keys: string[]) {
    setBusy(true);
    try {
      let purged = 0;
      for (const batch of chunks(keys, 1000)) {
        const result = await client.selfHost.trash.purge({ keys: batch });
        if (!result.ok) {
          toast.error(
            t("purgeFailed", {
              message:
                result.error.reason === "unknown"
                  ? result.error.message
                  : result.error.reason,
            }),
          );
          break;
        }
        purged += result.value.deletedKeys.length;
      }
      if (purged) toast.success(t("purged", { count: purged }));
    } catch (error) {
      toast.error(
        t("purgeFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy(false);
      await settle();
    }
  }

  const items = trash.data?.ok ? trash.data.value : [];
  const allKeys = items.map((item) => item.key);

  let body;
  if (trash.isPending) {
    body = <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  } else if (trash.error || (trash.data && !trash.data.ok)) {
    const message = trash.error
      ? trash.error.message
      : trash.data && !trash.data.ok
        ? trash.data.error.reason
        : "";
    body = (
      <p className="text-sm text-destructive">{t("loadFailed", { message })}</p>
    );
  } else if (items.length === 0) {
    body = <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  } else {
    body = (
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const deletedAt = item.deletedAt ? new Date(item.deletedAt) : null;
          const daysLeft = deletedAt
            ? Math.max(
                0,
                Math.ceil(
                  (deletedAt.getTime() +
                    TRASH_RETENTION_DAYS * DAY_MS -
                    Date.now()) /
                    DAY_MS,
                ),
              )
            : null;
          return (
            <li key={item.key} className="flex items-center gap-3 py-2">
              <img
                src={previewUrl(item.key)}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-12 shrink-0 rounded bg-muted object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="break-all font-mono text-sm">{item.key}</p>
                {deletedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("deletedAt", { time: formatTime.format(deletedAt) })}
                    {daysLeft !== null &&
                      ` · ${t("daysLeft", { days: daysLeft })}`}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void restore([item.key])}
                >
                  {t("restore")}
                </Button>
                <DeleteSecondConfirm
                  itemNames={[item.key]}
                  deleteFn={() => void purge([item.key])}
                  title={t("confirmTitle")}
                  description={t("confirmDescription")}
                  confirmLabel={t("confirmDelete")}
                  triggerRender={
                    <Button size="sm" variant="ghost" disabled={busy}>
                      {t("deleteForever")}
                    </Button>
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("count", { count: items.length })}
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void restore(allKeys)}
          >
            {t("restoreAll")}
          </Button>
          <DeleteSecondConfirm
            itemNames={allKeys}
            deleteFn={() => void purge(allKeys)}
            title={t("confirmTitle")}
            description={t("confirmDescription")}
            confirmLabel={t("confirmDelete")}
            triggerRender={
              <Button size="sm" variant="destructive" disabled={busy}>
                {t("emptyTrash")}
              </Button>
            }
          />
        </div>
      )}
      {body}
    </div>
  );
}

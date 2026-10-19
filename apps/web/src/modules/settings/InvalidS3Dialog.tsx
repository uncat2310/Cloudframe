"use client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useTranslations, useLocale } from "use-intl";
import { PresetLoader } from "./preset/preset-loader";

export function InvalidS3Dialog() {
  const t = useTranslations("settings.s3Invalid");
  const locale = useLocale();
  return (
    <Dialog open={true}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("s3ConfigTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p>{t("s3ConfigDesc")}</p>
          <PresetLoader />
        </div>
        <DialogFooter>
          <Link
            to="/$locale/settings/s3"
            params={{ locale }}
            className={buttonVariants({ variant: "default" })}
          >
            {t("editLink")}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

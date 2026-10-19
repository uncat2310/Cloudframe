"use client";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { client } from "@/lib/orpc/client";
import { applyPresetProfileAtom } from "./apply-preset";

export const presetStatusQuery = {
  queryKey: ["preset-status"],
  queryFn: () => client.preset.status(),
  staleTime: Infinity,
  retry: false,
};

/**
 * Lets a fresh browser load the deployment's preset S3 profile with just the
 * access password. Renders nothing when the server has no preset configured.
 */
export function PresetLoader() {
  const t = useTranslations("settings.preset");
  const { data } = useQuery(presetStatusQuery);
  const applyPreset = useSetAtom(applyPresetProfileAtom);
  const [password, setPassword] = useState("");
  const load = useMutation({
    mutationFn: (password: string) => client.preset.fetch({ password }),
    onSuccess: (preset) => {
      applyPreset(preset);
      toast.success(t("loaded", { name: preset.name }));
    },
    onError: (error) => {
      if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
        toast.error(t("wrongPassword"));
      } else if (
        error instanceof ORPCError &&
        error.code === "TOO_MANY_REQUESTS"
      ) {
        toast.error(t("tooManyRequests"));
      } else {
        toast.error(t("failed"));
      }
    },
  });

  if (!data?.available) return null;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (password) load.mutate(password);
      }}
    >
      <Label htmlFor="preset-password">{t("title")}</Label>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex gap-2">
        <div className="flex-1">
          <PasswordInput
            id="preset-password"
            autoComplete="current-password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={!password || load.isPending}>
          {t("load")}
        </Button>
      </div>
    </form>
  );
}

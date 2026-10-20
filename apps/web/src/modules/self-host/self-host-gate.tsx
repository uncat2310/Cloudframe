"use client";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import deepEqual from "fast-deep-equal";
import { produce } from "immer";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "@/lib/orpc/client";
import type { selfHostSessionSchema } from "@/lib/orpc/router/self-host-router";
import { setSelfHostPublicBase } from "@/lib/self-host/fetchable-url";
import { setSelfHostThumbnails } from "@/lib/self-host/thumbnail";
import { replaceSettingsProfileAtom } from "@/modules/settings/replace-profile";
import { settings } from "@/stores/atoms/settings";
import {
  getDefaultOptions,
  getDefaultProfiles,
  type S3Options,
} from "@/stores/schemas/settings";
import { onSelfHostSignedOut, selfHostSessionQuery } from "./session";
import { SettingsSyncRunner } from "./settings-sync-runner";

type SignedInSession = Extract<
  z.infer<typeof selfHostSessionSchema>,
  { status: "signed-in" }
>;

export const SELF_HOST_PROFILE_NAME = "Cloudflare R2";

/** Placeholder credentials: the real ones never leave the server. */
const SERVER_MANAGED = "server-managed";

function toProfileStorage({
  endpoint,
  bucket,
  pubUrl,
  includePath,
}: SignedInSession["storage"]): S3Options {
  return {
    endpoint,
    bucket,
    pubUrl,
    includePath,
    region: "auto",
    accKeyId: SERVER_MANAGED,
    secretAccKey: SERVER_MANAGED,
    forcePathStyle: false,
  };
}

/**
 * Only render the app once the browser has signed in and the active profile
 * points at the server-managed bucket.
 */
export function SelfHostGate({ children }: { children: ReactNode }) {
  const t = useTranslations("selfHost");
  const queryClient = useQueryClient();
  const session = useQuery(selfHostSessionQuery);

  useEffect(
    () =>
      onSelfHostSignedOut(() => {
        void queryClient.invalidateQueries({
          queryKey: selfHostSessionQuery.queryKey,
        });
      }),
    [queryClient],
  );

  if (session.isPending) return <GateSkeleton />;
  if (session.isError) {
    return (
      <GateCard title={t("unreachable")}>
        <Button onClick={() => void session.refetch()}>{t("retry")}</Button>
      </GateCard>
    );
  }

  switch (session.data.status) {
    case "not-configured":
      return (
        <GateCard
          title={t("notConfiguredTitle")}
          description={t("notConfiguredDesc")}
        >
          <ul className="list-disc pl-5 text-sm font-mono">
            {session.data.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </GateCard>
      );
    case "signed-out":
      return <LoginCard />;
    case "signed-in":
      return <ServerProfile session={session.data}>{children}</ServerProfile>;
  }
}

function ServerProfile({
  session,
  children,
}: {
  session: SignedInSession;
  children: ReactNode;
}) {
  const desired = toProfileStorage(session.storage);
  const current = useAtomValue(settings.storage).raw;
  const replaceProfile = useSetAtom(replaceSettingsProfileAtom);
  const ready = deepEqual(current, desired);
  setSelfHostPublicBase(desired.pubUrl);
  setSelfHostThumbnails(session.storage.thumbnails);

  useEffect(() => {
    if (ready) return;
    replaceProfile({
      type: "apply-imported",
      value: (previous) => {
        const index = previous.list.findIndex(
          ([name]) => name === SELF_HOST_PROFILE_NAME,
        );
        if (index !== -1) {
          return produce(previous, (draft) => {
            draft.list[index][1].s3 = desired;
            draft.current = index;
          });
        }
        const defaults = getDefaultOptions();
        const options = {
          ...defaults,
          s3: desired,
          upload: {
            ...defaults.upload,
            keyTemplate: session.keyTemplate ?? defaults.upload.keyTemplate,
          },
        };
        if (deepEqual(previous, getDefaultProfiles())) {
          return { list: [[SELF_HOST_PROFILE_NAME, options]], current: 0 };
        }
        return produce(previous, (draft) => {
          draft.list.push([SELF_HOST_PROFILE_NAME, options]);
          draft.current = draft.list.length - 1;
        });
      },
    });
  }, [ready, desired, session.keyTemplate, replaceProfile]);

  if (!ready) return <GateSkeleton />;
  return (
    <>
      {session.settingsSync && <SettingsSyncRunner />}
      {children}
    </>
  );
}

function LoginCard() {
  const t = useTranslations("selfHost");
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: (password: string) => client.selfHost.login({ password }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: selfHostSessionQuery.queryKey,
      }),
  });

  let error: string | undefined;
  if (login.error instanceof ORPCError) {
    error =
      login.error.code === "UNAUTHORIZED"
        ? t("wrongPassword")
        : login.error.code === "TOO_MANY_REQUESTS"
          ? t("tooManyRequests")
          : t("loginFailed");
  } else if (login.error) {
    error = t("loginFailed");
  }

  return (
    <GateCard title={t("loginTitle")} description={t("loginDesc")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (password) login.mutate(password);
        }}
      >
        <PasswordInput
          aria-label={t("password")}
          placeholder={t("password")}
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!password || login.isPending}>
          {t("login")}
        </Button>
      </form>
    </GateCard>
  );
}

function GateCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-start justify-center pt-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function GateSkeleton() {
  const t = useTranslations("selfHost");
  return (
    <div className="flex flex-1 flex-col gap-4" aria-label={t("loading")}>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

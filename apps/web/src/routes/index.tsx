import { ClientOnly, createFileRoute, Navigate } from "@tanstack/react-router";
import { getPersistedLocale } from "@/lib/locale";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  // The persisted locale lives in browser storage, so redirect on the client.
  return (
    <ClientOnly>
      <RedirectToPersistedLocale />
    </ClientOnly>
  );
}

function RedirectToPersistedLocale() {
  return <Navigate to="/$locale" params={{ locale: getPersistedLocale() }} />;
}

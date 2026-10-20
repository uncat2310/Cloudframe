import { getLocale, LocaleNotFoundError } from "@/i18n/routing";
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { IntlProvider } from "use-intl";
import { createHeadTags } from "../../lib/seo";

export const Route = createFileRoute("/$locale")({
  loader: async (ctx) => {
    try {
      return await getLocale(ctx.params.locale);
    } catch (error) {
      if (error instanceof LocaleNotFoundError) {
        throw notFound();
      }
      throw new Error("Unknown error");
    }
  },
  head: ({ params }) => createHeadTags({ locale: params.locale }),
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
});

function RouteComponent() {
  const { locale, messages } = Route.useLoaderData();
  return (
    <IntlProvider
      locale={locale}
      messages={messages}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      <Outlet />
    </IntlProvider>
  );
}

function NotFoundComponent() {
  // TODO: Add a nice not found component
  // Rendered outside the locale's IntlProvider, so both languages are shown.
  return <div>页面不存在 · Not Found</div>;
}

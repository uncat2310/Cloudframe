import type {
  DetailedHTMLProps,
  LinkHTMLAttributes,
  MetaHTMLAttributes,
} from "react";

const DEFAULT_TITLE = "Cloudframe";
const DEFAULT_DESCRIPTION = "A private image host on Cloudflare R2";
const OG_IMAGE_PATH = "/og.png";
const OG_IMAGE_ALT = "Cloudframe";

export type HeadOptions = {
  title?: string;
  description?: string;
  locale?: string;
  includeFavicon?: boolean;
};

export function createHeadTags({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  locale,
  includeFavicon = false,
}: HeadOptions = {}) {
  const meta: Array<
    DetailedHTMLProps<MetaHTMLAttributes<HTMLMetaElement>, HTMLMetaElement>
  > = [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: OG_IMAGE_PATH },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: OG_IMAGE_ALT },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: OG_IMAGE_PATH },
  ];

  if (locale) {
    meta.push({ property: "og:locale", content: locale });
  }

  const links: Array<
    DetailedHTMLProps<LinkHTMLAttributes<HTMLLinkElement>, HTMLLinkElement>
  > = [...(includeFavicon ? [{ rel: "icon", href: "/favicon.svg" }] : [])];

  return {
    meta,
    links,
  };
}

export const seoDefaults = {
  defaultTitle: DEFAULT_TITLE,
  defaultDescription: DEFAULT_DESCRIPTION,
} as const;

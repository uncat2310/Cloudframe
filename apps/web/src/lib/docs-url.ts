/** The upstream project's online documentation (not bundled in this build). */
export function upstreamDocsUrl(locale: string, page: string, hash?: string) {
  return `https://imageport.app/${locale}/docs/${page}${hash ? `#${hash}` : ""}`;
}

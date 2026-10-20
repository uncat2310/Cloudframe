const DOCS_BASE = "https://github.com/uncat2310/Cloudframe/blob/main/docs";

/** Link to a section of the settings reference, in the UI's language. */
export function settingsDocsUrl(
  locale: string,
  section: "upload-settings" | "key-template" | "gallery-settings",
) {
  const page = locale === "zh" ? "settings.md" : "settings.en.md";
  return `${DOCS_BASE}/${page}#${section}`;
}

/**
 * Object layout of the studio bucket. Keys never contain user-controlled path
 * segments other than a sanitized file name.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/, "");
  return cleaned.slice(0, 120) || "file";
}

export const storageKeys = {
  asset: (assetId: string, filename: string) => `assets/${assetId}/${sanitizeFilename(filename)}`,
  render: (projectId: string, renderId: string, filename: string) =>
    `renders/${projectId}/${renderId}/${sanitizeFilename(filename)}`,
  templatePreview: (templateId: string) => `templates/${templateId}/preview.png`,
};

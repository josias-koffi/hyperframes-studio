import { clientApi, type Asset, type AssetKind } from "./api";

export function kindFromFile(file: Pick<File, "type" | "name">): AssetKind {
  const type = file.type;
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("image/")) return /logo/i.test(file.name) ? "logo" : "image";
  if (type.startsWith("font/") || /\.(woff2?|ttf|otf)$/i.test(file.name)) return "font";
  if (type === "application/pdf" || type.startsWith("text/")) return "document";
  return "other";
}

/** The kinds a list of assets is filtered by: images and logos together, the rarer kinds under "Autres". */
export const ASSET_FILTERS: { value: string; label: string; kinds: AssetKind[] }[] = [
  { value: "all", label: "Tout", kinds: [] },
  { value: "image", label: "Images", kinds: ["image", "logo"] },
  { value: "video", label: "Vidéos", kinds: ["video"] },
  { value: "audio", label: "Sons", kinds: ["audio"] },
  { value: "other", label: "Autres", kinds: ["font", "document", "other"] },
];

const UNITS = ["o", "Ko", "Mo", "Go"];

export function formatBytes(size: number): string {
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 || value >= 10 ? 0 : 1)} ${UNITS[unit]}`;
}

/** Registers the asset with the API, then PUTs the file on the presigned URL it returns. */
export async function uploadAsset(
  file: File,
  { projectId, creationId, onProgress }: { projectId?: string; creationId?: string; onProgress?: (fraction: number) => void } = {},
): Promise<Asset> {
  const contentType = file.type || "application/octet-stream";
  const { asset, uploadUrl } = await clientApi<{ asset: Asset; uploadUrl: string }>("/assets/uploads", {
    method: "POST",
    body: JSON.stringify({ projectId, creationId, filename: file.name, contentType, size: file.size, kind: kindFromFile(file) }),
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Envoi refusé (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Envoi interrompu : stockage injoignable"));
    xhr.send(file);
  });
  return asset;
}

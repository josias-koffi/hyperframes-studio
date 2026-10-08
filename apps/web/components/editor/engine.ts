/**
 * The HyperFrames engine of one création, through the API (`/creations/:id/engine/*`): its source files and media.
 * The editor computes every edit itself and writes the file whole.
 */
export type EngineFile = {
  /** The editor's copy, edits included. */
  content: string;
  /** Version of what the engine has (its ETag). */
  version: string;
  /** What the engine has. */
  saved: string;
};

async function failure(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  return new Error(body?.message ?? body?.error ?? `Erreur ${response.status}`);
}

export function engineUrl(creationId: string, path: string) {
  return `/api/creations/${creationId}/engine/${path}`;
}

export async function readFile(creationId: string, path: string): Promise<EngineFile> {
  const response = await fetch(engineUrl(creationId, `files/${path}`), { cache: "no-store" });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { content: string };
  return { content: body.content, version: response.headers.get("etag") ?? "", saved: body.content };
}

export type WriteResult = { version: string } | { conflict: { version: string; content: string | null } };

/** Replaces a file whole, if it is still at `version`; else the engine answers with what it has now. */
export async function writeFile(creationId: string, path: string, content: string, version: string): Promise<WriteResult> {
  const response = await fetch(engineUrl(creationId, `files/${path}`), {
    method: "PUT",
    headers: { "content-type": "text/plain; charset=utf-8", "if-match": version },
    body: content,
  });
  if (response.status === 409 || response.status === 412) {
    const body = (await response.clone().json().catch(() => null)) as { currentVersion?: string; currentContent?: string | null } | null;
    if (body?.currentVersion) return { conflict: { version: body.currentVersion, content: body.currentContent ?? null } };
  }
  if (!response.ok) throw await failure(response);
  const body = (await response.json().catch(() => null)) as { version?: string } | null;
  return { version: response.headers.get("etag") ?? body?.version ?? "" };
}

/**
 * A frame of a composition file, rendered at the composition's size. The engine keys its cache by the file's
 * content; `version` only tells the browser when to ask again.
 */
export function thumbnailUrl(creationId: string, file: string, time: number, version?: string) {
  const query = new URLSearchParams({ t: time.toFixed(2) });
  if (version) query.set("v", version);
  return `${engineUrl(creationId, `thumbnail/${file}`)}?${query}`;
}

export function peaksUrl(creationId: string, src: string) {
  return engineUrl(creationId, `peaks/${src}`);
}

import type { CreationKind, CreationType } from "@studio/shared/browser";
import { serverApi, type CreationListItem } from "./api";
import { itemState, type CreationState } from "./creation-state";

export type CreationOverview = CreationListItem & { state: CreationState };

/** Créations of every project (or of one), with where they stand. */
export async function loadCreations(filter: { projectId?: string; type?: CreationType; kind?: CreationKind } = {}): Promise<CreationOverview[]> {
  const query = new URLSearchParams();
  if (filter.type) query.set("type", filter.type);
  if (filter.kind) query.set("kind", filter.kind);
  const base = filter.projectId ? `/projects/${filter.projectId}/creations` : "/creations";
  const items = await serverApi<CreationListItem[]>(query.size ? `${base}?${query}` : base);
  return items.map((item) => ({ ...item, state: itemState(item) }));
}

import { cache } from "react";
import type { Asset, Creation, IterationListItem, Job, Render } from "./api";
import { serverApi } from "./server-api";
import { creationState } from "./creation-state";

/** One fetch per request, shared by the création layout and whichever step page it wraps. */
export const loadCreation = cache(async (id: string) => {
  const [creation, jobs, renders, assets] = await Promise.all([
    serverApi<Creation>(`/creations/${id}`),
    serverApi<Job[]>(`/creations/${id}/jobs`),
    serverApi<Render[]>(`/creations/${id}/renders`),
    serverApi<Asset[]>(`/assets?creationId=${id}`),
  ]);
  const iterations = creation.kind === "template" ? await serverApi<IterationListItem[]>(`/creations/${id}/iterations`) : [];
  return { creation, jobs, renders, assets, iterations, state: creationState(creation, jobs, renders.length, iterations.length) };
});

export type CreationData = Awaited<ReturnType<typeof loadCreation>>;

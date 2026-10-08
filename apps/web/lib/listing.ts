/** Lower case, accents dropped: "Été" finds "ete". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Whether any of the fields holds the query, case and accents aside. An empty query matches everything. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = fold(query.trim());
  return needle === "" || fold(fields.filter(Boolean).join(" ")).includes(needle);
}

/** One page of a list; an out-of-range or garbled page number lands on the nearest real page. */
export function paginate<T>(items: T[], rawPage: unknown, size: number): { shown: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(rawPage)) || 1));
  return { shown: items.slice((page - 1) * size, page * size), page, pages };
}

/** `path?…` with the set parameters only; page 1 is left out so the first page keeps its plain URL. */
export function listHref(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (key === "page" && Number(value) <= 1)) continue;
    query.set(key, String(value));
  }
  return query.size ? `${path}?${query}` : path;
}

/** A query parameter as one string: Next gives arrays for repeated keys. */
export function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Pages to show: the first, the last, and the current one with its neighbours; a gap is `null`. */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const shown = [...new Set([1, pages, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1] > 1 ? [null, n] : [n]));
}

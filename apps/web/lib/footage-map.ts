/** What the footage step left in `footage_map.json` (written by the workspace's `scripts/footage.mjs`, events by Claude). */
export type FootageMap = {
  duration: number | null;
  shots: number;
  /** Contact sheets of the whole rush, then the windows Claude refined. */
  sheets: FootageSheet[];
};

export type FootageSheet = { path: string; start: number; end: number; refined: boolean };

type RawSheet = { path?: unknown; times?: unknown };
type RawMap = { source?: { duration_s?: unknown }; shots?: unknown[]; sheets?: RawSheet[]; refines?: RawSheet[] };

function sheets(raw: RawSheet[] | undefined, refined: boolean): FootageSheet[] {
  return (raw ?? []).flatMap((sheet) => {
    const times = Array.isArray(sheet.times) ? sheet.times.filter((t): t is number => typeof t === "number") : [];
    if (typeof sheet.path !== "string" || times.length === 0) return [];
    return [{ path: sheet.path, start: times[0], end: times[times.length - 1], refined }];
  });
}

export function parseFootageMap(raw: string | null): FootageMap | null {
  if (!raw) return null;
  let map: RawMap;
  try {
    map = JSON.parse(raw) as RawMap;
  } catch {
    return null;
  }
  return {
    duration: typeof map.source?.duration_s === "number" ? map.source.duration_s : null,
    shots: Array.isArray(map.shots) ? map.shots.length : 0,
    sheets: [...sheets(map.sheets, false), ...sheets(map.refines, true)],
  };
}

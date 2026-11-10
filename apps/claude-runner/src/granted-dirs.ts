import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";

const QUOTED_PATH = /[`"'«]\s*((?:~\/|\/)[^`"'»\n]+?)\s*[`"'»]/g;
const BARE_PATH = /(?:^|[\s(=])((?:~\/|\/)[^\s`"'«»<>|]+)/g;

function citedPaths(text: string): string[] {
  const quoted = [...text.matchAll(QUOTED_PATH)].map((match) => match[1]);
  const bare = [...text.matchAll(BARE_PATH)].map((match) => match[1].replace(/[.,;:!?)]+$/, ""));
  return [...quoted, ...bare];
}

/** Inside the person's home or a mounted disk, and never in a hidden folder (`.ssh`, `.claude`, `.config`...). */
function mayGrant(dir: string, home: string): boolean {
  const root = [home, "/mnt", "/media"].find((candidate) => dir.startsWith(candidate + sep));
  return root !== undefined && !dir.slice(root.length + 1).split(sep).some((segment) => segment.startsWith("."));
}

/**
 * The folders of this computer the person named in what they typed: the agent may work in them for this création.
 * A named file opens its folder, because `--add-dir` only takes directories. What does not exist, the home itself and
 * anything outside `mayGrant` are ignored; symbolic links are resolved first, so one cannot lead into a hidden folder.
 */
export async function grantedDirs(texts: readonly string[], home: string = homedir()): Promise<string[]> {
  const realHome = await realpath(home);
  const dirs = new Set<string>();
  for (const cited of texts.flatMap(citedPaths)) {
    const path = cited.startsWith("~/") ? join(home, cited.slice(2)) : cited;
    const real = await realpath(path).catch(() => null);
    if (!real) continue;
    const dir = (await stat(real)).isDirectory() ? real : dirname(real);
    if (mayGrant(dir, realHome)) dirs.add(dir);
  }
  return [...dirs];
}

/** Every string of a brief, whatever field the person typed the path in. */
export function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsOf);
  return [];
}

/** Tells the agent which folders it was given: a composition can only load what is under its own `assets/`. */
export function grantedDirsNote(dirs: readonly string[], slug: string): string {
  if (!dirs.length) return "";
  const list = dirs.map((dir) => `- ${dir}`).join("\n");
  return `\n\nL'utilisateur t'a ouvert ces dossiers de son poste :\n${list}\nTu peux les lister et les lire. Copie ce que tu utilises dans \`videos/${slug}/assets/uploads/\` : une composition ne charge que ses propres assets. Ne modifie pas ces dossiers.\n`;
}

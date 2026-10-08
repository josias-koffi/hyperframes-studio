import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE = join(__dirname, "../../../workspace");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

type FootageMap = {
  source: { width: number; height: number; duration_s: number; has_audio: boolean };
  shots: { start: number; end: number; frame: string }[];
  sheets: { path: string; times: number[] }[];
  refines: { path: string; times: number[] }[];
  events: unknown[];
};

/** A 6 s, 25 fps rush with cuts at 2 s and 4 s (black, white, black: flat colours need contrast), no sound. */
async function rush(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "footage-"));
  await mkdir(join(dir, "assets/uploads"), { recursive: true });
  await writeFile(join(dir, "BRIEF.md"), "---\nfootage: rush.mp4\n---\n");
  const colour = (c: string) => ["-f", "lavfi", "-i", `color=c=${c}:s=320x180:r=25:d=2`];
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    ...colour("black"), ...colour("white"), ...colour("black"),
    "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0[v]", "-map", "[v]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "assets/uploads/rush.mp4"),
  ]);
  return dir;
}

const footage = (dir: string, ...args: string[]) =>
  execFileSync(process.execPath, ["scripts/footage.mjs", dir, ...args], { cwd: WORKSPACE, encoding: "utf8" });
const readMap = async (dir: string) => JSON.parse(await readFile(join(dir, "footage_map.json"), "utf8")) as FootageMap;

describe.skipIf(!hasFfmpeg)("scripts/footage.mjs", () => {
  it("maps the cuts and the exact time of every tile", async () => {
    const dir = await rush();
    footage(dir, "--steps", "probe,cuts,sheets");
    const map = await readMap(dir);

    expect(map.source).toMatchObject({ width: 320, height: 180, duration_s: 6, has_audio: false });
    expect(map.shots.map(({ start, end }) => [start, end])).toEqual([[0, 2], [2, 4], [4, 6]]);
    // 2 frames per second over 6 s: 12 tiles, one 5×4 sheet, each tile at most a frame (0.04 s) after its step.
    expect(map.sheets).toHaveLength(1);
    const { times } = map.sheets[0];
    expect(times).toHaveLength(12);
    for (const [k, t] of times.entries()) {
      expect(t - k * 0.5).toBeGreaterThanOrEqual(0);
      expect(t - k * 0.5).toBeLessThan(0.04 + 1e-9);
    }
    expect(map.events).toEqual([]);
  });

  it("refines a window at 10 frames per second without losing the map", async () => {
    const dir = await rush();
    footage(dir, "--steps", "probe,cuts,sheets");
    footage(dir, "--refine", "1.5-2.5");
    const map = await readMap(dir);

    expect(map.shots).toHaveLength(3);
    expect(map.refines).toHaveLength(1);
    expect(map.refines[0].times).toHaveLength(10);
    expect(map.refines[0].times[0]).toBeCloseTo(1.52, 2);
  });
});

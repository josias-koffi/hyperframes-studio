/**
 * Variables of the studio an agent may see: nothing that opens the database, the storage or a provider.
 * `PRODUCER_BROWSER_GPU_MODE` reaches `check` and `snapshot` too: on a GPU whose captures fail, Chrome crashes on a
 * video unless it runs in software.
 */
const PASSED_THROUGH = [
  "PATH",
  "LANG",
  "LC_ALL",
  "TZ",
  "TTS_PEAK_DB",
  "HYPERFRAMES_BROWSER_PATH",
  "HYPERFRAMES_NO_TELEMETRY",
  "PRODUCER_BROWSER_GPU_MODE",
] as const;

/** The environment of an agent process: the person's home, a private tmp, and what `extra` hands it. */
export function agentEnv(
  dirs: { home: string; tmp: string },
  extra: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const passed = Object.fromEntries(PASSED_THROUGH.filter((key) => env[key] !== undefined).map((key) => [key, env[key] as string]));
  return { ...passed, HOME: dirs.home, TMPDIR: dirs.tmp, ...extra };
}

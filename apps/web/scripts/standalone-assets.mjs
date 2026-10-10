// `next build` leaves the static files and `public/` out of `.next/standalone`, the server the desktop app runs:
// they are copied next to its server.js, where it serves them from.
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const web = join(import.meta.dirname, "..");
const server = join(web, ".next", "standalone", "apps", "web");
for (const [from, to] of [
  [join(web, ".next", "static"), join(server, ".next", "static")],
  [join(web, "public"), join(server, "public")],
]) {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
}

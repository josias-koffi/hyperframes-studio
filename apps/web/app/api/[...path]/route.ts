import type { NextRequest } from "next/server";

/**
 * Browser → API proxy, resolved at runtime from `API_URL` (no URL baked into the
 * build). The response body is streamed through, so the job SSE feed stays live.
 * Authentication will be enforced here before the first deployment.
 */
async function proxy(request: NextRequest, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const base = process.env.API_URL ?? "http://localhost:3343";
  const target = new URL(`${base}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of ["content-type", "accept", "last-event-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    signal: request.signal,
  });

  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const dynamic = "force-dynamic";
export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };

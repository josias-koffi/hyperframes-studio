import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/**
 * Sends a window without a session cookie to the page that says to relaunch the app, before anything renders. Only
 * the cookie's presence is checked here: the API verifies it on every call, and a refused one also lands there.
 */
export function proxy(request: NextRequest) {
  const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || "framesmith_session";
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
  if (!request.cookies.has(cookieName)) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  // `/api` answers 401 itself (a fetch cannot follow a redirect to a page); static files are public.
  matcher: ["/((?!api/|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};

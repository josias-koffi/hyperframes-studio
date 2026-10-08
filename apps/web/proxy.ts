import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/**
 * Sends a visitor without a session cookie to the sign-in page, before anything renders. Only the cookie's presence
 * is checked here: the API verifies it on every call, and a refused one also lands on `/login`.
 */
export function proxy(request: NextRequest) {
  const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || "framesmith_session";
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
  if (!request.cookies.has(cookieName)) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  // Lets a server component whose API call is refused send the person back here after signing in again.
  const headers = new Headers(request.headers);
  headers.set("x-studio-path", pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // `/api` answers 401 itself (a fetch cannot follow a redirect to a page); static files are public.
  matcher: ["/((?!api/|_next/static|_next/image|email/|icon.svg|favicon.ico).*)"],
};

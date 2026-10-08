import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/** The API on the internal network (`API_URL`): server components call it directly, the browser through `/api`. */
export function apiBase() {
  return process.env.API_URL ?? "http://localhost:3343";
}

export function authCookieName() {
  return process.env.AUTH_COOKIE_NAME?.trim() || "framesmith_session";
}

/** The signed-in person's cookie, handed on to the API, which checks it on every call. */
async function forwardedHeaders(): Promise<Record<string, string>> {
  const session = (await cookies()).get(authCookieName());
  return session ? { cookie: `${session.name}=${session.value}` } : {};
}

/** Where to come back after signing in again: the page being rendered, when the proxy said which. */
async function signInAgain(): Promise<never> {
  const path = (await headers()).get("x-studio-path");
  redirect(`/login?error=session_required${path ? `&next=${encodeURIComponent(path)}` : ""}`);
}

/** A file of the création's folder (BRIEF.md, audio_meta.json…) as text, or null when it does not exist yet. */
export async function serverFile(creationId: string, path: string): Promise<string | null> {
  const response = await fetch(`${apiBase()}/creations/${creationId}/files/${path}`, { cache: "no-store", headers: await forwardedHeaders() });
  if (response.status === 401) await signInAgain();
  return response.ok ? response.text() : null;
}

export async function serverApi<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { cache: "no-store", headers: await forwardedHeaders() });
  if (response.status === 401) await signInAgain();
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

export type SessionUser = { id: string; email: string; role: "admin" | "user" };

/** The signed-in person, or null when the cookie is missing or no longer accepted. */
export async function readSessionUser(): Promise<SessionUser | null> {
  const forwarded = await forwardedHeaders();
  if (!forwarded.cookie) return null;
  const response = await fetch(`${apiBase()}/auth/session`, { cache: "no-store", headers: forwarded }).catch(() => null);
  if (!response?.ok) return null;
  return ((await response.json()) as { user: SessionUser }).user;
}

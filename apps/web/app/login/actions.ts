"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBase, authCookieName } from "@/lib/server-api";

export type LoginState = { message: string } | null;

/** Asks the API to e-mail a sign-in link; the message of a refusal (bad address, too many links) is shown as is. */
export async function requestMagicLink(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "") || undefined;
  const consentAccepted = formData.get("consent") === "on";
  if (!consentAccepted) return { message: "Accepte les conditions pour recevoir ton lien." };

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/passwordless/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, consentAccepted, next }),
      cache: "no-store",
    });
  } catch {
    return { message: "Le studio est momentanément injoignable. Réessaie dans un instant." };
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    return { message: typeof body?.message === "string" ? body.message : "Impossible d'envoyer le lien de connexion." };
  }
  redirect(`/login/check-email?email=${encodeURIComponent(email)}`);
}

/** Ends the session on both sides: the API's answer clears the cookie, and so does this, should the API be down. */
export async function logout() {
  const store = await cookies();
  const session = store.get(authCookieName());
  await fetch(`${apiBase()}/auth/logout`, {
    method: "POST",
    headers: session ? { cookie: `${session.name}=${session.value}` } : {},
    cache: "no-store",
  }).catch(() => null);
  store.delete(authCookieName());
  redirect("/login");
}

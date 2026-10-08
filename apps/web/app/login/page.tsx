import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { readSessionUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Connexion" };

const NOTICES: Record<string, string> = {
  session_required: "Ta session a expiré : reconnecte-toi.",
  link_invalid: "Ce lien de connexion est invalide, déjà utilisé ou expiré. Demandes-en un nouveau.",
};

/** A path of the studio to open after signing in; anything else is dropped. */
function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : undefined;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const { error, next } = await props.searchParams;
  const target = safeNext(next);
  if (await readSessionUser()) redirect(target ?? "/");
  const notice = typeof error === "string" ? NOTICES[error] : undefined;

  return (
    <AuthLayout>
      <LoginForm notice={notice} next={target} />
    </AuthLayout>
  );
}

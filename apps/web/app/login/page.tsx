import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";
import { readSessionUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Session expirée" };

/**
 * Where a request without a valid session lands. The app signs its person in when it opens its window: a session
 * that expired comes back by relaunching it.
 */
export default async function LoginPage() {
  if (await readSessionUser()) redirect("/");
  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Session expirée</CardTitle>
          <CardDescription>Ferme {BRAND.name} et relance l&apos;application : elle te reconnecte en s&apos;ouvrant.</CardDescription>
        </CardHeader>
      </Card>
    </AuthLayout>
  );
}

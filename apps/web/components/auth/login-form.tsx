"use client";

import { MailIcon } from "lucide-react";
import { useActionState } from "react";
import { requestMagicLink } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { BRAND } from "@/lib/brand";

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, null);
  const error = state?.message ?? notice;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Bienvenue sur {BRAND.name}</CardTitle>
        <CardDescription>Reçois ton lien de connexion par e-mail. Pas de mot de passe à retenir.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">E-mail</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="toi@exemple.com" required />
            </Field>
            <Field orientation="horizontal" className="items-start">
              <Checkbox id="consent" name="consent" required className="mt-0.5 shrink-0" />
              {/* `block`: the sentence must wrap on a narrow card instead of being cut. */}
              <FieldLabel htmlFor="consent" className="block w-full font-normal">
                J&apos;accepte que mon adresse serve à me connecter et à recevoir les e-mails de mon compte.
              </FieldLabel>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner /> : <MailIcon />}
                {pending ? "Envoi en cours…" : "Recevoir mon lien"}
              </Button>
              <FieldDescription className="text-center">Première visite ? Ton compte se crée à la connexion.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

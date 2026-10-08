import { button, fallbackLink, note, paragraph, strong } from "./mail-blocks";
import { MAIL_BRAND, formatParisDateTime } from "./mail-brand";
import { renderEmail, type MailBrandConfig } from "./mail-layout";

/** The content of every Framesmith e-mail. Pure functions: the mailers add the sender and the transport. */
export type ComposedEmail = { subject: string; html: string; text: string };

export type MagicLinkEmailInput = { expiresAt: string; magicLink: string; sessionDurationDays: number };

export function composeMagicLinkEmail(brand: MailBrandConfig, input: MagicLinkEmailInput): ComposedEmail {
  const heading = `Connectez-vous à ${MAIL_BRAND.name}`;
  const expiresAt = formatParisDateTime(input.expiresAt);
  return {
    subject: `Votre lien de connexion ${MAIL_BRAND.name}`,
    ...renderEmail(brand, {
      blocks: [
        paragraph("Bonjour,"),
        paragraph("Voici votre lien de connexion au studio. Un clic suffit, sans mot de passe."),
        button("Me connecter", input.magicLink),
        paragraph(
          "Ce lien est valable jusqu'au ",
          strong(expiresAt),
          ` et ne sert qu'une fois. Votre session restera ensuite ouverte ${input.sessionDurationDays} jours.`,
        ),
        fallbackLink(input.magicLink),
        note("Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet e-mail : personne ne peut se connecter sans ce lien."),
      ],
      heading,
      preheader: `Lien valable jusqu'au ${expiresAt}.`,
      reason: `Vous recevez cet e-mail parce que votre adresse a été saisie sur ${MAIL_BRAND.name}.`,
      title: heading,
    }),
  };
}

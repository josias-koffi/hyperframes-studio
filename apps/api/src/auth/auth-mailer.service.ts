import { Inject, Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from "@nestjs/common";
import { composeMagicLinkEmail, type MagicLinkEmailInput } from "../mail/emails";
import { MAIL_CONFIG, type MailConfig } from "../mail/mail.config";
import { MAIL_TRANSPORT, toMailMessage, type MailTransport } from "../mail/mail-transport";

@Injectable()
export class AuthMailerService {
  private readonly logger = new Logger(AuthMailerService.name);

  constructor(
    @Inject(MAIL_CONFIG) private readonly mail: MailConfig,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
  ) {}

  get ready() {
    return this.transport !== null && this.mail.from !== null;
  }

  async sendMagicLinkEmail(to: string, input: MagicLinkEmailInput) {
    if (!this.transport || !this.mail.from) {
      throw new ServiceUnavailableException("L'envoi d'e-mails n'est pas configuré (SMTP_* et EMAIL_FROM).");
    }
    try {
      await this.transport.sendMail(toMailMessage({ from: this.mail.from, replyTo: this.mail.replyTo }, to, composeMagicLinkEmail(this.mail, input)));
    } catch (error) {
      this.logger.error(`Magic-link e-mail to ${to} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new InternalServerErrorException("L'e-mail de connexion n'a pas pu partir. Réessaie dans un instant.");
    }
  }
}

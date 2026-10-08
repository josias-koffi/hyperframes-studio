import { Module } from "@nestjs/common";
import { MAIL_CONFIG, resolveMailConfig } from "./mail.config";
import { MAIL_TRANSPORT, createMailTransport } from "./mail-transport";
import { SMTP_CONFIG, createSmtpConfig, type SmtpConfig } from "./smtp.config";

@Module({
  providers: [
    { provide: SMTP_CONFIG, useFactory: () => createSmtpConfig(process.env) },
    { provide: MAIL_CONFIG, useFactory: () => resolveMailConfig(process.env) },
    { provide: MAIL_TRANSPORT, inject: [SMTP_CONFIG], useFactory: (smtp: SmtpConfig) => createMailTransport(smtp) },
  ],
  exports: [SMTP_CONFIG, MAIL_CONFIG, MAIL_TRANSPORT],
})
export class MailModule {}

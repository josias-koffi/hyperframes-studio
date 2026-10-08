import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvironmentFiles } from "@studio/shared";
import { composeMagicLinkEmail } from "./emails";
import { resolveMailConfig } from "./mail.config";

/** Writes every e-mail, filled with made-up data, to `.email-previews/` to look at in a browser. */
async function main() {
  loadEnvironmentFiles();
  const brand = resolveMailConfig(process.env);
  const out = join(process.cwd(), ".email-previews");
  await mkdir(out, { recursive: true });
  const emails = {
    "magic-link": composeMagicLinkEmail(brand, {
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      magicLink: `${brand.appUrl}/api/auth/passwordless/consume?token=preview-token`,
      sessionDurationDays: 7,
    }),
  };
  for (const [name, email] of Object.entries(emails)) {
    await writeFile(join(out, `${name}.html`), email.html);
    await writeFile(join(out, `${name}.txt`), `${email.subject}\n\n${email.text}`);
    console.log(`${join(out, name)}.html — ${email.subject}`);
  }
}

void main();

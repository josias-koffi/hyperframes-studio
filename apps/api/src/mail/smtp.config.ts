export const SMTP_CONFIG = Symbol("SMTP_CONFIG");

export type SmtpConfig = {
  enabled: boolean;
  provider: string | null;
  server: string | null;
  port: number | null;
  user: string | null;
  password: string | null;
};

const REQUIRED = ["SMTP_SERVER", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;

function read(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

/** SMTP is off when nothing is set; half a configuration is an error, not a silent "off". */
export function createSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const values = {
    SMTP_SERVER: read(env, "SMTP_SERVER") ?? read(env, "SMTP_HOST"),
    SMTP_PORT: read(env, "SMTP_PORT"),
    SMTP_USER: read(env, "SMTP_USER"),
    SMTP_PASSWORD: read(env, "SMTP_PASSWORD"),
  };
  const provider = read(env, "SMTP_PROVIDER");
  if (provider === null && Object.values(values).every((value) => value === null)) {
    return { enabled: false, provider: null, server: null, port: null, user: null, password: null };
  }
  const missing = REQUIRED.filter((key) => values[key] === null);
  if (missing.length > 0) throw new Error(`Incomplete SMTP configuration. Missing: ${missing.join(", ")}.`);
  const port = Number.parseInt(values.SMTP_PORT!, 10);
  if (!Number.isInteger(port) || port <= 0) throw new Error("SMTP_PORT must be a positive integer.");
  return { enabled: true, provider, server: values.SMTP_SERVER, port, user: values.SMTP_USER, password: values.SMTP_PASSWORD };
}

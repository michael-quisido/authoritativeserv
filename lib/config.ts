export const config = {
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? "authnamedb",
    user: process.env.DB_USER ?? "userauth",
    password: process.env.DB_PASS ?? "passuserauth77",
  },
  code: {
    key: process.env.CODE_KEY ?? "83a05165367c5c7d5006bedacef310f4adee1b3272cddebbaec9200efbc2af37",
    length: Number(process.env.CODE_LENGTH ?? 8),
    ttlSeconds: Number(process.env.CODE_TTL ?? 600),
    maxAttempts: Number(process.env.CODE_MAX_ATTEMPTS ?? 5),
  },
  rateLimit: {
    windowSeconds: Number(process.env.RATE_LIMIT_WINDOW ?? 600),
    max: Number(process.env.RATE_LIMIT_MAX ?? 3),
  },
  session: {
    cookieName: "kmcq_sess",
    secure: process.env.SESSION_SECURE === "1",
    idleSeconds: 24 * 60 * 60,
    absoluteSeconds: 7 * 24 * 60 * 60,
  },
  allowedIps: (process.env.ALLOWED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  mail: {
    mode: (process.env.MAIL_MODE ?? "log") as "smtp" | "log",
    from: process.env.MAIL_FROM ?? "no-reply@kmcq-gmbh.com",
    fromName: "KMCQ GmbH URL Checkpoint",
    logFile: process.env.MAIL_LOG_FILE ?? "storage/mail.log",
    smtp: {
      host: process.env.MAIL_SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.MAIL_SMTP_PORT ?? 587),
      user: process.env.MAIL_SMTP_USER ?? "mike082112@gmail.com",
      pass: process.env.MAIL_SMTP_PASS ?? "laehzxoymwwarvki",
    },
  },
} as const;

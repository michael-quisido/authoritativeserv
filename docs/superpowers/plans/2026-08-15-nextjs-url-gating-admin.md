# Next.js URL Gating Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PHP admin app (`php/`) with a Next.js 16 (App Router) implementation: admin login (password + emailed 8-char code), a settings dashboard (users + dummy→real URL rules CRUD), and URL gating where a dummy path emails a code that grants a 10-minute server-side gate to a real path.

**Architecture:** Server Actions + Server Components (no client-fetch API layer). DB-backed sessions (a `sessions` MySQL table; client holds a random httpOnly `kmcq_sess` cookie, server stores its SHA-256 hash + JSON data). A catch-all route (`app/[...slug]/page.tsx`) resolves arbitrary admin-configured dummy/real paths (real-first, like PHP). Auth library logic is ported 1:1 from `php/lib/auth.php` / `php/lib/guard.php` (constant-time compares, atomic one-time code claim, atomic rate-limit inserts). This is Next.js 16.2.7 — `cookies()` is async, `middleware` is renamed `proxy.ts` (used ONLY to generate a per-request CSP nonce, never for auth — the docs forbid auth in Proxy), Server Actions must re-verify auth+CSRF on every call. Next.js App Router ships its RSC payload as inline scripts, so a static `default-src 'self'` CSP would block hydration and break every `useActionState` form; the strict CSP is therefore nonce-based.

**Tech Stack:** Next.js 16.2.7 (App Router, `nodejs` runtime), React 19, TypeScript (strict), mysql2/promise, bcryptjs (verifies the PHP `$2y$` seed hash), nodemailer, Tailwind v4, Vitest (unit), Playwright (E2E).

**Reference implementations to port (read before starting):**
- `php/lib/auth.php` — `generate_code`, `hash_code`, `try_record_rate_limit`, `issue_code`, `verify_code` (atomic claim), `admin_password_ok` (dummy-hash constant time)
- `php/lib/guard.php` — `gate_issue`, `gate_valid`
- `php/routes.php` — login/verify/resend/logout/settings handlers, reserved-path guard (case-insensitive `strtolower` fix), real-path-guard-first routing
- `php/routes_gate.php` — gate send/verify (malformed input also counts an attempt)
- `php/schema.sql` — existing tables (`admins`, `users`, `url_rules`, `verification_codes`, `email_rate_limits`); `verification_codes.type` is `ENUM('admin','user')`

**Environment notes:**
- MySQL is shared with the (soon-retired) PHP app: database `authnamedb`, user `userauth`, password `passuserauth77`, seed admin `admin_security` / `pass_admin_security7777`. The `sessions` table is added by a migration (does not conflict with PHP).
- `lib/db.ts` exists (mysql2 pool) and will be made env-driven.
- Default `MAIL_MODE` is `log` (writes to `storage/mail.log`) so dev/E2E needs no SMTP. Production sets `MAIL_MODE=smtp`.
- **CSRF design note (deviation from PHP, required by Next.js):** Server Components can only READ cookies, never set them (`cookies().set` works only in Server Actions/Route Handlers). So the very first anonymous POST (login submit, gate "send code") has no session yet and no CSRF token; those actions rely on (a) our `verifyOrigin()` (Origin header must equal Host) and (b) Next.js's built-in Server Action origin validation. Once a session exists (after login, and for all settings/gate-verify actions), the per-session CSRF token is enforced. Gate/anonymous sessions deliberately never carry a CSRF token.

---

## File Structure

**Created:**
- `.env.example` — documented env overrides (committed)
- `proxy.ts` — per-request CSP nonce generator (root, next to `app/`)
- `migrations/001_sessions.sql` — `sessions` table
- `scripts/migrate.mjs` — applies `migrations/*.sql` (Node ESM)
- `vitest.config.ts`, `playwright.config.ts`
- `lib/config.ts` — env-derived config (port of `php/config.php`)
- `lib/rules.ts` — pure path validation (normalize, reserved paths)
- `lib/auth.ts` — codes + bcrypt (port of `php/lib/auth.php`)
- `lib/rate-limit.ts` — atomic rate-limit insert (port of `try_record_rate_limit`)
- `lib/session.ts` — DB-backed sessions (pure DB, unit-testable)
- `lib/session-cookie.ts` — `next/headers` cookie wrappers (not unit-testable)
- `lib/guard.ts` — per-rule gate in session data (port of `php/lib/guard.php`)
- `lib/csrf.ts` — CSRF token + origin verification
- `lib/mail.ts` — nodemailer SMTP + log mode (port of `php/lib/mailer.php`)
- `lib/repo.ts` — data-access layer (users, rules, admins)
- `app/actions/auth.ts` — `login`, `verifyAdminCode`, `resendCode`, `logout`
- `app/actions/settings.ts` — `addUser`, `deleteUser`, `addRule`, `deleteRule`, `changePassword`
- `app/actions/gate.ts` — `gateSendCode`, `gateVerify`
- `app/login/page.tsx`, `app/login/login-form.tsx`
- `app/login/code/page.tsx`, `app/login/code/code-form.tsx`, `app/login/code/resend-form.tsx`
- `app/settings/page.tsx`, `app/settings/add-user-form.tsx`, `app/settings/delete-user-button.tsx`, `app/settings/add-rule-form.tsx`, `app/settings/delete-rule-button.tsx`, `app/settings/change-password-form.tsx`, `app/settings/logout-button.tsx`
- `app/[...slug]/page.tsx`, `app/[...slug]/gate-form.tsx`, `app/[...slug]/real-page.tsx`
- `app/forbidden.tsx`, `app/not-found.tsx`
- `tests/unit/config.test.ts`, `tests/unit/rules.test.ts`, `tests/unit/auth.test.ts`, `tests/unit/rate-limit.test.ts`, `tests/unit/session.test.ts`, `tests/unit/guard.test.ts`, `tests/unit/csrf.test.ts`, `tests/unit/mail.test.ts`
- `tests/e2e/global-setup.ts`, `tests/e2e/reset-db.ts`, `tests/e2e/helpers.ts`, `tests/e2e/login.spec.ts`, `tests/e2e/settings.spec.ts`, `tests/e2e/gate.spec.ts`

**Modified:**
- `next.config.ts` — `serverExternalPackages: ['mysql2']`, `experimental.authInterrupts: true`, security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`; CSP is nonce-based in `proxy.ts`, NOT a static header)
- `package.json` — deps + `migrate`, `test:unit`, `test:e2e` scripts
- `.gitignore` — `!.env.example`, `/storage/`, `/test-results/`, `/playwright-report/`
- `lib/db.ts` — env-driven pool
- `app/layout.tsx` — (verify it renders `children`; no change expected)
- `app/page.tsx` — add `await connection()` (from `next/server`) so the landing page renders dynamically; nonce-based CSP requires every page to be dynamically rendered (static pages get no nonce and their inline scripts would be blocked). Page content stays identical.

**Untouched:** `php/` (retires at cutover).

---

## Task 1: Foundation & config

**Files:**
- Modify: `package.json`, `next.config.ts`, `.gitignore`, `lib/db.ts`, `app/page.tsx` (add `await connection()` only)
- Create: `proxy.ts`, `.env.example`, `migrations/001_sessions.sql`, `scripts/migrate.mjs`, `vitest.config.ts`, `playwright.config.ts`

- [ ] **Step 1: Install dependencies**

Run from repo root:
```bash
npm install bcryptjs nodemailer
npm install -D @types/bcryptjs @types/nodemailer vitest @playwright/test
npx playwright install chromium
```
Expected: both installs complete; `npx playwright install chromium` downloads the browser.

- [ ] **Step 2: Configure `next.config.ts`**

Replace the file contents with:
```ts
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["mysql2"],
  experimental: {
    authInterrupts: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```
The CSP is NOT a static header here — it is nonce-based and set in `proxy.ts` (next step). A static `default-src 'self'` would block Next.js's inline RSC payload scripts and break all client-side forms.

- [ ] **Step 2b: Create `proxy.ts` (nonce-based strict CSP)**

Create `proxy.ts` in the repo root (same level as `app/`):
```ts
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = crypto.randomBytes(32).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```
Notes:
- `crypto.randomUUID()` is used in the official docs, but `node:crypto`'s `randomBytes` gives the same 32-byte base64 nonce deterministically; either is fine.
- `'unsafe-eval'` is required only in development (React uses `eval` for enhanced error stacks); production omits it.
- The matcher skips static assets and prefetch requests (they don't need the CSP header).

- [ ] **Step 2c: Force dynamic rendering on the landing page**

Nonce-based CSP requires **every** page to be dynamically rendered (docs: "To use a nonce, your page must be dynamically rendered"). The landing page is currently static, so its build-time inline scripts would carry no nonce and be blocked. Edit `app/page.tsx` — replace:
```tsx
import Image from "next/image";

export default function Home() {
```
with:
```tsx
import Image from "next/image";
import { connection } from "next/server";

export default async function Home() {
  await connection();
```
Keep the rest of the component body identical. `await connection()` suspends until the incoming request is available, forcing dynamic rendering on this page.

- [ ] **Step 3: Update `.gitignore` and create `.env.example`**

Append to `.gitignore`:
```
!.env.example
/storage/
/test-results/
/playwright-report/
```

Create `.env.example`:
```
# Copy to .env.local to override defaults. Every value is optional (see lib/config.ts).
DB_HOST=localhost
DB_PORT=3306
DB_NAME=authnamedb
DB_USER=userauth
DB_PASS=passuserauth77
CODE_KEY=replace-with-a-long-random-hex-secret
CODE_LENGTH=8
CODE_TTL=600
CODE_MAX_ATTEMPTS=5
RATE_LIMIT_WINDOW=600
RATE_LIMIT_MAX=3
SESSION_SECURE=0
MAIL_MODE=log
MAIL_SMTP_HOST=smtp.gmail.com
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=
MAIL_SMTP_PASS=
MAIL_FROM=no-reply@kmcq-gmbh.com
MAIL_LOG_FILE=storage/mail.log
```

- [ ] **Step 4: Create the sessions migration**

Create `migrations/001_sessions.sql`:
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  admin_id INT UNSIGNED NULL,
  data JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB;
```

Create `scripts/migrate.mjs`:
```js
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "userauth",
  password: process.env.DB_PASS || "passuserauth77",
  database: process.env.DB_NAME || "authnamedb",
};

const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
for (const file of fs.readdirSync(path.join(root, "migrations")).sort()) {
  if (!file.endsWith(".sql")) continue;
  const sql = fs.readFileSync(path.join(root, "migrations", file), "utf8");
  await conn.query(sql);
  console.log(`applied ${file}`);
}
await conn.end();
```

Add scripts to `package.json`:
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "migrate": "node scripts/migrate.mjs",
    "test:unit": "vitest run",
    "test:e2e": "playwright test"
  }
```

- [ ] **Step 5: Apply the migration**

Run: `npm run migrate`
Expected: `applied 001_sessions.sql`, and verify the table exists:
`mysql -u userauth -ppassuserauth77 authnamedb -e "DESCRIBE sessions;"` shows columns `token_hash`, `admin_id`, `data`, `expires_at`.

- [ ] **Step 6: Create Vitest and Playwright configs**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
```

Create `playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { MAIL_MODE: "log" },
  },
});
```

- [ ] **Step 7: Verify foundation**

Run: `npm run lint && npm run build`
Expected: lint clean; build succeeds (existing landing page builds with the new config, now as a dynamic route). CSP correctness is verified later by the E2E specs (they fail if the nonce CSP blocks Next.js inline scripts).

- [ ] **Step 8: Commit**

```bash
git add next.config.ts proxy.ts app/page.tsx .gitignore .env.example migrations scripts vitest.config.ts playwright.config.ts package.json package-lock.json
git commit -m "chore(next): foundation config, nonce CSP proxy, dynamic landing, deps, sessions migration, test runners"
```

---

## Task 2: Config, DB pool, and path validation

**Files:**
- Create: `lib/config.ts`, `lib/rules.ts`, `tests/unit/config.test.ts`, `tests/unit/rules.test.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { config } from "@/lib/config";

describe("config", () => {
  it("has the documented defaults", () => {
    expect(config.code.length).toBe(8);
    expect(config.code.ttlSeconds).toBe(600);
    expect(config.code.maxAttempts).toBe(5);
    expect(config.rateLimit.windowSeconds).toBe(600);
    expect(config.rateLimit.max).toBe(3);
    expect(config.session.cookieName).toBe("kmcq_sess");
    expect(config.mail.mode).toBe("log");
  });
});
```

Create `tests/unit/rules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizePath, collidesWithAppRoutes, RESERVED_PATHS } from "@/lib/rules";

describe("normalizePath", () => {
  it("adds a leading slash", () => {
    expect(normalizePath("settings")).toBe("/settings");
  });
  it("strips trailing slashes", () => {
    expect(normalizePath("/foo/bar/")).toBe("/foo/bar");
  });
  it("keeps inner slashes", () => {
    expect(normalizePath("/foo/bar")).toBe("/foo/bar");
  });
  it("rejects empty input", () => {
    expect(normalizePath("")).toBeNull();
  });
  it("rejects whitespace", () => {
    expect(normalizePath("   ")).toBeNull();
  });
  it("rejects the root", () => {
    expect(normalizePath("/")).toBeNull();
  });
});

describe("collidesWithAppRoutes", () => {
  it.each(RESERVED_PATHS)("rejects %s", (p) => {
    expect(collidesWithAppRoutes(p)).toBe(true);
  });
  it("rejects case variants (DB collation is case-insensitive)", () => {
    expect(collidesWithAppRoutes("/SETTINGS")).toBe(true);
    expect(collidesWithAppRoutes("/Login")).toBe(true);
  });
  it("allows ordinary paths", () => {
    expect(collidesWithAppRoutes("/administrators")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/config.test.ts tests/unit/rules.test.ts`
Expected: FAIL — `Cannot find module '@/lib/config'`.

- [ ] **Step 3: Implement `lib/config.ts`**

Create `lib/config.ts`:
```ts
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
```

- [ ] **Step 4: Implement `lib/rules.ts`**

Create `lib/rules.ts`:
```ts
export const RESERVED_PATHS = [
  "/login",
  "/login/code",
  "/login/resend",
  "/logout",
  "/settings",
] as const;

export function normalizePath(raw: string): string | null {
  const t = raw.trim();
  if (t === "" || t === "/") return null;
  const withSlash = t.startsWith("/") ? t : `/${t}`;
  const out = withSlash.replace(/\/+$/, "");
  return out === "" ? null : out;
}

export function collidesWithAppRoutes(path: string): boolean {
  const lower = path.toLowerCase();
  return (RESERVED_PATHS as readonly string[]).some((r) => r === lower);
}
```

- [ ] **Step 5: Make `lib/db.ts` env-driven**

Replace `lib/db.ts` contents with:
```ts
import mysql from "mysql2/promise";
import { config } from "./config";

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/config.test.ts tests/unit/rules.test.ts`
Expected: PASS (all green).

- [ ] **Step 7: Commit**

```bash
git add lib/config.ts lib/rules.ts lib/db.ts tests/unit/config.test.ts tests/unit/rules.test.ts
git commit -m "feat(next): config, env-driven db pool, path validation helpers"
```

---

## Task 3: Auth library (codes + bcrypt)

**Files:**
- Create: `lib/auth.ts`, `tests/unit/auth.test.ts`

Ports `php/lib/auth.php`: `generate_code`, `hash_code`, `issue_code`, `verify_code` (atomic claim, malformed counts via hash mismatch), `admin_password_ok` (dummy-hash constant time). Adds `hashPassword`/`verifyPassword` (bcryptjs, cost 12) and `codeFormatOk`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pool from "@/lib/db";
import {
  adminPasswordOk,
  generateCode,
  hashCode,
  issueCode,
  verifyCode,
  codeFormatOk,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

const username = `unit_auth_${Date.now()}`;
let userId = 0;

beforeAll(async () => {
  const [result] = await pool.execute(
    "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
    [username, hashPassword("unitpass123"), `${username}@example.com`]
  );
  userId = Number(result.insertId);
});

afterAll(async () => {
  await pool.execute("DELETE FROM verification_codes WHERE user_id = ?", [userId]);
  await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
});

describe("password helpers", () => {
  it("verifies the seeded PHP $2y$ bcrypt hash", async () => {
    const id = await adminPasswordOk("admin_security", "pass_admin_security7777");
    expect(id).toBeTypeOf("number");
  });
  it("rejects a wrong password", async () => {
    expect(await adminPasswordOk("admin_security", "nope")).toBeNull();
  });
  it("returns null for an unknown admin", async () => {
    expect(await adminPasswordOk("no_such_admin_xyz", "anything")).toBeNull();
  });
  it("hash/verify roundtrips", () => {
    const h = hashPassword("pass1234567");
    expect(verifyPassword("pass1234567", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});

describe("code generation", () => {
  it("generates 8 alphanumeric characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateCode()).toMatch(/^[A-Za-z0-9]{8}$/);
    }
  });
  it("validates format", () => {
    expect(codeFormatOk("AbC12345")).toBe(true);
    expect(codeFormatOk("WRONGCODE")).toBe(false);
    expect(codeFormatOk("abc")).toBe(false);
  });
  it("hash is deterministic and not the plaintext", () => {
    expect(hashCode("abc12345")).toBe(hashCode("abc12345"));
    expect(hashCode("abc12345")).not.toContain("abc12345");
  });
});

describe("verify_code flow", () => {
  it("rejects wrong code, accepts correct, single use", async () => {
    const code = await issueCode({ type: "user", adminId: null, userId, ruleId: null });
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, "WRONGWRONG")).toBe(false);
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, code)).toBe(true);
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, code)).toBe(false);
  });
  it("locks the code after 5 attempts", async () => {
    const code = await issueCode({ type: "user", adminId: null, userId, ruleId: null });
    for (let i = 0; i < 5; i++) {
      await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, "BADCODE0");
    }
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, code)).toBe(false);
  });
  it("returns false when no code exists for the scope", async () => {
    expect(
      await verifyCode({ type: "user", adminId: null, userId: 999999999, ruleId: null }, "ABCDEFGH")
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth'`.

- [ ] **Step 3: Implement `lib/auth.ts`**

Create `lib/auth.ts`:
```ts
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "./db";
import { config } from "./config";

const CODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DUMMY_PASSWORD_HASH = "$2y$12$n9FAyfQMhdNYNVku.aDm4eReZhwO7mEiwajXVjrvrKr6l2f4KgqiO";

export function generateCode(length: number = config.code.length): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return out;
}

export function hashCode(code: string): string {
  return crypto.createHmac("sha256", config.code.key).update(code).digest("hex");
}

export function codeFormatOk(code: string): boolean {
  return new RegExp(`^[A-Za-z0-9]{${config.code.length}}$`).test(code);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export interface CodeTarget {
  type: "admin" | "user";
  adminId: number | null;
  userId: number | null;
  ruleId: number | null;
}

export async function issueCode(target: CodeTarget): Promise<string> {
  const code = generateCode();
  await pool.execute(
    `INSERT INTO verification_codes (type, admin_id, user_id, rule_id, code_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ${config.code.ttlSeconds} SECOND)`,
    [target.type, target.adminId, target.userId, target.ruleId, hashCode(code)]
  );
  return code;
}

export async function verifyCode(target: CodeTarget, input: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, code_hash, attempts, expires_at FROM verification_codes
     WHERE type = ? AND admin_id <=> ? AND user_id <=> ? AND rule_id <=> ? AND used_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [target.type, target.adminId, target.userId, target.ruleId]
  );
  const row = rows[0];
  if (!row) return false;
  const expired = new Date(row.expires_at as Date).getTime() < Date.now();
  if (Number(row.attempts) >= config.code.maxAttempts || expired) {
    await pool.execute("UPDATE verification_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL", [row.id]);
    return false;
  }
  if (!timingSafeEqualHex(row.code_hash as string, hashCode(input))) {
    await pool.execute("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    return false;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE verification_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL AND attempts < ?",
    [row.id, config.code.maxAttempts]
  );
  return result.affectedRows === 1;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function adminPasswordOk(username: string, password: string): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, password_hash FROM admins WHERE username = ? LIMIT 1",
    [username]
  );
  const row = rows[0];
  const hash = row ? (row.password_hash as string) : DUMMY_PASSWORD_HASH;
  const ok = verifyPassword(password, hash);
  if (!row || !ok) return null;
  return Number(row.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: PASS (all 8 tests). Requires MySQL running with the seed admin.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts tests/unit/auth.test.ts
git commit -m "feat(next): auth lib - HMAC codes, atomic claim, bcrypt"
```

---

## Task 4: Rate limiting, sessions, and guard

**Files:**
- Create: `lib/rate-limit.ts`, `lib/session.ts`, `lib/guard.ts`, `tests/unit/rate-limit.test.ts`, `tests/unit/session.test.ts`, `tests/unit/guard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/rate-limit.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import pool from "@/lib/db";
import { tryRecordRateLimit, deleteRateLimitRecord } from "@/lib/rate-limit";

const scope = `unit_rl_${Date.now()}`;

afterAll(async () => {
  await pool.execute("DELETE FROM email_rate_limits WHERE scope_key = ?", [scope]);
});

describe("rate limiting", () => {
  it("allows up to max then blocks", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await tryRecordRateLimit(scope);
      expect(id).not.toBeNull();
      ids.push(id as number);
    }
    expect(await tryRecordRateLimit(scope)).toBeNull();
    for (const id of ids) await deleteRateLimitRecord(id);
  });
});
```

Create `tests/unit/session.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import {
  createSession,
  getSessionByToken,
  updateSessionData,
  deleteSessionById,
  regenerateSessionToken,
} from "@/lib/session";

const ids: number[] = [];

afterAll(async () => {
  for (const id of ids) await deleteSessionById(id);
});

describe("sessions", () => {
  it("creates and reads a session", async () => {
    const { session, token } = await createSession({ csrf: "abc" });
    ids.push(session.id);
    const got = await getSessionByToken(token);
    expect(got).not.toBeNull();
    expect(got!.data.csrf).toBe("abc");
  });
  it("returns null for an unknown token", async () => {
    expect(await getSessionByToken("deadbeef".repeat(8))).toBeNull();
  });
  it("updates data and admin_id", async () => {
    const { session, token } = await createSession({});
    ids.push(session.id);
    await updateSessionData(session.id, { admin_pw_ok: 1 }, 1);
    const got = await getSessionByToken(token);
    expect(got!.adminId).toBe(1);
    expect(got!.data.admin_pw_ok).toBe(1);
  });
  it("regenerates the token, invalidating the old one", async () => {
    const { session, token } = await createSession({});
    ids.push(session.id);
    const newToken = await regenerateSessionToken(session.id);
    expect(newToken).not.toBe(token);
    expect(await getSessionByToken(token)).toBeNull();
    expect(await getSessionByToken(newToken)).not.toBeNull();
  });
  it("deletes a session", async () => {
    const { session, token } = await createSession({});
    await deleteSessionById(session.id);
    expect(await getSessionByToken(token)).toBeNull();
  });
});
```

Create `tests/unit/guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { gateIssue, gateValid } from "@/lib/guard";

describe("gate", () => {
  it("a freshly issued gate is valid", () => {
    const data = gateIssue({}, 42);
    expect(gateValid(data, 42)).toBe(true);
  });
  it("gates are per-rule", () => {
    const data = gateIssue({}, 1);
    expect(gateValid(data, 2)).toBe(false);
  });
  it("an expired gate is invalid", () => {
    const data = gateIssue({}, 1);
    data.gates!["1"] = Math.floor(Date.now() / 1000) - 1;
    expect(gateValid(data, 1)).toBe(false);
  });
  it("no gates at all is invalid", () => {
    expect(gateValid({}, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/rate-limit.test.ts tests/unit/session.test.ts tests/unit/guard.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rate-limit'` (and the other two).

- [ ] **Step 3: Implement `lib/rate-limit.ts`**

Create `lib/rate-limit.ts`:
```ts
import type { ResultSetHeader } from "mysql2";
import pool from "./db";
import { config } from "./config";

export async function tryRecordRateLimit(scope: string): Promise<number | null> {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO email_rate_limits (scope_key, window_start)
       SELECT ?, NOW() FROM dual
       WHERE (SELECT COUNT(*) FROM email_rate_limits
              WHERE scope_key = ? AND window_start >= (NOW() - INTERVAL ${config.rateLimit.windowSeconds} SECOND)) < ${config.rateLimit.max}`,
      [scope, scope]
    );
    return result.insertId || null;
  } catch {
    return null;
  }
}

export async function deleteRateLimitRecord(id: number): Promise<void> {
  await pool.execute("DELETE FROM email_rate_limits WHERE id = ?", [id]);
}
```

- [ ] **Step 4: Implement `lib/session.ts`**

Create `lib/session.ts`:
```ts
import crypto from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "./db";
import { config } from "./config";

export interface SessionData {
  csrf?: string;
  admin_pw_ok?: number;
  admin_verified?: number;
  admin_username?: string;
  gates?: Record<string, number>;
}

export interface SessionRecord {
  id: number;
  adminId: number | null;
  data: SessionData;
  expiresAt: Date;
  lastSeenAt: Date;
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function pruneExpired(): Promise<void> {
  await pool.execute(
    `DELETE FROM sessions WHERE expires_at < NOW()
       OR last_seen_at < NOW() - INTERVAL ${config.session.idleSeconds} SECOND`
  );
}

export async function createSession(data: SessionData = {}): Promise<{ session: SessionRecord; token: string }> {
  await pruneExpired();
  const token = randomToken();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO sessions (token_hash, admin_id, data, expires_at)
     VALUES (?, ?, ?, NOW() + INTERVAL ${config.session.absoluteSeconds} SECOND)`,
    [hashToken(token), null, JSON.stringify(data)]
  );
  return {
    session: {
      id: result.insertId,
      adminId: null,
      data,
      expiresAt: new Date(Date.now() + config.session.absoluteSeconds * 1000),
      lastSeenAt: new Date(),
    },
    token,
  };
}

export async function getSessionByToken(token: string): Promise<SessionRecord | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, admin_id, data, expires_at, last_seen_at FROM sessions WHERE token_hash = ? LIMIT 1",
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at as Date).getTime() < Date.now()) {
    await deleteSessionById(Number(row.id));
    return null;
  }
  if (Date.now() - new Date(row.last_seen_at as Date).getTime() > config.session.idleSeconds * 1000) {
    await deleteSessionById(Number(row.id));
    return null;
  }
  await pool.execute("UPDATE sessions SET last_seen_at = NOW() WHERE id = ?", [row.id]);
  let data: SessionData = {};
  if (typeof row.data === "string") {
    try {
      data = JSON.parse(row.data) as SessionData;
    } catch {
      data = {};
    }
  } else if (row.data && typeof row.data === "object") {
    data = row.data as SessionData;
  }
  return {
    id: Number(row.id),
    adminId: (row.admin_id as number | null) ?? null,
    data,
    expiresAt: row.expires_at as Date,
    lastSeenAt: row.last_seen_at as Date,
  };
}

export async function updateSessionData(id: number, data: SessionData, adminId?: number | null): Promise<void> {
  await pool.execute("UPDATE sessions SET data = ?, admin_id = ? WHERE id = ?", [
    JSON.stringify(data),
    adminId ?? null,
    id,
  ]);
}

export async function deleteSessionById(id: number): Promise<void> {
  await pool.execute("DELETE FROM sessions WHERE id = ?", [id]);
}

export async function regenerateSessionToken(id: number): Promise<string> {
  const token = randomToken();
  await pool.execute("UPDATE sessions SET token_hash = ? WHERE id = ?", [hashToken(token), id]);
  return token;
}
```

- [ ] **Step 5: Implement `lib/guard.ts`**

Create `lib/guard.ts`:
```ts
import { config } from "./config";
import type { SessionData } from "./session";

export function gateIssue(data: SessionData, ruleId: number): SessionData {
  return {
    ...data,
    gates: { ...(data.gates ?? {}), [String(ruleId)]: Math.floor(Date.now() / 1000) + config.code.ttlSeconds },
  };
}

export function gateValid(data: SessionData | null | undefined, ruleId: number): boolean {
  const expires = data?.gates?.[String(ruleId)];
  if (!expires) return false;
  return expires > Math.floor(Date.now() / 1000);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/rate-limit.test.ts tests/unit/session.test.ts tests/unit/guard.test.ts`
Expected: PASS (all green). Requires the `sessions` table (migration applied in Task 1).

- [ ] **Step 7: Commit**

```bash
git add lib/rate-limit.ts lib/session.ts lib/guard.ts tests/unit/rate-limit.test.ts tests/unit/session.test.ts tests/unit/guard.test.ts
git commit -m "feat(next): atomic rate limiting, db-backed sessions, per-rule gates"
```

---

## Task 5: Mailer

**Files:**
- Create: `lib/mail.ts`, `tests/unit/mail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/mail.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { sendVerificationEmail } from "@/lib/mail";

const logFile = "storage/mail.log";

beforeAll(() => {
  fs.rmSync(logFile, { force: true });
});

afterAll(() => {
  fs.rmSync(logFile, { force: true });
});

describe("mail log mode", () => {
  it("writes the verification email to the log and returns true", async () => {
    const ok = await sendVerificationEmail("test@example.com", "ABCDEFGH");
    expect(ok).toBe(true);
    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("TO=test@example.com");
    expect(content).toContain("verification code is: ABCDEFGH");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/mail.test.ts`
Expected: FAIL — `Cannot find module '@/lib/mail'`.

- [ ] **Step 3: Implement `lib/mail.ts`**

Create `lib/mail.ts`:
```ts
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { config } from "./config";

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (config.mail.mode === "log") {
    try {
      const dir = path.dirname(config.mail.logFile);
      fs.mkdirSync(dir, { recursive: true });
      const line = `[${new Date().toISOString()}] TO=${to} SUBJECT=${subject} BODY=${body.replace(/\n/g, "\\n")}\n`;
      fs.appendFileSync(config.mail.logFile, line, { flag: "a" });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const transporter = nodemailer.createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      secure: false,
      requireTLS: true,
      auth: { user: config.mail.smtp.user, pass: config.mail.smtp.pass },
      connectionTimeout: 10_000,
    });
    await transporter.sendMail({
      from: `"${config.mail.fromName}" <${config.mail.from}>`,
      to,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    console.error("Mail send failed:", err);
    return false;
  }
}

export function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  const subject = "Your KMCQ GmbH verification code";
  const body = `Your one-time verification code is: ${code}\n\nThis code expires in 10 minutes and can only be used once.\n\nIf you did not request this code, please ignore this email.`;
  return sendEmail(to, subject, body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/mail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mail.ts tests/unit/mail.test.ts
git commit -m "feat(next): nodemailer smtp + log-mode mailer"
```

---

## Task 6: CSRF, session cookies, and data access layer

**Files:**
- Create: `lib/csrf.ts`, `lib/session-cookie.ts`, `lib/repo.ts`, `tests/unit/csrf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/csrf.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { newCsrfToken, verifyCsrfToken } from "@/lib/csrf";

describe("csrf", () => {
  it("accepts a matching token", () => {
    const token = newCsrfToken();
    expect(verifyCsrfToken({ csrf: token }, token)).toBe(true);
  });
  it("rejects a wrong token", () => {
    const token = newCsrfToken();
    expect(verifyCsrfToken({ csrf: token }, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")).toBe(false);
  });
  it("rejects when no csrf is stored", () => {
    expect(verifyCsrfToken({}, "abcdef")).toBe(false);
  });
  it("rejects non-string input", () => {
    const token = newCsrfToken();
    expect(verifyCsrfToken({ csrf: token }, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/csrf.test.ts`
Expected: FAIL — `Cannot find module '@/lib/csrf'`.

- [ ] **Step 3: Implement `lib/csrf.ts`**

Create `lib/csrf.ts`:
```ts
import crypto from "node:crypto";
import { headers } from "next/headers";
import type { SessionData } from "./session";

export function newCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyCsrfToken(data: SessionData | null | undefined, submitted: unknown): boolean {
  const expected = data?.csrf;
  if (!expected || typeof submitted !== "string" || submitted === "") return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(submitted, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function verifyOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement `lib/session-cookie.ts`**

Create `lib/session-cookie.ts`:
```ts
import { cookies } from "next/headers";
import { config } from "./config";
import { createSession, getSessionByToken, type SessionRecord } from "./session";

export async function getCurrentSession(): Promise<SessionRecord | null> {
  const store = await cookies();
  const token = store.get(config.session.cookieName)?.value;
  if (!token) return null;
  return getSessionByToken(token);
}

export async function ensureSession(): Promise<{ session: SessionRecord; token: string }> {
  const store = await cookies();
  const existing = store.get(config.session.cookieName)?.value;
  if (existing) {
    const session = await getSessionByToken(existing);
    if (session) return { session, token: existing };
  }
  const created = await createSession();
  store.set(config.session.cookieName, created.token, sessionCookieOptions());
  return created;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(config.session.cookieName, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(config.session.cookieName);
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: config.session.secure,
    path: "/",
    maxAge: config.session.absoluteSeconds,
  };
}
```

- [ ] **Step 5: Implement `lib/repo.ts`**

Create `lib/repo.ts`:
```ts
import type { RowDataPacket } from "mysql2";
import pool from "./db";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  created_at: Date;
}

export interface RuleRow {
  id: number;
  dummy_path: string;
  real_path: string;
  associated_user_id: number;
  created_at: Date;
}

export interface RuleWithUser extends RuleRow {
  username: string;
}

export async function getAdminEmail(adminId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT email FROM admins WHERE id = ? LIMIT 1", [adminId]);
  return rows[0] ? (rows[0].email as string) : null;
}

export async function getUserEmail(userId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT email FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] ? (rows[0].email as string) : null;
}

export async function getUserById(userId: number): Promise<UserRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] ? (rows[0] as UserRow) : null;
}

export async function getRuleById(ruleId: number): Promise<RuleRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM url_rules WHERE id = ? LIMIT 1", [ruleId]);
  return rows[0] ? (rows[0] as RuleRow) : null;
}

export async function getRuleByRealPath(path: string): Promise<RuleRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM url_rules WHERE real_path = ? LIMIT 1", [path]);
  return rows[0] ? (rows[0] as RuleRow) : null;
}

export async function getRuleByDummyPath(path: string): Promise<RuleRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM url_rules WHERE dummy_path = ? LIMIT 1", [path]);
  return rows[0] ? (rows[0] as RuleRow) : null;
}

export async function listUsers(): Promise<UserRow[]> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id, username, email, created_at FROM users ORDER BY id");
  return rows as UserRow[];
}

export async function listRules(): Promise<RuleWithUser[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT r.id, r.dummy_path, r.real_path, r.associated_user_id, r.created_at, u.username FROM url_rules r JOIN users u ON u.id = r.associated_user_id ORDER BY r.id"
  );
  return rows as RuleWithUser[];
}

export async function insertUser(username: string, passwordHash: string, email: string): Promise<void> {
  await pool.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", [
    username,
    passwordHash,
    email,
  ]);
}

export async function deleteUser(id: number): Promise<void> {
  await pool.execute("DELETE FROM users WHERE id = ?", [id]);
}

export async function insertRule(dummyPath: string, realPath: string, userId: number): Promise<void> {
  await pool.execute("INSERT INTO url_rules (dummy_path, real_path, associated_user_id) VALUES (?, ?, ?)", [
    dummyPath,
    realPath,
    userId,
  ]);
}

export async function deleteRule(id: number): Promise<void> {
  await pool.execute("DELETE FROM url_rules WHERE id = ?", [id]);
}

export async function getAdminPasswordHash(adminId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT password_hash FROM admins WHERE id = ? LIMIT 1", [adminId]);
  return rows[0] ? (rows[0].password_hash as string) : null;
}

export async function updateAdminPassword(adminId: number, passwordHash: string): Promise<void> {
  await pool.execute("UPDATE admins SET password_hash = ? WHERE id = ?", [passwordHash, adminId]);
}

export async function rulePathCollisions(dummyPath: string, realPath: string): Promise<RuleRow[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM url_rules
     WHERE LOWER(dummy_path) = LOWER(?) OR LOWER(real_path) = LOWER(?)
        OR LOWER(real_path) = LOWER(?) OR LOWER(dummy_path) = LOWER(?)`,
    [dummyPath, dummyPath, realPath, realPath]
  );
  return rows as RuleRow[];
}
```

- [ ] **Step 6: Run the CSRF test and the full unit suite**

Run: `npm run test:unit`
Expected: all unit tests pass (config, rules, auth, rate-limit, session, guard, csrf, mail).

- [ ] **Step 7: Commit**

```bash
git add lib/csrf.ts lib/session-cookie.ts lib/repo.ts tests/unit/csrf.test.ts
git commit -m "feat(next): csrf + origin checks, session cookie wrappers, data access layer"
```

---

## Task 7: Auth actions and login pages

**Files:**
- Create: `app/actions/auth.ts`, `app/login/page.tsx`, `app/login/login-form.tsx`, `app/login/code/page.tsx`, `app/login/code/code-form.tsx`, `app/login/code/resend-form.tsx`, `app/forbidden.tsx`, `app/not-found.tsx`, `tests/e2e/global-setup.ts`, `tests/e2e/reset-db.ts`, `tests/e2e/helpers.ts`, `tests/e2e/login.spec.ts`
- Modify: none (next.config already set)

- [ ] **Step 1: Write the failing E2E test and helpers**

Create `tests/e2e/reset-db.ts`:
```ts
import pool from "../../lib/db";
import fs from "node:fs";

export async function resetDatabase(): Promise<void> {
  await pool.execute("DELETE FROM sessions");
  await pool.execute("DELETE FROM email_rate_limits");
  await pool.execute("DELETE FROM verification_codes");
  await pool.execute("DELETE FROM url_rules");
  await pool.execute("DELETE FROM users");
  fs.rmSync("storage/mail.log", { force: true });
}
```

Create `tests/e2e/global-setup.ts`:
```ts
import { resetDatabase } from "./reset-db";

export default async function globalSetup(): Promise<void> {
  await resetDatabase();
}
```

Create `tests/e2e/helpers.ts`:
```ts
import fs from "node:fs";
import { expect, type Page } from "@playwright/test";
import pool from "../../lib/db";

export async function lastCodeFromLog(logFile = "storage/mail.log"): Promise<string> {
  const content = fs.readFileSync(logFile, "utf8");
  const matches = content.match(/verification code is: ([A-Za-z0-9]{8})/g);
  const last = matches?.at(-1);
  if (!last) throw new Error("no code found in mail.log");
  return last.slice(-8);
}

export async function resetRateLimits(): Promise<void> {
  await pool.execute("DELETE FROM email_rate_limits");
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin_security");
  await page.getByLabel("Password").fill("pass_admin_security7777");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/code/);
  const code = await lastCodeFromLog();
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/settings/);
}
```

Create `tests/e2e/login.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { lastCodeFromLog, loginAsAdmin, resetRateLimits } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

test("login: wrong password stays on login, correct password verifies to settings", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Admin Login")).toBeVisible();

  await page.getByLabel("Username").fill("admin_security");
  await page.getByLabel("Password").fill("wrongpass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();

  await page.getByLabel("Username").fill("admin_security");
  await page.getByLabel("Password").fill("pass_admin_security7777");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/code/);

  const code = await lastCodeFromLog();
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText("Settings Dashboard")).toBeVisible();
});

test("logout returns to login", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `npx playwright test tests/e2e/login.spec.ts`
Expected: FAIL — navigation errors (routes don't exist yet).

- [ ] **Step 3: Implement `app/actions/auth.ts`**

Create `app/actions/auth.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { ensureSession, getCurrentSession, setSessionCookie, clearSessionCookie } from "@/lib/session-cookie";
import { newCsrfToken, verifyCsrfToken, verifyOrigin } from "@/lib/csrf";
import { adminPasswordOk, codeFormatOk, issueCode, verifyCode } from "@/lib/auth";
import { tryRecordRateLimit } from "@/lib/rate-limit";
import { getAdminEmail } from "@/lib/repo";
import { sendVerificationEmail } from "@/lib/mail";
import { regenerateSessionToken, updateSessionData, deleteSessionById } from "@/lib/session";

export interface FormState {
  errors: string[];
  ok?: boolean;
  message?: string;
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const { session } = await ensureSession();
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const adminId = await adminPasswordOk(username, password);
  if (adminId === null) return { errors: ["Invalid username or password."] };
  if (!(await tryRecordRateLimit(`admin:${adminId}`))) {
    return { errors: ["Too many codes requested. Try again later."] };
  }
  const code = await issueCode({ type: "admin", adminId, userId: null, ruleId: null });
  const email = await getAdminEmail(adminId);
  await sendVerificationEmail(email ?? "", code);
  const data = {
    ...session.data,
    csrf: session.data.csrf ?? newCsrfToken(),
    admin_pw_ok: adminId,
    admin_username: username,
  };
  await updateSessionData(session.id, data, adminId);
  const newToken = await regenerateSessionToken(session.id);
  await setSessionCookie(newToken);
  redirect("/login/code");
}

export async function verifyAdminCode(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.data.admin_pw_ok) redirect("/login");
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const input = String(formData.get("code") ?? "").trim();
  if (!codeFormatOk(input)) return { errors: ["Code must be exactly 8 alphanumeric characters."] };
  const adminId = session.data.admin_pw_ok;
  if (await verifyCode({ type: "admin", adminId, userId: null, ruleId: null }, input)) {
    const data = { ...session.data, admin_verified: adminId };
    delete data.admin_pw_ok;
    await updateSessionData(session.id, data, adminId);
    const newToken = await regenerateSessionToken(session.id);
    await setSessionCookie(newToken);
    redirect("/settings");
  }
  return { errors: ["Invalid or expired code."] };
}

export async function resendCode(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.data.admin_pw_ok) redirect("/login");
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const adminId = session.data.admin_pw_ok;
  if (!(await tryRecordRateLimit(`admin:${adminId}`))) {
    return { errors: ["Too many requests. Try again later."] };
  }
  const code = await issueCode({ type: "admin", adminId, userId: null, ruleId: null });
  const email = await getAdminEmail(adminId);
  await sendVerificationEmail(email ?? "", code);
  return { errors: [], ok: true, message: "New code sent." };
}

export async function logout(): Promise<void> {
  if (await verifyOrigin()) {
    const session = await getCurrentSession();
    if (session) await deleteSessionById(session.id);
  }
  await clearSessionCookie();
  redirect("/login");
}
```

- [ ] **Step 4: Implement the login pages**

Create `app/login/page.tsx`:
```tsx
import { getCurrentSession } from "@/lib/session-cookie";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentSession();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">Admin Login</h1>
        <LoginForm csrf={session?.data.csrf ?? null} />
      </div>
    </main>
  );
}
```

Create `app/login/login-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/actions/auth";

export function LoginForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, { errors: [] });
  return (
    <form action={action} className="space-y-4">
      {csrf !== null && <input type="hidden" name="csrf" value={csrf} />}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

Create `app/login/code/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { CodeForm } from "./code-form";
import { ResendForm } from "./resend-form";

export default async function CodePage() {
  const session = await getCurrentSession();
  if (!session || !session.data.admin_pw_ok) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Verify Code</h1>
        <p className="mb-4 text-sm text-slate-600">
          Enter the 8-character code sent to your email.
        </p>
        <CodeForm csrf={session.data.csrf ?? null} />
        <div className="mt-4 border-t pt-4">
          <ResendForm csrf={session.data.csrf ?? null} />
        </div>
      </div>
    </main>
  );
}
```

Create `app/login/code/code-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { verifyAdminCode, type FormState } from "@/app/actions/auth";

export function CodeForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyAdminCode, { errors: [] });
  return (
    <form action={action} className="space-y-4">
      {csrf !== null && <input type="hidden" name="csrf" value={csrf} />}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          maxLength={8}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
```

Create `app/login/code/resend-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { resendCode, type FormState } from "@/app/actions/auth";

export function ResendForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resendCode, { errors: [] });
  return (
    <form action={action} className="space-y-2">
      {csrf !== null && <input type="hidden" name="csrf" value={csrf} />}
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <button type="submit" disabled={pending} className="text-sm text-slate-600 underline disabled:opacity-50">
        {pending ? "Sending…" : "Resend code"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Implement `app/forbidden.tsx` and `app/not-found.tsx`**

Create `app/forbidden.tsx`:
```tsx
export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <h1 className="text-xl font-semibold">403 Forbidden</h1>
    </main>
  );
}
```

Create `app/not-found.tsx`:
```tsx
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <h1 className="text-xl font-semibold">404 Not Found</h1>
    </main>
  );
}
```

- [ ] **Step 6: Run the login E2E spec to verify it passes**

Run: `npx playwright test tests/e2e/login.spec.ts`
Expected: PASS (both tests). This also exercises the migration, sessions, auth lib, mailer log, and CSRF.

- [ ] **Step 7: Lint, build, and commit**

Run: `npm run lint && npm run build`
Expected: clean lint; build succeeds.

```bash
git add app/actions/auth.ts app/login app/forbidden.tsx app/not-found.tsx tests/e2e
git commit -m "feat(next): admin login flow with server actions and e2e tests"
```

---

## Task 8: Settings dashboard

**Files:**
- Create: `app/actions/settings.ts`, `app/settings/page.tsx`, `app/settings/add-user-form.tsx`, `app/settings/delete-user-button.tsx`, `app/settings/add-rule-form.tsx`, `app/settings/delete-rule-button.tsx`, `app/settings/change-password-form.tsx`, `app/settings/logout-button.tsx`, `tests/e2e/settings.spec.ts`

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/settings.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { loginAsAdmin, resetRateLimits } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

test("settings: user/rule CRUD and validations", async ({ page }) => {
  await loginAsAdmin(page);
  const uname = `e2e_user_${Date.now()}`;
  const dummy = `/e2e-dummy-${Date.now()}`;
  const real = `/e2e-real-${Date.now()}`;

  await expect(page.getByText("Settings Dashboard")).toBeVisible();

  await page.getByPlaceholder("Username").fill(uname);
  await page.getByPlaceholder("Password").fill("e2epass1234");
  await page.getByPlaceholder("Email").fill(`${uname}@example.com`);
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText(uname)).toBeVisible();

  await page.getByPlaceholder("/dummy").fill(dummy);
  await page.getByPlaceholder("/real").fill(real);
  await page.getByRole("combobox").selectOption({ label: uname });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText(dummy)).toBeVisible();

  await page.getByPlaceholder("/dummy").fill("/settings");
  await page.getByPlaceholder("/real").fill("/x");
  await page.getByRole("combobox").selectOption({ label: uname });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("must not collide with app routes")).toBeVisible();

  await page.locator("tr", { hasText: dummy }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(dummy)).not.toBeVisible();

  await page.locator("tr", { hasText: uname }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(uname)).not.toBeVisible();
});

test("settings: password change validations", async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByLabel("Current password").fill("wrongpass");
  await page.getByLabel("New password").fill("whatever123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Current password is incorrect.")).toBeVisible();

  await page.getByLabel("Current password").fill("pass_admin_security7777");
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("New password must be at least 10 characters.")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `npx playwright test tests/e2e/settings.spec.ts`
Expected: FAIL — `app/settings` route not found.

- [ ] **Step 3: Implement `app/actions/settings.ts`**

Create `app/actions/settings.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { verifyCsrfToken, verifyOrigin } from "@/lib/csrf";
import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  deleteUser,
  getAdminPasswordHash,
  insertRule,
  insertUser,
  listRules,
  rulePathCollisions,
  updateAdminPassword,
  deleteRule,
  getUserById,
} from "@/lib/repo";
import { collidesWithAppRoutes, normalizePath } from "@/lib/rules";
import { regenerateSessionToken, updateSessionData } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";

export interface SettingsState {
  errors: string[];
  ok?: boolean;
  message?: string;
}

async function requireAdminVerified() {
  const session = await getCurrentSession();
  if (!session || !session.data.admin_verified) redirect("/login");
  return session;
}

function isDupEntry(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

export async function addUser(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (username === "" || password.length < 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { errors: ["Valid username, password (10+ chars) and email required."] };
  }
  try {
    await insertUser(username, hashPassword(password), email);
  } catch (err) {
    if (isDupEntry(err)) return { errors: ["Username or email already exists."] };
    throw err;
  }
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "User added." };
}

export async function deleteUserAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const userId = Number(formData.get("user_id"));
  if (userId > 0) await deleteUser(userId);
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "User deleted." };
}

export async function addRule(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const dummy = normalizePath(String(formData.get("dummy_path") ?? ""));
  const real = normalizePath(String(formData.get("real_path") ?? ""));
  const userId = Number(formData.get("user_id"));
  if (!dummy || !real || userId < 1) {
    return { errors: ["Dummy path, real path and a user are required."] };
  }
  if (collidesWithAppRoutes(dummy) || collidesWithAppRoutes(real)) {
    return { errors: ["Dummy and real paths must not collide with app routes."] };
  }
  if (dummy === real) return { errors: ["Dummy and real paths must be different."] };
  const user = await getUserById(userId);
  if (!user) return { errors: ["Unknown user."] };
  const collisions = await rulePathCollisions(dummy, real);
  if (collisions.length > 0) return { errors: ["Path already in use by another rule."] };
  try {
    await insertRule(dummy, real, userId);
  } catch (err) {
    if (isDupEntry(err)) return { errors: ["Path already in use by another rule."] };
    throw err;
  }
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "Rule added." };
}

export async function deleteRuleAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const ruleId = Number(formData.get("rule_id"));
  if (ruleId > 0) await deleteRule(ruleId);
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "Rule deleted." };
}

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const adminId = session.data.admin_verified;
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const hash = await getAdminPasswordHash(adminId);
  if (!hash || !verifyPassword(current, hash)) {
    return { errors: ["Current password is incorrect."] };
  }
  if (next.length < 10) return { errors: ["New password must be at least 10 characters."] };
  await updateAdminPassword(adminId, hashPassword(next));
  await updateSessionData(session.id, session.data, adminId);
  const newToken = await regenerateSessionToken(session.id);
  await setSessionCookie(newToken);
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "Password changed." };
}
```

Note: `deleteUser` and `deleteRule` are re-exported under action names (`deleteUserAction`, `deleteRuleAction`) to avoid colliding with the `lib/repo` imports.

- [ ] **Step 4: Implement the settings page and forms**

Create `app/settings/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { listRules, listUsers } from "@/lib/repo";
import { AddUserForm } from "./add-user-form";
import { DeleteUserButton } from "./delete-user-button";
import { AddRuleForm } from "./add-rule-form";
import { DeleteRuleButton } from "./delete-rule-button";
import { ChangePasswordForm } from "./change-password-form";
import { LogoutButton } from "./logout-button";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session?.data.admin_verified) redirect("/login");
  const csrf = session.data.csrf ?? null;
  const [users, rules] = await Promise.all([listUsers(), listRules()]);
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">Settings Dashboard</h1>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Users</h2>
          <AddUserForm csrf={csrf} />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Username</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2">{u.username}</td>
                  <td className="py-2">{u.email}</td>
                  <td className="py-2 text-right">
                    <DeleteUserButton csrf={csrf} userId={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Protected URL Rules</h2>
          <AddRuleForm csrf={csrf} users={users.map((u) => ({ id: u.id, username: u.username }))} />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Dummy path</th>
                <th>Real path</th>
                <th>User</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{r.dummy_path}</td>
                  <td className="py-2">{r.real_path}</td>
                  <td className="py-2">{r.username}</td>
                  <td className="py-2 text-right">
                    <DeleteRuleButton csrf={csrf} ruleId={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Change Password</h2>
          <ChangePasswordForm csrf={csrf} />
        </section>
      </div>
    </main>
  );
}
```

Create `app/settings/add-user-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { addUser, type SettingsState } from "@/app/actions/settings";

export function AddUserForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addUser, { errors: [] });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      {state.message && <p className="w-full text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="w-full text-sm text-red-600">
          {e}
        </p>
      ))}
      <input name="username" placeholder="Username" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <input name="password" type="password" placeholder="Password" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <input name="email" type="email" placeholder="Email" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        Add user
      </button>
    </form>
  );
}
```

Create `app/settings/delete-user-button.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { deleteUserAction, type SettingsState } from "@/app/actions/settings";

export function DeleteUserButton({ csrf, userId }: { csrf: string | null; userId: number }) {
  const [, action] = useActionState<SettingsState, FormData>(deleteUserAction, { errors: [] });
  return (
    <form action={action} className="inline">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" className="text-sm text-red-600 underline">
        Delete
      </button>
    </form>
  );
}
```

Create `app/settings/add-rule-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { addRule, type SettingsState } from "@/app/actions/settings";

export function AddRuleForm({ csrf, users }: { csrf: string | null; users: Array<{ id: number; username: string }> }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addRule, { errors: [] });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      {state.message && <p className="w-full text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="w-full text-sm text-red-600">
          {e}
        </p>
      ))}
      <input name="dummy_path" placeholder="/dummy" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <input name="real_path" placeholder="/real" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <select name="user_id" required className="rounded border border-slate-300 px-3 py-2 text-sm">
        <option value="">User…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        Add rule
      </button>
    </form>
  );
}
```

Create `app/settings/delete-rule-button.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { deleteRuleAction, type SettingsState } from "@/app/actions/settings";

export function DeleteRuleButton({ csrf, ruleId }: { csrf: string | null; ruleId: number }) {
  const [, action] = useActionState<SettingsState, FormData>(deleteRuleAction, { errors: [] });
  return (
    <form action={action} className="inline">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      <input type="hidden" name="rule_id" value={ruleId} />
      <button type="submit" className="text-sm text-red-600 underline">
        Delete
      </button>
    </form>
  );
}
```

Create `app/settings/change-password-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { changePassword, type SettingsState } from "@/app/actions/settings";

export function ChangePasswordForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePassword, { errors: [] });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="current_password">
          Current password
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="new_password">
          New password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        Change password
      </button>
    </form>
  );
}
```

Create `app/settings/logout-button.tsx`:
```tsx
"use client";

import { logout } from "@/app/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm text-slate-600 underline">
        Logout
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Run the settings E2E spec to verify it passes**

Run: `npx playwright test tests/e2e/settings.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Lint, build, and commit**

Run: `npm run lint && npm run build`
Expected: clean lint; build succeeds.

```bash
git add app/actions/settings.ts app/settings tests/e2e/settings.spec.ts
git commit -m "feat(next): settings dashboard with user/rule/password actions"
```

---

## Task 9: Gate handler and real-path guard

**Files:**
- Create: `app/actions/gate.ts`, `app/[...slug]/page.tsx`, `app/[...slug]/gate-form.tsx`, `app/[...slug]/real-page.tsx`, `tests/e2e/gate.spec.ts`

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/gate.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { lastCodeFromLog, loginAsAdmin, resetRateLimits } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

async function createGateRule(page: import("@playwright/test").Page) {
  const uname = `gate_user_${Date.now()}`;
  const dummy = `/test-dummy-${Date.now()}`;
  const real = `/test-real-${Date.now()}`;
  await page.getByPlaceholder("Username").fill(uname);
  await page.getByPlaceholder("Password").fill("gatepass1234");
  await page.getByPlaceholder("Email").fill(`${uname}@example.com`);
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText(uname)).toBeVisible();
  await page.getByPlaceholder("/dummy").fill(dummy);
  await page.getByPlaceholder("/real").fill(real);
  await page.getByRole("combobox").selectOption({ label: uname });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText(dummy)).toBeVisible();
  return { dummy, real };
}

test("gate: send code then verify grants the real path", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const { dummy, real } = await createGateRule(page);

  const visitor = await browser.newContext();
  const vp = await visitor.newPage();

  await vp.goto(real);
  await expect(vp.getByText("403 Forbidden")).toBeVisible();

  await vp.goto(dummy);
  await expect(vp.getByText("Restricted Area")).toBeVisible();
  await vp.getByRole("button", { name: "Send me a code" }).click();
  await expect(vp.getByText("A verification code was sent")).toBeVisible();

  const code = await lastCodeFromLog();
  await vp.getByLabel("Code").fill(code);
  await vp.getByRole("button", { name: "Verify" }).click();
  await expect(vp).toHaveURL(real);
  await expect(vp.getByText("Protected Destination")).toBeVisible();

  await visitor.close();
});

test("gate: five wrong codes lock the rule out", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const { dummy, real } = await createGateRule(page);

  const visitor = await browser.newContext();
  const vp = await visitor.newPage();

  await vp.goto(dummy);
  await vp.getByRole("button", { name: "Send me a code" }).click();
  await expect(vp.getByText("A verification code was sent")).toBeVisible();
  const code = await lastCodeFromLog();

  for (let i = 0; i < 5; i++) {
    await vp.getByLabel("Code").fill("WRONGCOD");
    await vp.getByRole("button", { name: "Verify" }).click();
  }
  await vp.getByLabel("Code").fill(code);
  await vp.getByRole("button", { name: "Verify" }).click();
  await expect(vp.getByText("Invalid or expired code.")).toBeVisible();

  await vp.goto(real);
  await expect(vp.getByText("403 Forbidden")).toBeVisible();

  await visitor.close();
});
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `npx playwright test tests/e2e/gate.spec.ts`
Expected: FAIL — `app/[...slug]` route not found (404s).

- [ ] **Step 3: Implement `app/actions/gate.ts`**

Create `app/actions/gate.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { ensureSession, setSessionCookie } from "@/lib/session-cookie";
import { verifyCsrfToken, verifyOrigin } from "@/lib/csrf";
import { codeFormatOk, issueCode, verifyCode } from "@/lib/auth";
import { deleteRateLimitRecord, tryRecordRateLimit } from "@/lib/rate-limit";
import { getRuleById, getUserEmail } from "@/lib/repo";
import { sendVerificationEmail } from "@/lib/mail";
import { gateIssue } from "@/lib/guard";
import { regenerateSessionToken, updateSessionData } from "@/lib/session";

export interface GateState {
  errors: string[];
  ok?: boolean;
  message?: string;
}

export async function gateSendCode(_prev: GateState, formData: FormData): Promise<GateState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const { session } = await ensureSession();
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const ruleId = Number(formData.get("rule_id"));
  const rule = await getRuleById(ruleId);
  if (!rule) return { errors: ["Unknown rule."] };
  const rateId = await tryRecordRateLimit(`rule:${ruleId}`);
  if (rateId === null) return { errors: ["Too many codes requested. Try again later."] };
  const code = await issueCode({ type: "user", adminId: null, userId: rule.associated_user_id, ruleId });
  const email = await getUserEmail(rule.associated_user_id);
  const sent = await sendVerificationEmail(email ?? "", code);
  if (!sent) {
    await deleteRateLimitRecord(rateId);
    return { errors: ["Could not send the code. Please try again."] };
  }
  return { errors: [], ok: true, message: "A verification code was sent to your email." };
}

export async function gateVerify(_prev: GateState, formData: FormData): Promise<GateState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const { session } = await ensureSession();
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const ruleId = Number(formData.get("rule_id"));
  const rule = await getRuleById(ruleId);
  if (!rule) return { errors: ["Unknown rule."] };
  const input = String(formData.get("code") ?? "").trim();
  if (!codeFormatOk(input)) {
    await verifyCode({ type: "user", adminId: null, userId: rule.associated_user_id, ruleId }, input);
    return { errors: ["Code must be exactly 8 alphanumeric characters."] };
  }
  if (await verifyCode({ type: "user", adminId: null, userId: rule.associated_user_id, ruleId }, input)) {
    const data = gateIssue(session.data, ruleId);
    await updateSessionData(session.id, data);
    const newToken = await regenerateSessionToken(session.id);
    await setSessionCookie(newToken);
    redirect(rule.real_path);
  }
  return { errors: ["Invalid or expired code."] };
}
```

- [ ] **Step 4: Implement the catch-all page**

Create `app/[...slug]/page.tsx`:
```tsx
import { forbidden, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { gateValid } from "@/lib/guard";
import { getRuleByDummyPath, getRuleByRealPath } from "@/lib/repo";
import { GateForm } from "./gate-form";
import { RealPage } from "./real-page";

export default async function SlugPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = "/" + slug.join("/");

  const realRule = await getRuleByRealPath(path);
  if (realRule) {
    const session = await getCurrentSession();
    if (!gateValid(session?.data, realRule.id)) forbidden();
    return <RealPage rule={realRule} />;
  }

  const dummyRule = await getRuleByDummyPath(path);
  if (dummyRule) {
    const session = await getCurrentSession();
    return <GateForm ruleId={dummyRule.id} csrf={session?.data.csrf ?? null} />;
  }

  notFound();
}
```

Create `app/[...slug]/gate-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { gateSendCode, gateVerify, type GateState } from "@/app/actions/gate";

export function GateForm({ ruleId, csrf }: { ruleId: number; csrf: string | null }) {
  const [sendState, sendAction, sendPending] = useActionState<GateState, FormData>(gateSendCode, { errors: [] });
  const [verifyState, verifyAction, verifyPending] = useActionState<GateState, FormData>(gateVerify, { errors: [] });
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Restricted Area</h1>
        <p className="mb-4 text-sm text-slate-600">
          This URL is protected. Enter the 8-character code emailed to you.
        </p>
        <form action={sendAction} className="mb-4">
          <input type="hidden" name="csrf" value={csrf ?? ""} />
          <input type="hidden" name="rule_id" value={ruleId} />
          {sendState.message && <p className="text-sm text-green-600">{sendState.message}</p>}
          {sendState.errors.map((e) => (
            <p key={e} className="text-sm text-red-600">
              {e}
            </p>
          ))}
          <button
            type="submit"
            disabled={sendPending}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {sendPending ? "Sending…" : "Send me a code"}
          </button>
        </form>
        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="csrf" value={csrf ?? ""} />
          <input type="hidden" name="rule_id" value={ruleId} />
          {verifyState.errors.map((e) => (
            <p key={e} className="text-sm text-red-600">
              {e}
            </p>
          ))}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="code">
              Code
            </label>
            <input
              id="code"
              name="code"
              required
              maxLength={8}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={verifyPending}
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {verifyPending ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </main>
  );
}
```

Create `app/[...slug]/real-page.tsx`:
```tsx
import type { RuleRow } from "@/lib/repo";

export function RealPage({ rule }: { rule: RuleRow }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Protected Destination</h1>
        <p className="mt-2 text-sm text-slate-600">
          You have a valid gate for{" "}
          <code className="rounded bg-slate-100 px-1">{rule.real_path}</code>.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the gate E2E spec to verify it passes**

Run: `npx playwright test tests/e2e/gate.spec.ts`
Expected: PASS (both tests). Requires `experimental.authInterrupts` for the real 403 (`forbidden()`).

- [ ] **Step 6: Run the full unit + E2E suites**

Run: `npm run test:unit && npx playwright test`
Expected: all unit tests pass; all three E2E specs pass.

- [ ] **Step 7: Lint, build, and commit**

Run: `npm run lint && npm run build`
Expected: clean lint; build succeeds.

```bash
git add app/actions/gate.ts 'app/[...slug]' tests/e2e/gate.spec.ts
git commit -m "feat(next): dummy gate handler, real-path guard, and e2e gate tests"
```

---

## Task 10: README + final verification

**Files:**
- Create: `README.md` (repo root, replacing none — add new file)

- [ ] **Step 1: Create `README.md`**

Create `README.md` (repo root):
```markdown
# KMCQ GmbH URL Checkpoint

Next.js admin app: secure admin login (password + emailed 8-char code), a settings dashboard (users and dummy→real URL rules), and URL gating — visiting a dummy path emails a one-time code that grants a 10-minute server-side gate to a real path. Built with Next.js 16 (App Router), TypeScript, MySQL, Tailwind.

## Requirements
- Node 20+, MySQL (database `authnamedb`, user `userauth`), npm.

## Setup
1. `npm install`
2. Apply the schema migration: `npm run migrate` (creates the `sessions` table; the `admins`/`users`/`url_rules`/`verification_codes`/`email_rate_limits` tables come from `php/schema.sql`).
3. Run: `npm run dev` and open `http://localhost:3000`.

## Login
- URL: `/login`
- Seeded admin: `admin_security` / `pass_admin_security7777` — change it at `/settings` immediately after first login.

## Usage
- Admin creates users and URL rules in `/settings`:
  - Dummy path (e.g. `/name-folder`) is the public gate.
  - Real path (e.g. `/administrators`) is protected; direct access returns 403.
- Visiting the dummy path sends an 8-char code to the rule's assigned user email; entering it grants a 10-minute server-side gate and redirects to the real path.

## Configuration
All values default in `lib/config.ts`; override via env vars (see `.env.example`): `DB_*`, `CODE_*`, `RATE_LIMIT_*`, `SESSION_SECURE`, `MAIL_*`. Behind HTTPS set `SESSION_SECURE=1`; in production set `MAIL_MODE=smtp`.

## Security notes
- Codes: 8 alphanumeric, HMAC-SHA256 hashed in DB, one-time, 10-min expiry, 5-attempt limit, 3-send/10-min rate limit (atomic inserts).
- Passwords: bcrypt (bcryptjs, cost 12, verifies the PHP `$2y$` seed). Sessions: DB-backed, `kmcq_sess` cookie httpOnly + SameSite=Strict.
- CSRF: origin check + per-session token on every Server Action; PDO-style prepared statements; security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) in `next.config.ts` plus a nonce-based strict CSP generated per-request in `proxy.ts`.

## Tests
- Unit: `npm run test:unit` (requires a running MySQL with migrations applied)
- E2E: `npm run test:e2e` (starts the dev server on port 3100; uses `MAIL_MODE=log`)
```

- [ ] **Step 2: Run all verification**

Run:
```bash
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```
Expected: lint clean; build succeeds; unit tests all pass; Playwright prints "all passed" for all specs.

- [ ] **Step 3: Final DB hygiene check**

Run:
```bash
mysql -u userauth -ppassuserauth77 authnamedb -N -e "SELECT CONCAT('users=',COUNT(*)) FROM users; SELECT CONCAT('url_rules=',COUNT(*)) FROM url_rules;"
```
Expected: both `=0` (the E2E global setup wipes dynamic data; run it once more or manually delete leftovers if any).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(next): add README and final verification"
```

---

## Self-Review

**Spec coverage check (design doc `docs/superpowers/specs/2026-08-15-nextjs-url-gating-admin-design.md`):**
- §4.1 route map → Tasks 7, 8, 9 (login, settings, catch-all)
- §4.2 data access (env-driven pool, prepared statements) → Task 2, Task 6
- §4.3 library modules (auth, session, guard, rate-limit, mail) → Tasks 3, 4, 5
- §4.4 gate flow (real-first dispatch, malformed-counts-attempt, mail-failure rate-limit rollback, session regen) → Task 9
- §5 auth flows (login/code/resend/logout, session regeneration, 24h idle / 7d absolute) → Tasks 4, 7
- §6 settings dashboard (users, rules, password; case-insensitive reserved paths; cross-rule collision) → Task 8
- §7 security (httpOnly/SameSite/Secure, origin+token CSRF, constant-time, atomic claims, nonce CSP + headers, env-only secrets) → Tasks 1, 3, 4, 6
- §8 data model (`sessions` migration; bcryptjs for `$2y$`) → Tasks 1, 3
- §9 testing (Vitest units, Playwright E2E, migrate script, reset) → Tasks 2–9, Task 10
- §10 deployment (README, env vars, migrate, build/start, SESSION_SECURE/MAIL_MODE) → Task 10

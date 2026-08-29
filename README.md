# KMCQ GmbH URL Gate Security Checkpoint

Next.js admin app: secure admin login (password + emailed 8-char code), a settings dashboard (users and dummy→real URL rules), and URL gating — visiting a dummy path emails a one-time code that grants a 10-minute server-side gate to a real path. Built with Next.js 16 (App Router), TypeScript, MySQL, Tailwind.

## Documentation

- [Documentation index](docs/index.md)
- [Blog post: URL Access Control That Every Team Can Understand](docs/blog.md)
- [Installation & configuration](docs/installation-and-configuration.md)
- [Usage guide](docs/usage-guide.md)
- [Production deployment](docs/production-deployment.md)
- [Security & architecture](docs/security-and-architecture.md)
- [Development & testing](docs/development-and-testing.md)

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

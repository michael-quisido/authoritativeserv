# KMCQ GmbH URL Gate Security Checkpoint — Development & Testing Guide

Everything a contributor needs: the dev loop, the test suites, code structure,
and debugging notes learned while building this app.

---

## 1. Development loop

```bash
npm install
npm run migrate     # ensure the sessions table exists
npm run dev         # http://localhost:3000
```

The dev server runs on port 3000 by default. The Next.js config enables
`allowedDevOrigins: ["127.0.0.1"]` so native form POSTs from `127.0.0.1` aren't
treated as cross-origin during development.

---

## 2. Project layout

```
app/
  page.tsx                    # landing page
  layout.tsx                  # root layout
  not-found.tsx               # global 404
  forbidden.tsx               # global 403 (authInterrupts)
  login/                      # password step
  login/code/                 # two-factor code step + resend
  settings/                   # admin dashboard
  [...slug]/                  # catch-all gate/real resolution
  actions/                    # server actions: auth.ts, gate.ts, settings.ts
lib/
  auth.ts        # bcrypt + HMAC one-time codes
  config.ts      # env-driven configuration (fallbacks)
  csrf.ts        # origin + token checks
  db.ts          # mysql2 pool
  guard.ts       # per-rule gate set/validate
  mail.ts        # nodemailer SMTP + log mode
  rate-limit.ts  # atomic rate-limit slots
  repo.ts        # data-access queries (prepared statements)
  rules.ts       # path normalization/validation
  session.ts     # DB-backed sessions
  session-cookie.ts  # cookie read/write helpers
migrations/001_sessions.sql
scripts/migrate.mjs
proxy.ts         # Next.js 16 proxy middleware (IP gate, real-path gate, CSP nonce)
tests/
  unit/          # Vitest
  e2e/           # Playwright
```

---

## 3. Configuration & environment

See the [Installation guide](installation-and-configuration.md) for the full
variable reference. In test environments, `MAIL_MODE=log` writes codes to
`storage/mail.log` — the E2E suite reads codes from there.

---

## 4. Unit tests (Vitest)

```bash
npm run test:unit
```

**Requirements:** a reachable MySQL with migrations applied — several units hit
the database (`repo`, `auth` verification claims, `session`, `rate-limit`).

Currently **42 tests across 8 files**:

| File | Covers |
|---|---|
| `tests/unit/auth.test.ts` | bcrypt verify (incl. `$2y$` seed), code hash/verify, lockout, malformed-input-counts-attempt, atomic claim |
| `tests/unit/session.test.ts` | token gen/hash, expiry pruning, regeneration |
| `tests/unit/guard.test.ts` | per-rule gating, expiry |
| `tests/unit/rate-limit.test.ts` | window counting, atomicity, fail-closed |
| `tests/unit/rules.test.ts` | path normalization, reserved-path + collision rejection, open-redirect rejection |
| `tests/unit/csrf.test.ts` | origin + token verification |
| `tests/unit/config.test.ts` | env overrides |
| `tests/unit/mail.test.ts` | log-mode escaping |

> **Known flake:** `auth.test.ts` "hash/verify roundtrips"
> (~4s on a slow CPU) can exceed vitest's 5s default under load. If it recurs,
> raise `testTimeout` (e.g. `"testTimeout": 15_000` in `vitest.config.ts`).

---

## 5. End-to-end tests (Playwright)

```bash
npm run test:e2e
```

The E2E suite starts the dev server on **port 3100** and uses `MAIL_MODE=log`.

Covered flows:

- **Login:** wrong password → error; correct password → code page; code →
  `/settings`; logout.
- **Settings:** add/delete user; add/delete rule; reserved-path rejection;
  wrong current password; short new password.
- **Gate:** direct real path → 403; fresh visitor sends code → code read from
  `storage/mail.log` → verify → real path 200; 5-wrong-attempt lockout.

The pre-test reset wipes `sessions`, `users`, `url_rules`,
`verification_codes`, and `email_rate_limits` — it never touches `admins`.

### E2E lessons learned (apply them)

1. **`127.0.0.1` is cross-origin to a dev server on `localhost`:** use
   `allowedDevOrigins: ["127.0.0.1"]` (already set) or native form POSTs will
   abort.
2. **Route-announcer duplication:** Next.js injects
   `#__next-route-announcer__` whose text mirrors the `<h1>`. Prefer
   `getByRole("heading", { name: ... })` over `getByText(...)` when the text is
   also a heading, or you'll hit strict-mode violations.
3. **Ambiguous `getByText(uname)`:** use
   `page.locator("tr", { hasText: uname })` when a username also matches other
   cells.
4. **Don't chain Playwright commands** (e.g. long `page.waitForNavigation`
   chains) on the 3100 port — they're prone to contention flakes.

---

## 6. Lint & typecheck

```bash
npm run lint        # ESLint
npm run build       # also runs TypeScript
```

---

## 7. Migrations

Migrations live in `migrations/*.sql` and are applied **in filename order** by
`npm run migrate` (reads `DB_*` from the environment). Only add
`001_sessions.sql` exists today; append `002_...` etc. for future changes.

---

## 8. Next.js 16 gotchas (recorded so you don't hit them twice)

- **`proxy.ts` is the middleware.** `middleware.ts` is deprecated; having both
  causes a build error ("Please use ./proxy.ts only"). The proxy cannot set
  runtime and isn't the place for heavy auth logic.
- **`cookies()`, `headers()`, `params` are async** — `await` them.
- **`cookies().set` only works in Server Actions / Route Handlers**, not in
  arbitrary server code — use it via the action or route handler.
- **`forbidden()` needs `experimental.authInterrupts: true`.**
- **`mysql2` isn't auto-externalized** — set
  `serverExternalPackages: ["mysql2"]` or the build breaks.
- **Trailing slashes:** `skipTrailingSlashRedirect: true` is set so
  `/phpmyadmin/` stays `/phpmyadmin/`; DB lookups trim trailing slashes so both
  spellings match.
- **`assetPrefix: "/__gate"`** keeps the app's static assets out of the proxy
  matcher (the gate page and admin UI must render even on gated domains).

---

## 9. Verifying before you ship

Always run the full gate locally before deploying:

```bash
npm run lint
npm run test:unit
npm run build
```

Then follow the [Production deployment guide](production-deployment.md#6-post-deploy-verification-checklist)
checklist against the live site.

---

*Return to the [README](../README.md) or browse the
[documentation index](index.md).*
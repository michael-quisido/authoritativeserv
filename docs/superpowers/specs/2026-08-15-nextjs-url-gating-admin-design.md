# Next.js URL Gating Admin — Design

**Date:** 2026-08-15
**Status:** Approved
**Supersedes:** `docs/superpowers/specs/2026-08-14-php-url-gating-admin-design.md` (PHP implementation, being replaced)

## 1. Purpose

Replace the plain-PHP admin app (`php/`) with a Next.js 16 (App Router) implementation of the same product: admin login (password + emailed one-time code), a settings dashboard (users + dummy→real URL rules), and URL gating where visiting a dummy path emails an 8-character code that grants access to a real path. Deployed on the user's own server (Node runtime, MySQL on the same host). The PHP app retires after cutover.

## 2. Decisions (confirmed with user)

- **Approach:** Server Actions + Server Components (no client-fetch API layer).
- **Deployment:** own server, Node runtime, local MySQL. Replace PHP (not run side-by-side beyond the transition window).
- **Sessions:** DB-backed `sessions` table; client holds a random httpOnly token; server stores SHA-256 token hash + JSON `data` (admin flags + per-rule gates).
- **Gating paths:** arbitrary, multi-segment, admin-configurable; resolved by a catch-all route (`app/[...slug]/page.tsx`).
- **Homepage:** existing `app/page.tsx` landing page stays at `/`.
- **Testing:** Vitest (pure-logic units) + Playwright (full-flow E2E).
- **Email:** nodemailer for SMTP in production; `MAIL_MODE=log` writes to `storage/mail.log` for local dev (exact port of PHP behavior).

## 3. Environment & existing assets

- Next.js **16.2.7** — this is NOT the Next.js of older training data:
  - `cookies()` from `next/headers` is **async**.
  - Middleware is renamed **Proxy** (`proxy.ts`), cannot set runtime, and the docs forbid using it for session/auth — we use it only to generate a CSP nonce per request (never for auth).
  - Route segment config: `dynamic`, `revalidate`, `fetchCache` are removed; `runtime` defaults to `nodejs`.
  - Cache Components are OFF (empty `next.config.ts`); `fetch` is not cached by default.
  - Jest/Vitest cannot test async Server Components — use Playwright for flows.
  - mysql2 is not auto-externalized → set `serverExternalPackages: ['mysql2']`.
- `lib/db.ts` already exists: `mysql2/promise` pool, env-driven `DB_HOST`, hard-coded user/pass/database — extend to env-driven for all four.
- Existing tables (shared during transition, unchanged): `admins`, `users`, `url_rules`, `verification_codes`, `email_rate_limits`.
- Seeded admin: `admin_security` / `pass_admin_security7777` / `mike082112@gmail.com`. Seed hash is PHP `$2y$12$...` bcrypt.

## 4. Architecture

### 4.1 Route map

| Path | File | Behavior |
|---|---|---|
| `/` | `app/page.tsx` | existing landing page, unchanged |
| `/login` | `app/login/page.tsx` | password form; action `login()` |
| `/login/code` | `app/login/code/page.tsx` | code form + resend; actions `verifyAdminCode()`, `resendCode()` |
| `/logout` | server action | deletes session row, clears cookie, redirects to `/login` |
| `/settings` | `app/settings/page.tsx` | admin dashboard (users, rules, password); requires `admin_verified` session, else redirect `/login` |
| `/[...slug]` | `app/[...slug]/page.tsx` | catch-all gate/real resolution (see §4.4) |

Server actions live in `app/actions.ts` (or `app/actions/*.ts`); each mutation is a `'use server'` function that re-verifies the session and CSRF (direct POSTs are rejected).

### 4.2 Data access

- `lib/db.ts` — mysql2 pool (env-driven: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`), `serverExternalPackages: ['mysql2']`.
- All queries use prepared statements (`pool.execute` with `?` placeholders). No queries in Client Components.

### 4.3 Library modules (pure TS, Vitest-tested)

- `lib/auth.ts` — port of `php/lib/auth.php`: `admin_password_ok` (bcrypt verify, constant-time; dummy-hash compare when no admin row), `hash_code`/`verify_code` (HMAC-SHA256, `crypto.timingSafeEqual`), atomic one-time claim (`UPDATE ... WHERE used_at IS NULL AND attempts < 5`, `affectedRows === 1`), 8-char alphanumeric code gen.
- `lib/session.ts` — DB-backed session helpers: create/read/update/delete rows, token gen + SHA-256 hashing, idle/absolute expiry (24h idle, 7d absolute), lazy pruning, session id regeneration (new token, same data).
- `lib/guard.ts` — port of `php/lib/guard.php`: gate set/read in session `data`, per-rule keying, 10-min expiry pruned on read.
- `lib/rate-limit.ts` — port of the atomic `try_rate_limit()`: guarded `INSERT ... SELECT` window count for scope, fail-closed on DB contention (PDOException 1467 equivalent).
- `lib/mail.ts` — nodemailer SMTP (same Gmail host/port/auth/from as PHP config) with `MAIL_MODE=log` fallback writing to `MAIL_LOG_FILE`; returns boolean success (callers must honor it — see §4.4 gate send). Deviation from plan (per Task 5 review): log-mode lines escape `TO`/`SUBJECT` (newlines → spaces) since `to` is user-controlled in the gate flow; `BODY` still escapes `\n`.

### 4.4 Gate flow (catch-all)
`app/[...slug]/page.tsx` (Server Component):
1. Build path from `params.slug` (join with `/`, leading slash, trim trailing slash).
2. Look up `url_rules` by `dummy_path` first, then `real_path`. No match → `notFound()` (404).
3. **Dummy path** → render gate page + forms; actions:
   - `gateSendCode(ruleId)` — rate-limited per rule (`rule:<id>` scope, 3/10-min, shared across visitors); issues fresh code to the rule's assigned user and emails it; on mail failure show error and do **not** burn the rate-limit slot. Known limitation (inherited from PHP `try_record_rate_limit`, recorded per Task 4 review): the guard `SELECT COUNT(*)` is a snapshot read, so under REPEATABLE READ two concurrent requests can both pass the count and over-admit past `max`. Fail-closed only on thrown errors. Accepted for now; a locking read (`FOR UPDATE`) or `GET_LOCK` would close it in a follow-up.
   - `gateVerify(ruleId, code)` — regex `^[A-Za-z0-9]{8}$`; malformed input counts an attempt (calls the verifier anyway so lockout is unbypassable); HMAC compare; ≤5 attempts; one-time claim; on success regenerate session id, store `{ [ruleId]: expiresAt }` in session `data`, redirect to the rule's real path.
4. **Real path** → read session; if a valid, unexpired gate exists for this rule → render `real.tsx` (content page). Otherwise return **403**. Admin session does not bypass (gate is per-rule, like PHP).

Static routes (`/`, `/login`, `/login/code`, `/settings`) take precedence over the catch-all (Next.js file-based routing).

## 5. Auth flows

### 5.1 Login

`login()` action: `require_post` + CSRF; constant-time `admin_password_ok`; on success issue 8-char code (HMAC-hashed), email it, set `admin_pw_ok` in session, redirect `/login/code`. On failure return error state, stay on `/login`. Emails rate-limited via `try_rate_limit` (scope `admin:<id>`).

### 5.2 Code verify

`verifyAdminCode()`: CSRF; require `admin_pw_ok` else redirect `/login`; verify against `verification_codes` (format, HMAC, TTL 10-min, ≤5 attempts, one-time); success → regenerate session id, set `admin_verified`, redirect `/settings`; failure → error state.

`resendCode()`: CSRF; rate-limited; issues fresh code (invalidates old), emails it.

`logout()`: POST-only; deletes session row, clears cookie, redirects `/login`.

### 5.3 Session rules

- Session cookie name: `kmcq_sess`; value is a random 32-byte token (server stores its SHA-256 hash).
- Cookies: `httpOnly`, `SameSite=Strict`, `Secure` iff `SESSION_SECURE=1`, `path=/`.
- Session id regenerated at both grant points (password→code and code→verified) and on `changePassword`.
- Expiry: 24h idle, 7d absolute; pruning on read.

## 6. Settings dashboard

`/settings` Server Component: requires `admin_verified`; renders three sections (ported from `views/settings.php` styling):
1. Users table + add form + per-row delete.
2. Rules table (dummy path, real path, user, created_at) + add form + per-row delete.
3. Change password form.

Actions (each: `admin_verified` + CSRF check):
- `addUser(username, email)` — unique username/email; random bcrypt password (never emailed).
- `deleteUser(id)` — cascades rules/codes/rate-limits via FK.
- `addRule(dummyPath, realPath, userId)` — normalize (leading `/`, no trailing `/`); reject collisions **case-insensitively** (lowercase compare) against reserved app routes `/login`, `/login/code`, `/login/resend`, `/logout`, `/settings`; reject dummy==real for the same rule, cross-rule dummy/real uniqueness, and any real path equal to another rule's dummy path (dummy-first dispatch). Validate `userId`.
- `deleteRule(id)`.
- `changePassword(current, new, confirm)` — verify current bcrypt; min length; update hash; regenerate session id; keep `admin_verified`.

After each mutation: `revalidatePath('/settings')`. Settings page is session-dependent → dynamic by default.

## 7. Security

- Cookies `httpOnly` + `SameSite=Strict` (+ `Secure` behind HTTPS).
- CSRF on every POST/server action: Origin header must match host AND form carries a per-session CSRF token.
- Prepared statements everywhere; React default output escaping (no `dangerouslySetInnerHTML`).
- Constant-time code comparisons (`crypto.timingSafeEqual`); dummy-hash compare on missing admin.
- Atomic claim + rate-limit inserts (row-count verified), fail-closed.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` set in `next.config.ts`; strict CSP via per-request nonce generated in `proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`, plus `'unsafe-eval'` in dev only; `style-src 'self' 'nonce-…'`). Next.js App Router needs inline scripts for the RSC payload, so a static `default-src 'self'` would break hydration — nonce keeps the policy strict.
- Secrets only in server env: `.env.local` (gitignored) + committed `.env.example`. `NEXT_PUBLIC_` is never used for secrets. `serverExternalPackages: ['mysql2']`.

## 8. Data model changes

Add `migrations/001_sessions.sql` (applied via `npm run migrate`, Node script):

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  admin_id INT UNSIGNED NOT NULL,
  data JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_sessions_expires (expires_at)
);
```

bcrypt compatibility: the seeded admin hash uses PHP `$2y$` prefix which Node's native `bcrypt` cannot verify. Use **`bcryptjs`** (handles `$2y$`) so the existing seed works unchanged. Alternative (only if native `bcrypt` is preferred): the migration re-seeds the admin with a fresh `bcryptjs`/`bcrypt` hash. Decision: use `bcryptjs`.

## 9. Testing

### Unit (Vitest) — pure-logic modules only
- `lib/auth.ts`: bcrypt verify (incl. `$2y$` seed hash), code hash/verify, 5-attempt lockout, malformed-input-counts-attempt, atomic one-time claim.
- `lib/session.ts`: token gen/hash, expiry pruning, regeneration.
- `lib/guard.ts`: per-rule gating, expiry.
- `lib/rate-limit.ts`: window counting, atomicity, fail-closed.
- `lib/rules.ts` (path-normalization/validation helper): reserved-path + collision rejection incl. case-insensitivity.

### E2E (Playwright, `tests/e2e`)
- Login: wrong password → error; correct password → code page; code → `/settings`; logout.
- Settings: add/delete user; add/delete rule; reserved-path rejection; wrong current password; short new password.
- Gate: direct real path → 403; fresh visitor send → read code from `storage/mail.log` → verify → real path 200; 5-wrong-attempt lockout; cleanup.

### E2E learnings (Task 7, apply to later specs)
- Next dev server treats `127.0.0.1` as cross-origin; without hydration, native form POSTs carry `Origin: null` (amplified by `Referrer-Policy: no-referrer`) and server actions abort. Fix (already in `next.config.ts`): `allowedDevOrigins: ["127.0.0.1"]` — dev-only, does not affect prod.
- Next.js inserts a route-announcer `<div id="__next-route-announcer__">` whose text duplicates the page heading. Assertions like `getByText("Settings Dashboard")` then hit Playwright strict-mode violations (2 matches). Use `getByRole("heading", { name: ... })` for any text that is also a page `<h1>`.
- The settings E2E (Task 8) must reuse the same heading-role pattern and `loginAsAdmin` helper; note `loginAsAdmin` ends on `/settings`, so it depends on `/settings` existing (bridging minimal page landed in Task 7, expanded in Task 8).

### Scripts
- `npm run migrate` — apply `migrations/001_sessions.sql`.
- E2E pre-test reset wipes `sessions`, `users`, `url_rules`, `verification_codes`, `email_rate_limits`.

## 10. Deployment (own server)

1. `.env.local` with `DB_*`, `CODE_*`, `RATE_LIMIT_*`, `SESSION_SECURE`, `MAIL_*`.
2. `npm run migrate` once.
3. `next build && next start` behind a reverse proxy (Caddy/Nginx) with HTTPS; `SESSION_SECURE=1`, `MAIL_MODE=smtp`.
4. Cutover: retire the PHP server and `php/` (after data verified).

# KMCQ GmbH URL Gate Security Checkpoint — Security & Architecture Reference

This document explains how KMCQ GmbH URL Gate Security Checkpoint is built and why
it is safe to put in front of a sensitive URL. It is honest about the security
model **and** its known limitations.

---

## 1. Architecture

### Route map

| Path | File | Behavior |
|---|---|---|
| `/` | `app/page.tsx` | Landing page |
| `/login` | `app/login/page.tsx` | Admin password step |
| `/login/code` | `app/login/code/page.tsx` | Admin email-code step + resend |
| `/logout` | server action | Deletes session row, clears cookie |
| `/settings` | `app/settings/page.tsx` | Admin dashboard (users, rules, password) |
| `/[...slug]` | `app/[...slug]/page.tsx` | Catch-all gate/real resolution |
| *(all paths)* | `proxy.ts` | Proxy middleware: IP gate, real-path gate, nonce CSP, reverse proxy |

Everything runs in one Node.js process. There is no separate API service; all
mutations are React **Server Actions** that verify session + CSRF before doing
anything.

### The proxy layer

`proxy.ts` runs before every page render (except `api/*`, `_next/static`,
`_next/image`, `__gate` assets, `favicon.ico`, and prefetch requests). In order,
it:

1. **IP restriction** (production only, when `ALLOWED_IPS` is set).
2. **Real-path gate check** — for any request matching a rule's `real_path` (or
   a sub-path prefix of it), it requires a valid server-side gate. Denied →
   raw `403` *before* rendering.
3. **Nonce CSP header** — generates a per-request random nonce and sets a strict
   `Content-Security-Policy`.
4. **Reverse proxy** (when `GATE_PROXY_TARGET` is set) — forwards gated
   requests to the backend, stripping the real-path prefix and rewriting
   `Location`/`Set-Cookie`.

### Gate resolution order (catch-all)

Real path → (gate valid ? render : 403) → else dummy path → gate page → else 404.
Real paths take precedence over dummy paths.

### Data model

| Table | Purpose |
|---|---|
| `admins` | Admin login (bcrypt hash, email) |
| `users` | Gate-code recipients (bcrypt hash, email) |
| `url_rules` | `dummy_path` → `real_path`, `associated_user_id` |
| `verification_codes` | One-time codes (HMAC hash, attempts, expiry, used_at) |
| `email_rate_limits` | Atomic rate-limit slots per scope |
| `sessions` | DB-backed sessions (token hash, JSON data, expiry) |

---

## 2. Security model

### Passwords

- **bcrypt (cost 12)** via `bcryptjs`, chosen because it verifies the legacy PHP
  `$2y$` seed hash unchanged.
- Constant-time string comparison; a **dummy hash** is compared when an unknown
  admin is supplied so username enumeration timing leaks nothing.

### One-time codes

- 8 characters from `[A-Za-z0-9]`, generated with `crypto.randomBytes`.
- Stored only as an **HMAC-SHA256** hash keyed by `CODE_KEY`; the plaintext is
  never persisted.
- Verified with `crypto.timingSafeEqual`.
- **Single-use** — an atomic `UPDATE ... WHERE used_at IS NULL AND attempts < 5`
  claim, `affectedRows === 1` required.
- **10-minute expiry**, **5-attempt lockout**, and malformed input still counts
  an attempt so the lockout can't be bypassed by typos.

### Sessions

- Client holds a random 32-byte token in cookie `kmcq_sess`; the server stores
  only the **SHA-256 hash** of the token.
- Cookie flags: `httpOnly`, `SameSite=Strict`, `path=/`, `Secure` iff
  `SESSION_SECURE=1`.
- Server-side expiry: **24h idle**, **7d absolute**; rows pruned lazily on read.
- **Session ID is regenerated** at both two-step-login grant points and on
  password change (token rotation defeats fixation).

### CSRF

Every Server Action requires:
1. **Origin check** — the `Origin` header host must equal the `Host` header.
2. **Per-session token** — a session-bound CSRF token carried in the form,
   compared with `timingSafeEqual`.

The first anonymous gate POST (no session yet) is protected by the Origin check
alone; the action immediately mints and persists a session CSRF token for every
subsequent POST.

### Content-Security-Policy

A strict, per-request policy is emitted by the proxy middleware:

```
default-src 'self';
script-src 'self' 'nonce-<random>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none';
```

(`'unsafe-eval'` is appended in development only.) Next.js App Router injects
inline scripts for its RSC payload, so a nonce — rather than `static
default-src 'self'` — keeps the policy strict while allowing hydration to work.

### SQL & XSS

- Every query is a **prepared statement** via `pool.execute` with `?`
  placeholders. No string interpolation of user input.
- No `dangerouslySetInnerHTML`; React's default output escaping applies.

### Application security headers

Set in `next.config.ts`:
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`.

### Secrets

- Real secrets live only in server-side env (`.env.local`, gitignored).
- `NEXT_PUBLIC_` is never used for secrets.
- Committed defaults in `lib/config.ts` are dev/hard-coded fallbacks; rotate
  `CODE_KEY` and SMTP credentials in production.

### IP restriction

`ALLOWED_IPS` (production only) allows list-based access control. The client IP
is read from `x-forwarded-for` → `x-real-ip` → `cf-connecting-ip` →
`true-client-ip`. Loopback is always allowed so the local reverse proxy works.

---

## 3. Threat model & what's protected

| Attempt | Outcome |
|---|---|
| Guessing the admin password | bcrypt cost-12 slows guessing; second factor (email code) required |
| Reusing/brute-forcing a code | Single-use, 5 attempts, HMAC, constant-time compare |
| Directly hitting the real path | Proxy returns 403 without a valid server-side gate |
| Hitting asset sub-paths of a real path | Also prefix-matched and gated in the proxy |
| Crafting a session cookie | Cookie holds a token; server verifies its SHA-256 against the DB row |
| CSRF on any form | Origin check + per-session token |
| Open-redirect via a malicious rule | Path normalization rejects `//host` and `scheme://` values |
| XSS via user/rule input | Prepared statements + React escaping + strict CSP |
| Clickjacking the admin UI | `X-Frame-Options: DENY`, `frame-ancestors 'none'` |
| Denying a known IP | `ALLOWED_IPS` returns a raw 403 before any logic runs |

---

## 4. Known limitations

Documented honestly so they can be weighed or addressed later:

- **No password brute-force lockout.** The `admin:<id>` rate limit throttles
  code *issuance*, not password guesses (PHP parity). bcrypt cost-12 (~100ms
  per attempt) and the email second factor mitigate. A per-admin login-attempt
  lockout is a candidate hardening follow-up.
- **Rate-limit count is a snapshot read.** Under concurrent requests, two can
  both pass the `COUNT(*)` guard and over-admit past `RATE_LIMIT_MAX` (fail is
  closed only when MySQL throws). A locking read (`FOR UPDATE`) or `GET_LOCK`
  would close it.
- **Email-send failure on first admin login is not auto-recovered.** You reach
  the code page with no code delivered; the **resend** action is the recovery
  path.
- **Gates are per-rule and shared.** A gate for one rule doesn't open another;
  admin sessions don't bypass gates (PHP parity).
- **No gate auto-redirect.** A visitor who already holds a valid gate and
  re-visits the dummy path still sees the gate form on GET (PHP parity).
- **Rules are path-scoped, not host-scoped.** Two domains can't share the same
  dummy/real paths with different users; use distinct paths, or add host-scoped
  rules.
- **Overlong inputs** surface raw as MySQL error 1406 (PHP parity); length
  validation in actions is a hardening follow-up.
- **`session.adminId` is nulled on gate grant** — no current code reads that
  column for auth (JSON `admin_verified` drives the guard), so it's a latent
  trap only.
- **Untested edge coverage** (accepted scope): expired-gate UI, admin-no-bypass
  verification, mail-failure rollback in login/resend, cross-visitor rate-limit
  sharing.

---

Next: [Development & testing guide](development-and-testing.md)
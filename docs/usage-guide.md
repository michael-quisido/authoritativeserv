# Usage Guide

This guide explains how the app is used, from two points of view:

- **Admin** — the person who manages users and URL rules.
- **Visitor** — anyone who hits a gated URL and proves they belong there.

---

## Quick reference

| URL | Who | What happens |
|---|---|---|
| `/` | anyone | Landing page |
| `/login` | admin | Password step of the two-step admin login |
| `/login/code` | admin | Email-code step of the two-step login |
| `/settings` | admin (verified) | Dashboard: users, rules, change password |
| `/logout` | admin | Ends the admin session |
| `/dummy-path` | visitor | Gate page ("restricted area") for a rule |
| `/real-path` | visitor | Protected destination; 403 without a valid gate |

---

## Admin workflow

### 1. Log in (two steps)

1. Open `/login`.
2. Enter the admin username and password.
3. An 8-character code is emailed to the admin address.
4. Open `/login/code` and enter the code.

Both steps are required. The code is one-time, expires after 10 minutes, and
only five wrong attempts are allowed before it is burned. After a successful
two-step login you land on `/settings`.

> **Security note:** the *password* step is not brute-force locked by default
> (matching the legacy PHP behavior). The bcrypt cost-12 hash slows guesses, and
> the email code adds a second factor. See the
> [Security reference](security-and-architecture.md#known-limitations).

### 2. The dashboard (`/settings`)

`/settings` has three sections:

1. **Users** — the people who can receive verification codes for gated URLs.
2. **Protected URL Rules** — the dummy → real path mappings.
3. **Change Password** — rotate the admin password (min 10 chars).

Every mutation re-verifies your session and the CSRF token, then reloads the
page.

### 3. Manage users

**Add a user**

- Username (unique)
- Password (at least 10 characters) — stored as a bcrypt hash, never emailed
- Email (must look like an email)

The user's email is where gate codes are sent.

**Delete a user**

Deleting a user also removes their associated URL rules, verification codes, and
rate-limit records (via foreign keys). Do this with care.

### 4. Manage URL rules

Each rule is a `dummy path → real path` mapping assigned to one user.

**Add a rule**

- **Dummy path** — the public gate visitors see, e.g. `/private-folder`
- **Real path** — the protected destination, e.g. `/administrators`
- **User** — the account whose email receives the gate codes

Validation rules enforced by the app:

- Paths are normalized: a leading `/` is added if missing; trailing slashes are
  stripped; paths become `null`/rejected if empty, `/`, protocol-relative
  (`//evil.com`), or contain a scheme (`https://…`).
- Reserved app routes are rejected as both dummy and real paths:
  `/login`, `/login/code`, `/login/resend`, `/logout`, `/settings`.
- Dummy and real paths must differ.
- No path may collide with another rule's dummy or real path (case-insensitive).
- The chosen user must exist.

**Delete a rule** — removes the mapping. The real path becomes defenseless-only,
so any visitor hitting it after deletion will simply no longer see the gate.

### 5. Change the admin password

Enter the current password, the new password (10+ chars), and confirm. The
session ID is regenerated (a fresh cookie is issued, so you stay logged in).

---

## The gate flow, from a visitor's perspective

Suppose the admin created: dummy `/private-folder` → real `/administrators`,
assigned to user `alice@example.com`.

1. **The visitor opens `/private-folder`.**
   A "Restricted Area" page appears with a **Send me a code** button.

2. **The visitor clicks "Send me a code".**
   An 8-character code is emailed to `alice@example.com`. This action is
   rate-limited (3 sends per 10 minutes per rule, shared across all visitors).

3. **The visitor enters the code.**
   The code must be exactly 8 alphanumeric characters. On success they are
   granted a server-side gate valid for 10 minutes and redirected to
   `/administrators`.

4. **The visitor sees the real destination.**
   During the 10-minute window, `/administrators` renders the protected
   content. Opening it *without* a valid gate returns **403 Forbidden**.

### Gate behavior details

- **Gates are per-rule.** A gate for `/private-folder` does not open any other
  rule.
- **Admin sessions do not bypass gates.** Even a logged-in admin needs a fresh
  gate to enter a real path (matching the legacy PHP behavior).
- **Gates expire after 10 minutes** and are stored server-side in the session
  row. Expired gates are pruned on read.
- **Codes are single-use, 10-minute, 5-attempt limited.** Malformed input (e.g.
  wrong length) counts as an attempt on purpose, so the lockout can't be
  sidestepped.
- **Know your user.** Whoever owns the rule's email address controls entry. If
  you reassign a rule, adjust the rule's user accordingly.

---

## Path resolution rules

The catch-all route resolves a path in this order:

1. **Real path first.** If the path is a `real_path`, the gate check runs
   (valid gate → content, otherwise 403). Real paths take precedence over dummy
   paths.
2. **Then dummy path.** If the path is a `dummy_path`, the gate page renders.
3. **Otherwise 404.** No rule matches → not found.

A path can never be both a dummy and a real path for different rules; the app
enforces cross-rule uniqueness when you create rules.

---

## The proxy layer (extra protection)

Beyond the route-level check, a proxy middleware (`proxy.ts`) runs in front of
page rendering:

- In production, if `ALLOWED_IPS` is set, it blocks any request from a client IP
  that isn't allowed (via `x-forwarded-for` → `x-real-ip` → `cf-connecting-ip` →
  `true-client-ip`; loopback always allowed).
- It looks up every request's real path — including sub-paths like
  `/phpmyadmin/themes/...` — and enforces the gate *before* the Next.js route
  renders. Denied requests get a raw `403`.
- It sets a per-request nonce Content-Security-Policy header.
- When `GATE_PROXY_TARGET` is configured, it proxies gated requests to the
  backend (see [Production deployment](production-deployment.md)).

This means direct hits on asset URLs or sub-paths of a real path are also gated,
not just the top-level page.

Next: [Production deployment guide](production-deployment.md)
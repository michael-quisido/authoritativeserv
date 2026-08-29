# Installation & Configuration

This guide covers getting authoritativeserv running from a clean server, plus
every configuration option the app understands.

---

## 1. Requirements

| Dependency | Version | Notes |
|---|---|---|
| Node.js | 20+ | Tested on 20.9.0 |
| MySQL | 8.x / 5.7+ | Existing `php/` schema is reused (see §3) |
| npm | any recent | Ships with Node |

The app is a single Next.js 16 (App Router) TypeScript application. It has no
separate API service — everything runs in the one Node process against one
MySQL database.

---

## 2. Install

```bash
git clone https://github.com/michael-quisido/authoritativeserv.git
cd authoritativeserv
npm install
```

---

## 3. Database

The app reads two groups of tables:

- **Pre-existing tables** (created by the original PHP schema, unchanged):
  `admins`, `users`, `url_rules`, `verification_codes`, `email_rate_limits`
- **Added tables**: `sessions`

If you are migrating from the PHP app, point the app at the same database and
you keep all your admins, users, and rules.

Create the `sessions` table (and any other pending migrations):

```bash
npm run migrate
```

The migration script connects with the same `DB_*` environment values the app
uses (see §4), so set those first or edit `scripts/migrate.mjs`.

### Seed data

The seeded admin account is:

- **Username:** `admin_security`
- **Password:** `pass_admin_security7777`
- **Email:** `mike082112@gmail.com`

> **Change this password at `/settings` immediately after first login.**

The password hash uses the PHP bcrypt `$2y$` prefix; the app verifies it via
`bcryptjs` so the existing seed works unchanged.

---

## 4. Configuration

All settings are read from `lib/config.ts`, which falls back to defaults when an
environment variable is absent. Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

`.env.local` is gitignored (never commit real secrets). Commit the template
only.

### 4.1 Database (`DB_*`)

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `authnamedb` | Database name |
| `DB_USER` | `userauth` | Database user |
| `DB_PASS` | `passuserauth77` | Database password |

### 4.2 Verification codes (`CODE_*`)

| Variable | Default | Description |
|---|---|---|
| `CODE_KEY` | hard-coded default | HMAC key used to hash codes (set a long random hex string) |
| `CODE_LENGTH` | `8` | Length of one-time codes |
| `CODE_TTL` | `600` | Code validity in seconds (10 min) |
| `CODE_MAX_ATTEMPTS` | `5` | Failed attempts before a code is burned |

### 4.3 Rate limiting (`RATE_LIMIT_*`)

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_WINDOW` | `600` | Window in seconds (10 min) |
| `RATE_LIMIT_MAX` | `3` | Max code sends per scope per window |

Rate limits are recorded in `email_rate_limits` with atomic guarded inserts; a
DB contention fails closed (no code is sent).

### 4.4 Sessions

| Variable | Default | Description |
|---|---|---|
| `SESSION_SECURE` | `0` | Set `1` behind HTTPS so the `Set-Cookie` is `Secure` |

Session cookie: `kmcq_sess`, `httpOnly`, `SameSite=Strict`, `path=/`. Sessions
are database-backed with **24-hour idle** and **7-day absolute** expiry, and are
pruned lazily on reads.

### 4.5 Mail (`MAIL_*`)

| Variable | Default | Description |
|---|---|---|
| `MAIL_MODE` | `log` | `log` writes to a file; `smtp` sends real email |
| `MAIL_SMTP_HOST` | `smtp.gmail.com` | SMTP host |
| `MAIL_SMTP_PORT` | `587` | SMTP port |
| `MAIL_SMTP_USER` | — | SMTP auth user |
| `MAIL_SMTP_PASS` | — | SMTP auth password |
| `MAIL_FROM` | `no-reply@kmcq-gmbh.com` | From address |
| `MAIL_LOG_FILE` | `storage/mail.log` | File used in `log` mode |

In `smtp` mode the transport requires TLS and short timeouts; a send failure
returns `false` and callers treat it as "code not delivered" (the rate-limit
slot is rolled back in the gate flow).

### 4.6 Access control

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_IPS` | *(empty)* | Comma-separated client IPs allowed in production; empty = allow all |
| `GATE_PROXY_TARGET` | *(empty)* | Backend URL to proxy gated requests to (see §4.7) |

`ALLOWED_IPS` is enforced **only when `NODE_ENV=production`**. The client IP is
resolved from `x-forwarded-for` → `x-real-ip` → `cf-connecting-ip` →
`true-client-ip`. `localhost`/loopback is always allowed when the list is set, so
your reverse proxy on the same host keeps working.

### 4.7 Reverse proxy for gated paths (`GATE_PROXY_TARGET`)

By default, a gated real path renders a "valid gate" page served by this app.
To hand the visitor to a **different backend** once the gate passes, set:

```
GATE_PROXY_TARGET=http://127.0.0.1:3003
```

Then, when a request hits a gated real path (or a sub-path) with a valid gate,
the proxy:

1. strips the rule's `real_path` prefix (e.g. `/phpmyadmin/` → `/`),
2. forwards the request to the target backend,
3. rewrites `Location` headers and `Set-Cookie` `path=` values that reference
   the upstream root back to the gate prefix,
4. returns proxied responses with `Cache-Control: no-store, no-cache, must-revalidate`.

Example: gate `/phpmyadmin/` → proxy to `http://127.0.0.1:3003`, so the real
path `/phpmyadmin/` becomes the public front door to phpMyAdmin. See the
[Production deployment guide](production-deployment.md) for a full example.

---

## 5. Run

Development:

```bash
npm run dev
# open http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

---

## 6. Complete `.env.example` reference

```dotenv
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

# IP restriction (production only, comma-separated; empty = no restriction)
ALLOWED_IPS=58.69.171.44

# Reverse proxy target for gated real paths (empty = same-app only)
# When set, gated requests are proxied to this backend after verification.
# Example: GATE_PROXY_TARGET=http://127.0.0.1:3002
GATE_PROXY_TARGET=
```

---

## 7. Troubleshooting

**`ERROR: connect ECONNREFUSED 127.0.0.1:3306`**
MySQL isn't reachable. Confirm service is running and `DB_*` values are correct.

**500 during login, no code email arrives**
Double-check `MAIL_MODE`. In `log` mode codes are written to
`storage/mail.log`; in `smtp` mode verify host/port/user/pass (Gmail needs an
app password, not your account password).

**403 on `/settings`**
You're not admin-verified. Complete the two-step login (password, then email
code).

**404 on every path including gated ones**
A path didn't match any rule. Remember real paths need to match exactly (a
trailing slash is normalized); see the [Usage guide](usage-guide.md) path rules.

Next: [Usage guide](usage-guide.md)
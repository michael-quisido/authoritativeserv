# Secure PHP URL-Gating Admin App — Design

Date: 2026-08-14

## Overview

A plain-PHP (no framework) admin application providing:

1. **Admin login** — username + password (bcrypt) followed by an email-based 8-character alphanumeric one-time verification code before the settings dashboard is reachable.
2. **Settings dashboard** (`/settings`) — admin manages users and protected URL rules (dummy path → real path, one user per rule).
3. **URL gating** — visiting a dummy path prompts for an 8-char code emailed to the rule's assigned user; success grants a server-side gate token allowing access to the real destination. Direct access to the real path always fails without a valid gate token.

## Constraints

- Plain PHP 8 + MySQL (PDO), no frameworks.
- Codes: exactly 8 alphanumeric chars (A–Z, a–z, 0–9), one-time use, 10-minute expiry, max 5 attempts, rate-limited sending.
- Codes stored hashed (sha256). Passwords stored bcrypt.
- Server-side gate tokens only; no client-side bypass possible.
- CSRF tokens on all forms; parameterized queries; escaped output; secure session cookies.
- Apache + `.htaccess` front-controller routing.

## Environment

- PHP 8.5 CLI available locally; Composer available; MySQL reachable.
- DB `authnamedb`, user `userauth`, password `passuserauth77` (existing credentials, reused).
- SMTP: smtp.gmail.com:587 (TLS), username `mike082112@gmail.com`, app password supplied by user, From `no-reply@kmcq-gmbh.com` (note: Gmail may rewrite From; Reply-To set to the requested From).
- Admin seed: username `admin_security`, password `pass_admin_security7777`, email `mike082112@gmail.com`.

## Location

`php/` subfolder inside the existing `authoritativeserv` repo.

## Architecture

Front controller pattern. `.htaccess` rewrites all requests for non-existing files to `index.php`.

Dispatch order in `index.php`:

1. Normalize request path.
2. **Guard middleware:** if path matches a `url_rules.real_path`, require a valid server-side gate token in session, else HTTP 403.
3. **Gate handler:** if path matches a `url_rules.dummy_path`, render the gate page (code prompt).
4. **Router:** otherwise dispatch to app routes (login, code, settings, logout).
5. Default: 404.

Gate token: on successful user-code verification, server stores `$_SESSION['gates'][rule_id] = ['token' => random, 'expires' => time() + 600]`. Guard verifies presence and expiry. Token is server-side only.

## Route map

| Method | Path | Handler |
|---|---|---|
| GET | `/` | Redirect to `/login` |
| GET/POST | `/login` | Admin password step → on success generate + email 8-char admin code |
| GET/POST | `/login/code` | Admin code verification → verified admin session |
| POST | `/login/resend` | Resend admin code (rate-limited) |
| GET/POST | `/logout` | Destroy session |
| GET | `/settings` | Settings dashboard (requires verified admin session) |
| POST | `/settings/users/add` | Create user (username, bcrypt password, email) |
| POST | `/settings/users/delete` | Delete user |
| POST | `/settings/rules/add` | Create dummy→real rule assigned to a user |
| POST | `/settings/rules/delete` | Delete rule |
| POST | `/settings/password` | Change admin password (requires current password) |
| GET/POST | `/g/{dummy}` | User gate: code prompt; `send` and `verify` actions |
| GET | `{real_path}` | Guard middleware → protected content or 403 |
| * | anything else | 404 |

Gate actions are sub-actions of `/g/{dummy}` (e.g. `/g/name-folder/send`, `/g/name-folder/verify`) or POST body `action` fields. Final choice: POST fields `action=send` / `action=verify` on `/g/{dummy}`.

## Data model (MySQL)

All tables in `authnamedb`.

### `admins`
- `id` INT PK AI
- `username` VARCHAR(64) UNIQUE NOT NULL
- `password_hash` VARCHAR(255) NOT NULL
- `email` VARCHAR(255) NOT NULL
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### `users`
- `id` INT PK AI
- `username` VARCHAR(64) UNIQUE NOT NULL
- `password_hash` VARCHAR(255) NOT NULL
- `email` VARCHAR(255) NOT NULL
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### `url_rules`
- `id` INT PK AI
- `dummy_path` VARCHAR(255) UNIQUE NOT NULL
- `real_path` VARCHAR(255) UNIQUE NOT NULL
- `associated_user_id` INT NOT NULL, FK → `users(id)` ON DELETE CASCADE
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### `verification_codes`
- `id` INT PK AI
- `type` ENUM('admin','user') NOT NULL
- `admin_id` INT NULL (for admin type)
- `user_id` INT NULL (for user type)
- `rule_id` INT NULL (for user type)
- `code_hash` CHAR(64) NOT NULL
- `attempts` TINYINT NOT NULL DEFAULT 0
- `expires_at` DATETIME NOT NULL
- `used_at` DATETIME NULL
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- INDEX (`type`, `user_id`, `rule_id`), INDEX (`expires_at`)

### `email_rate_limits`
- `id` INT PK AI
- `scope_key` VARCHAR(255) NOT NULL (e.g. `admin:<id>` or `rule:<id>`)
- `window_start` DATETIME NOT NULL
- `sent_count` INT NOT NULL DEFAULT 0
- INDEX (`scope_key`, `window_start`)

## Security implementation notes

- **Codes:** generated with `random_int()` mapped to base62 charset; `hash('sha256', $code . $salt)` stored; lookup by recomputing hash of entered code; one-time via `used_at`; invalidated on 5th failed attempt; 10-min expiry enforced in query.
- **Rate limit:** max 3 sends per 10-minute window per scope key (`email_rate_limits`).
- **Admin auth:** `password_verify()` for login; `session_regenerate_id(true)` after password OK and again after code OK; verified flag `$_SESSION['admin_verified']`.
- **Sessions:** `session_set_cookie_params` with `httponly`, `samesite=Strict`, `secure` when `HTTPS`; settings in `config.php`.
- **CSRF:** token stored in `$_SESSION['csrf']`; `hash_equals()` check on every POST.
- **DB:** single PDO connection; prepared statements everywhere.
- **Output:** `htmlspecialchars()` on all dynamic output.
- **Headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` (default-src 'self'), `Referrer-Policy`.
- **Real-path guard:** top of `index.php`; if no valid gate → 403 + exit; protects against direct access regardless of referrer or method.

## File structure

```
php/
├── .htaccess
├── index.php            # guard middleware + router
├── config.php           # DB + SMTP + security settings
├── routes.php           # route dispatch
├── lib/
│   ├── db.php           # PDO connection + helpers
│   ├── auth.php         # sessions, CSRF, codes, rate limiting
│   ├── mailer.php       # PHPMailer wrapper
│   └── guard.php        # gate-token middleware
├── views/
│   ├── layout.php       # HTML shell (header/footer)
│   ├── login.php        # username + password form
│   ├── admin_code.php   # admin 8-char code form
│   ├── settings.php     # dashboard: users + rules + password change
│   ├── gate.php         # dummy-path gate (user code)
│   └── real.php         # real-destination protected content
├── vendor/              # Composer dependencies (PHPMailer)
├── composer.json
├── schema.sql           # DDL + admin seed
└── README.md
```

## Email sending

PHPMailer (via Composer), SMTP smtp.gmail.com:587, SMTPSecure tls, SMTPAuth on. From = `no-reply@kmcq-gmbh.com` (configurable; Gmail may rewrite to the authenticated address — set Reply-To to the requested From). Body includes the 8-char code and 10-minute expiry warning.

## Admin seed

`schema.sql` inserts admin row:
- username `admin_security`
- password hash = bcrypt of `pass_admin_security7777` (generated with `password_hash` at setup time)
- email `mike082112@gmail.com`

## Setup steps (documented in README)

1. `cd php && composer install`
2. Apply `schema.sql` to `authnamedb` (mysql client).
3. `php -S localhost:8080` for local testing, or configure Apache virtual host with `.htaccess`.
4. Log in at `/login` with seeded admin; change password immediately.

## Testing

- Direct GET to any real path → 403.
- Full gate flow: visit dummy path → send code → check email → enter code → redirect to real path → content shown.
- Attempt limit: 5 wrong codes invalidates the code.
- Rate limit: more than 3 sends in 10 min blocked.
- CSRF: POST without token rejected.

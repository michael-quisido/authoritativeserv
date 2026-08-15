# KMCQ GmbH URL Checkpoint

Secure PHP app: admin login (password + email code), settings dashboard, and dummy→real URL gating with one-time 8-char verification codes.

## Requirements
- PHP 8.1+ (this machine: `php8.2` — the default `php` 8.5 lacks the `pdo_mysql` extension), MySQL, Composer, Apache (with mod_rewrite) or the PHP built-in server.

## Setup
1. `cd php && composer install`
2. Apply schema: `mysql -u userauth -ppassuserauth77 < php/schema.sql`
3. Configure SMTP in `php/config.php` (defaults point at Gmail SMTP; `MAIL_MODE=log` writes emails to `storage/mail.log` for local testing).
4. Serve the `php/` directory as the document root (Apache + `.htaccess`) or run locally:
   `cd php && MAIL_MODE=log php8.2 -S localhost:8080 index.php`

## Login
- URL: `/login`
- Seeded admin: `admin_security` / `pass_admin_security7777` — change it at `/settings` immediately after first login.

## Usage
- Admin creates users and URL rules in `/settings`:
  - Dummy path (e.g. `/name-folder`) is the public gate.
  - Real path (e.g. `/administrators`) is protected; direct access returns 403.
- Visiting the dummy path sends an 8-char code to the rule's assigned user email; entering it grants a 10-minute server-side gate and redirects to the real path.

## Security notes
- Codes: 8 alphanumeric chars, HMAC-SHA256 hashed in DB, one-time, 10-min expiry, 5-attempt limit, 3-send/10-min rate limit.
- Passwords: bcrypt. Sessions: httponly, SameSite=Strict, Secure behind HTTPS.
- CSRF tokens on all POST forms; PDO prepared statements; output escaped.
- Override secrets via env vars (DB_*, MAIL_*, CODE_KEY) instead of editing defaults.

## Tests
- Unit: `cd php && php8.2 tests/run_tests.php && php8.2 tests/test_mailer.php`
- Integration: `cd php && bash tests/integration.sh`

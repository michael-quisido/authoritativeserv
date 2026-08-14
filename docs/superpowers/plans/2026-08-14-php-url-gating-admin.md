# PHP URL-Gating Admin App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a plain-PHP admin app in `php/` with admin password+email-code login, a settings dashboard, and dummy→real URL gating with one-time 8-char codes.

**Architecture:** Front controller (`index.php` + `.htaccess` rewrite). Dispatch order: real-path guard (gate token required) → dummy-path gate handler → app router. Codes hashed with HMAC-SHA256, bcrypt passwords, PDO prepared statements, server-side gate tokens in session, CSRF on all forms.

**Tech Stack:** PHP 8, PDO/MySQL (`authnamedb`), PHPMailer, Apache `.htaccess`, PHP built-in server + curl for integration tests.

**Spec:** `docs/superpowers/specs/2026-08-14-php-url-gating-admin-design.md`

---

### Task 1: Scaffold the `php/` project

**Files:**
- Create: `php/composer.json`
- Create: `php/config.php`
- Create: `php/.htaccess`
- Create: `php/.gitignore`
- Create: `php/storage/` (directory)
- Create: `php/tests/` (directory)
- Create: `php/lib/` (directory)
- Create: `php/views/` (directory)

- [ ] **Step 1: Create the directory tree and composer.json**

```bash
mkdir -p php/lib php/views php/tests php/storage
```

`php/composer.json`:

```json
{
  "name": "kmcq/url-checkpoint",
  "description": "KMCQ GmbH URL Checkpoint - secure PHP URL gating admin app",
  "require": {
    "php": ">=8.1",
    "phpmailer/phpmailer": "^6.9"
  }
}
```

- [ ] **Step 2: Create `php/config.php`**

```php
<?php
declare(strict_types=1);

// --- Database ---
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', (int) (getenv('DB_PORT') ?: '3306'));
define('DB_NAME', getenv('DB_NAME') ?: 'authnamedb');
define('DB_USER', getenv('DB_USER') ?: 'userauth');
define('DB_PASS', getenv('DB_PASS') ?: 'passuserauth77');

// --- Security ---
define('CODE_KEY', getenv('CODE_KEY') ?: '83a05165367c5c7d5006bedacef310f4adee1b3272cddebbaec9200efbc2af37');
define('CODE_LENGTH', 8);
define('CODE_TTL', 600);            // seconds (10 minutes)
define('CODE_MAX_ATTEMPTS', 5);
define('RATE_LIMIT_WINDOW', 600);   // seconds (10 minutes)
define('RATE_LIMIT_MAX', 3);        // sends per window per scope

define('SESSION_NAME', 'kmcq_auth_sess');
define('SESSION_SECURE', getenv('SESSION_SECURE') === '1'); // enable behind HTTPS

// --- Mail ---
define('MAIL_MODE', getenv('MAIL_MODE') ?: 'smtp'); // 'smtp' or 'log'
define('MAIL_SMTP_HOST', getenv('MAIL_SMTP_HOST') ?: 'smtp.gmail.com');
define('MAIL_SMTP_PORT', (int) (getenv('MAIL_SMTP_PORT') ?: '587'));
define('MAIL_SMTP_USER', getenv('MAIL_SMTP_USER') ?: 'mike082112@gmail.com');
define('MAIL_SMTP_PASS', getenv('MAIL_SMTP_PASS') ?: 'laehzxoymwwarvki');
define('MAIL_FROM', 'no-reply@kmcq-gmbh.com');
define('MAIL_FROM_NAME', 'KMCQ GmbH URL Checkpoint');
define('MAIL_LOG_FILE', __DIR__ . '/storage/mail.log');
```

- [ ] **Step 3: Create `php/.htaccess`**

```apache
RewriteEngine On

# Block direct access to internals
RewriteRule ^(?:lib|storage|vendor)/ - [F,L]

# Uncomment in production behind TLS:
# RewriteCond %{HTTPS} off
# RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Front controller
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [L]
```

- [ ] **Step 4: Create `php/.gitignore`**

```gitignore
storage/mail.log
```

- [ ] **Step 5: Install PHPMailer and verify**

Run: `cd php && composer install`
Expected: "Package operations: 1 install" and `vendor/autoload.php` exists.

- [ ] **Step 6: Commit**

```bash
git add php
git commit -m "feat(php): scaffold PHP URL checkpoint project"
```

---

### Task 2: Database schema + admin seed

**Files:**
- Create: `php/schema.sql`

- [ ] **Step 1: Create `php/schema.sql`**

```sql
CREATE DATABASE IF NOT EXISTS authnamedb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE authnamedb;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS url_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dummy_path VARCHAR(255) NOT NULL UNIQUE,
  real_path VARCHAR(255) NOT NULL UNIQUE,
  associated_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rules_user FOREIGN KEY (associated_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS verification_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM('admin','user') NOT NULL,
  admin_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NULL,
  rule_id INT UNSIGNED NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lookup (type, admin_id, user_id, rule_id),
  INDEX idx_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_rate_limits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scope_key VARCHAR(255) NOT NULL,
  window_start DATETIME NOT NULL,
  INDEX idx_scope (scope_key, window_start)
) ENGINE=InnoDB;

-- Seed admin: username admin_security / password pass_admin_security7777 / email mike082112@gmail.com
INSERT INTO admins (username, password_hash, email)
VALUES ('admin_security', '$2y$12$RK8WWhxx1RV7uaxe9ke5COJw5fUjafRaP.Z1OHCS.vki9Qnq7XFXi', 'mike082112@gmail.com')
ON DUPLICATE KEY UPDATE username = VALUES(username);
```

- [ ] **Step 2: Apply the schema and verify tables**

Run: `mysql -u userauth -ppassuserauth77 < php/schema.sql && mysql -u userauth -ppassuserauth77 -e "USE authnamedb; SHOW TABLES; SELECT username, email FROM admins;"`
Expected: tables `admins users url_rules verification_codes email_rate_limits` listed, one admin row with `admin_security`.

- [ ] **Step 3: Commit**

```bash
git add php/schema.sql
git commit -m "feat(php): add schema and seed admin"
```

---

### Task 3: Core libraries — util + db

**Files:**
- Create: `php/lib/util.php`
- Create: `php/lib/db.php`

- [ ] **Step 1: Create `php/lib/util.php`**

```php
<?php
declare(strict_types=1);

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

function flash_set(string $type, string $message): void
{
    start_session();
    $_SESSION['flash'] = ['type' => $type, 'message' => $message];
}

function flash_get(): ?array
{
    start_session();
    if (!empty($_SESSION['flash'])) {
        $f = $_SESSION['flash'];
        unset($_SESSION['flash']);
        return $f;
    }
    return null;
}

function render(string $view, array $vars = []): string
{
    extract($vars, EXTR_SKIP);
    ob_start();
    require __DIR__ . '/../views/' . $view;
    return (string) ob_get_clean();
}

function layout(string $content, string $pageTitle = '', bool $wide = false): void
{
    $page_title = $pageTitle;
    $content = $content;
    $wide = $wide;
    require __DIR__ . '/../views/layout.php';
}
```

- [ ] **Step 2: Create `php/lib/db.php`**

```php
<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}
```

- [ ] **Step 3: Smoke test**

Run: `php -r "require 'php/config.php'; require 'php/lib/db.php'; var_dump((int) db()->query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0);"`
Expected: `bool(true)` (proves PDO connects to the seeded DB).

- [ ] **Step 4: Commit**

```bash
git add php/lib/util.php php/lib/db.php
git commit -m "feat(php): add util helpers and PDO connection"
```

---

### Task 4: auth.php — sessions, CSRF, code generation

**Files:**
- Create: `php/lib/auth.php`
- Create: `php/tests/run_tests.php`

- [ ] **Step 1: Write the failing unit test harness `php/tests/run_tests.php`**

```php
<?php
declare(strict_types=1);
error_reporting(E_ALL);
putenv('MAIL_MODE=log');
require __DIR__ . '/../config.php';
require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../lib/util.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/auth.php';
require __DIR__ . '/../lib/guard.php';

$passed = 0; $failed = 0;
function assert_true(bool $cond, string $name): void {
    global $passed, $failed;
    if ($cond) { $passed++; echo "PASS: $name\n"; }
    else { $failed++; echo "FAIL: $name\n"; }
}
function assert_same($expected, $actual, string $name): void {
    assert_true($expected === $actual, "$name (expected=" . var_export($expected, true) . ", got=" . var_export($actual, true) . ")");
}

// --- code generation ---
for ($i = 0; $i < 100; $i++) {
    $c = generate_code(8);
    assert_true(strlen($c) === 8 && preg_match('/^[A-Za-z0-9]{8}$/', $c) === 1, "code format iteration $i");
}
$seen = [];
for ($i = 0; $i < 50; $i++) { $seen[generate_code(8)] = true; }
assert_true(count($seen) >= 40, 'codes vary');

// --- hashing ---
assert_same(hash_code('abc12345'), hash_code('abc12345'), 'hash_code deterministic');
assert_true(hash_code('abc12345') !== hash_code('abc1234Z'), 'hash_code differs');

// --- session + csrf ---
start_session();
$tok = csrf_token();
assert_true(csrf_verify($tok), 'csrf valid token');
assert_true(!csrf_verify('wrong'), 'csrf wrong token');
assert_true(!csrf_verify(null), 'csrf null token');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test, verify it fails**

Run: `php tests/run_tests.php`
Expected: FAIL with "Call to undefined function generate_code()".

- [ ] **Step 3: Implement `php/lib/auth.php` (session, CSRF, codes)**

```php
<?php
declare(strict_types=1);

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name(SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => SESSION_SECURE,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function csrf_token(): string
{
    start_session();
    return $_SESSION['csrf'];
}

function csrf_verify(?string $token): bool
{
    start_session();
    return is_string($token) && $token !== '' && hash_equals($_SESSION['csrf'], $token);
}

function require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        exit('Method Not Allowed');
    }
}

function require_csrf(): void
{
    $token = $_POST['csrf'] ?? null;
    if (!csrf_verify(is_string($token) ? $token : null)) {
        http_response_code(403);
        exit('Invalid CSRF token');
    }
}

function generate_code(int $length = 8): string
{
    $charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    $max = strlen($charset) - 1;
    $code = '';
    for ($i = 0; $i < $length; $i++) {
        $code .= $charset[random_int(0, $max)];
    }
    return $code;
}

function hash_code(string $code): string
{
    return hash_hmac('sha256', $code, CODE_KEY);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `php tests/run_tests.php`
Expected: all PASS, "0 failed", exit code 0.

- [ ] **Step 5: Commit**

```bash
git add php/lib/auth.php php/tests/run_tests.php
git commit -m "feat(php): sessions, CSRF, secure code generation"
```

---

### Task 5: auth.php — rate limiting, code issue/verify, admin password check

**Files:**
- Modify: `php/lib/auth.php` (append)
- Modify: `php/tests/run_tests.php` (append DB tests)

- [ ] **Step 1: Append failing DB tests to `php/tests/run_tests.php`**

Insert before the final `echo "\n$passed passed..."` line:

```php
// --- rate limiting ---
$pdo = db();
$scope = 'test:' . bin2hex(random_bytes(6));
for ($i = 0; $i < 3; $i++) { assert_true(try_record_rate_limit($pdo, $scope), "rate allow $i"); }
assert_true(!try_record_rate_limit($pdo, $scope), 'rate limit blocks after 3');
$pdo->prepare('DELETE FROM email_rate_limits WHERE scope_key = ?')->execute([$scope]);

// --- user code issue/verify ---
$uid = 'testuser_' . bin2hex(random_bytes(4));
$stmt = $pdo->prepare('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)');
$stmt->execute([$uid, password_hash('pw12345678', PASSWORD_BCRYPT), $uid . '@example.com']);
$userId = (int) $pdo->lastInsertId();

$code = issue_code($pdo, 'user', null, $userId, null);
assert_true(verify_code($pdo, 'user', null, $userId, null, 'WRONGWRONG') === false, 'wrong code rejected');
assert_true(verify_code($pdo, 'user', null, $userId, null, $code) === true, 'correct code accepted');
assert_true(verify_code($pdo, 'user', null, $userId, null, $code) === false, 'code is single use');

$code2 = issue_code($pdo, 'user', null, $userId, null);
for ($i = 0; $i < 5; $i++) { verify_code($pdo, 'user', null, $userId, null, 'BADCODE0'); }
assert_true(verify_code($pdo, 'user', null, $userId, null, $code2) === false, 'code locked after 5 attempts');

$stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
$stmt->execute([$userId]);
$hash = (string) $stmt->fetchColumn();
assert_true(password_verify('pw12345678', $hash), 'user password verifies');

// --- admin password check ---
$stmt = $pdo->prepare('SELECT id FROM admins WHERE username = ? LIMIT 1');
$stmt->execute(['admin_security']);
$adminId = (int) $stmt->fetchColumn();
assert_true($adminId > 0, 'seeded admin exists');
assert_same($adminId, admin_password_ok($pdo, 'admin_security', 'pass_admin_security7777'), 'admin password ok');
assert_true(admin_password_ok($pdo, 'admin_security', 'wrongpass') === null, 'admin password wrong');

$pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
```

- [ ] **Step 2: Run test, verify new cases fail**

Run: `php tests/run_tests.php`
Expected: new cases FAIL with "Call to undefined function try_record_rate_limit()".

- [ ] **Step 3: Append to `php/lib/auth.php`**

```php
function try_record_rate_limit(PDO $pdo, string $scope): bool
{
    try {
        $stmt = $pdo->prepare('INSERT INTO email_rate_limits (scope_key, window_start)
            SELECT ?, NOW() FROM dual
            WHERE (SELECT COUNT(*) FROM email_rate_limits
                WHERE scope_key = ? AND window_start >= (NOW() - INTERVAL ' . (int) RATE_LIMIT_WINDOW . ' SECOND)) < ' . (int) RATE_LIMIT_MAX);
        $stmt->execute([$scope, $scope]);
        return $stmt->rowCount() === 1;
    } catch (PDOException $e) {
        return false; // fail closed under contention
    }
}
        WHERE (SELECT COUNT(*) FROM email_rate_limits
            WHERE scope_key = ? AND window_start >= (NOW() - INTERVAL ' . (int) RATE_LIMIT_WINDOW . ' SECOND)) < ' . (int) RATE_LIMIT_MAX);
    $stmt->execute([$scope, $scope]);
    return $stmt->rowCount() === 1;
}

function issue_code(PDO $pdo, string $type, ?int $adminId, ?int $userId, ?int $ruleId): string
{
    $code = generate_code(CODE_LENGTH);
    $stmt = $pdo->prepare('INSERT INTO verification_codes (type, admin_id, user_id, rule_id, code_hash, expires_at)
        VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ' . (int) CODE_TTL . ' SECOND)');
    $stmt->execute([$type, $adminId, $userId, $ruleId, hash_code($code)]);
    return $code;
}

function verify_code(PDO $pdo, string $type, ?int $adminId, ?int $userId, ?int $ruleId, string $input): bool
{
    $stmt = $pdo->prepare('SELECT id, code_hash, attempts, expires_at FROM verification_codes
        WHERE type = ? AND admin_id <=> ? AND user_id <=> ? AND rule_id <=> ? AND used_at IS NULL
        ORDER BY id DESC LIMIT 1');
    $stmt->execute([$type, $adminId, $userId, $ruleId]);
    $row = $stmt->fetch();
    if (!$row) {
        return false;
    }
    if ((int) $row['attempts'] >= CODE_MAX_ATTEMPTS || strtotime((string) $row['expires_at']) < time()) {
        $pdo->prepare('UPDATE verification_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL')->execute([(int) $row['id']]);
        return false;
    }
    if (!hash_equals((string) $row['code_hash'], hash_code($input))) {
        $pdo->prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?')->execute([(int) $row['id']]);
        return false;
    }
    $claim = $pdo->prepare('UPDATE verification_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL AND attempts < ' . (int) CODE_MAX_ATTEMPTS);
    $claim->execute([(int) $row['id']]);
    return $claim->rowCount() === 1;
}

function admin_password_ok(PDO $pdo, string $username, string $password): ?int
{
    $stmt = $pdo->prepare('SELECT id, password_hash FROM admins WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($password, (string) $row['password_hash'])) {
        return null;
    }
    return (int) $row['id'];
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `php tests/run_tests.php`
Expected: all PASS, "0 failed", exit code 0.

- [ ] **Step 5: Commit**

```bash
git add php/lib/auth.php php/tests/run_tests.php
git commit -m "feat(php): rate limiting, code issue/verify, admin password check"
```

---

### Task 6: mailer.php (PHPMailer wrapper with log mode)

**Files:**
- Create: `php/lib/mailer.php`
- Create: `php/tests/test_mailer.php`

- [ ] **Step 1: Write failing test `php/tests/test_mailer.php`**

```php
<?php
declare(strict_types=1);
putenv('MAIL_MODE=log');
@unlink(__DIR__ . '/../storage/mail.log');
require __DIR__ . '/../config.php';
require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../lib/mailer.php';

$ok = send_verification_email('tester@example.com', 'AbC12345');
$line = (string) file_get_contents(MAIL_LOG_FILE);
$pass = $ok === true && str_contains($line, 'TO=tester@example.com') && str_contains($line, 'AbC12345');
echo $pass ? "PASS: mailer log mode\n" : "FAIL: mailer log mode\n";
@unlink(MAIL_LOG_FILE);
exit($pass ? 0 : 1);
```

- [ ] **Step 2: Run test, verify it fails**

Run: `php tests/test_mailer.php`
Expected: FAIL (undefined function `send_verification_email`).

- [ ] **Step 3: Implement `php/lib/mailer.php`**

```php
<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function send_email(string $to, string $subject, string $body): bool
{
    if (MAIL_MODE === 'log') {
        $line = sprintf("[%s] TO=%s SUBJECT=%s BODY=%s%s", date('c'), $to, $subject, str_replace("\n", '\\n', $body), PHP_EOL);
        file_put_contents(MAIL_LOG_FILE, $line, FILE_APPEND | LOCK_EX);
        return true;
    }
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = MAIL_SMTP_HOST;
        $mail->SMTPAuth = true;
        $mail->Username = MAIL_SMTP_USER;
        $mail->Password = MAIL_SMTP_PASS;
        $mail->Port = MAIL_SMTP_PORT;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Timeout = 10;
        $mail->CharSet = 'UTF-8';
        $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addReplyTo(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->Body = $body;
        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log('Mail send failed: ' . $e->getMessage());
        return false;
    }
}

function send_verification_email(string $to, string $code): bool
{
    $subject = 'Your KMCQ GmbH verification code';
    $body = "Your one-time verification code is: {$code}\n\nThis code expires in 10 minutes and can only be used once.\n\nIf you did not request this code, please ignore this email.";
    return send_email($to, $subject, $body);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `php tests/test_mailer.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add php/lib/mailer.php php/tests/test_mailer.php
git commit -m "feat(php): PHPMailer wrapper with log mode"
```

---

### Task 7: guard.php — server-side gate tokens

**Files:**
- Create: `php/lib/guard.php`
- Modify: `php/tests/run_tests.php` (append gate tests)

- [ ] **Step 1: Append failing gate tests to `php/tests/run_tests.php`**

Insert before the final `echo "\n$passed passed..."` line:

```php
// --- gate tokens ---
gate_issue(99);
assert_true(gate_valid(99), 'gate valid after issue');
assert_true(!gate_valid(999), 'unknown gate invalid');
$_SESSION['gates'][99]['expires'] = time() - 1;
assert_true(!gate_valid(99), 'gate invalid after expiry');
```

- [ ] **Step 2: Run test, verify new cases fail**

Run: `php tests/run_tests.php`
Expected: new cases FAIL with "Call to undefined function gate_issue()".

- [ ] **Step 3: Implement `php/lib/guard.php`**

```php
<?php
declare(strict_types=1);

function gate_issue(int $ruleId): void
{
    start_session();
    $_SESSION['gates'][$ruleId] = [
        'token' => bin2hex(random_bytes(32)),
        'expires' => time() + CODE_TTL,
    ];
}

function gate_valid(int $ruleId): bool
{
    start_session();
    $g = $_SESSION['gates'][$ruleId] ?? null;
    if (!is_array($g) || !isset($g['expires'])) {
        return false;
    }
    if ((int) $g['expires'] < time()) {
        unset($_SESSION['gates'][$ruleId]);
        return false;
    }
    return true;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `php tests/run_tests.php`
Expected: all PASS, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add php/lib/guard.php php/tests/run_tests.php
git commit -m "feat(php): server-side gate tokens"
```

---

### Task 8: Views (layout, login, code, settings, gate, real)

**Files:**
- Create: `php/views/layout.php`
- Create: `php/views/login.php`
- Create: `php/views/admin_code.php`
- Create: `php/views/settings.php`
- Create: `php/views/gate.php`
- Create: `php/views/real.php`

- [ ] **Step 1: Create `php/views/layout.php`**

```php
<?php /** @var string $page_title */ /** @var string $content */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($page_title) ?></title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #fafafa; margin: 0; padding: 24px; color: #1a1a1a; }
  .card { max-width: 420px; margin: 48px auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 24px; }
  .card.wide { max-width: 720px; }
  label { display: block; margin: 12px 0 4px; font-size: 13px; color: #555; }
  input[type=text], input[type=password], input[type=email], select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 6px; }
  button, .btn { display: inline-block; margin-top: 16px; padding: 10px 16px; border: none; border-radius: 6px; background: #e07b00; color: #fff; font-size: 14px; cursor: pointer; text-decoration: none; }
  .flash { padding: 10px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
  .flash.ok { background: #e6f4e6; color: #1a5a1a; border: 1px solid #a6d8a6; }
  .flash.err { background: #fbeaea; color: #8a1a1a; border: 1px solid #eebcbc; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
  th { font-size: 12px; text-transform: uppercase; color: #777; }
  .muted { color: #777; font-size: 13px; }
  .right { float: right; }
  hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
  code { background: #f3f3f3; padding: 1px 6px; border-radius: 4px; }
</style>
</head>
<body>
<div class="card<?= $wide ? ' wide' : '' ?>">
<?php $f = flash_get(); if ($f): ?>
  <div class="flash <?= e($f['type']) ?>"><?= e($f['message']) ?></div>
<?php endif; ?>
<?= $content ?>
</div>
</body>
</html>
```

- [ ] **Step 2: Create `php/views/login.php`**

```php
<?php /** @var array $errors */ ?>
<h2>Admin Login</h2>
<?php if (!empty($errors)): ?>
  <div class="flash err"><?= e($errors[0]) ?></div>
<?php endif; ?>
<form method="post" action="/login">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>Username</label>
  <input type="text" name="username" required autofocus>
  <label>Password</label>
  <input type="password" name="password" required>
  <button type="submit">Login</button>
</form>
```

- [ ] **Step 3: Create `php/views/admin_code.php`**

```php
<?php /** @var array $errors */ ?>
<h2>Enter Verification Code</h2>
<p class="muted">A one-time 8-character code was sent to your email. It expires in 10 minutes.</p>
<?php if (!empty($errors)): ?>
  <div class="flash err"><?= e($errors[0]) ?></div>
<?php endif; ?>
<form method="post" action="/login/code">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>8-character code</label>
  <input type="text" name="code" pattern="[A-Za-z0-9]{8}" maxlength="8" required>
  <button type="submit">Verify</button>
</form>
<form method="post" action="/login/resend">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <button type="submit" class="muted">Resend code</button>
</form>
```

- [ ] **Step 4: Create `php/views/settings.php`**

```php
<?php /** @var array $users */ /** @var array $rules */ ?>
<div class="right"><a class="btn" href="/logout">Logout</a></div>
<h2>Settings Dashboard</h2>
<p class="muted">Logged in as <?= e($_SESSION['admin_username'] ?? 'admin') ?></p>

<hr>
<h3>Users</h3>
<table>
  <tr><th>ID</th><th>Username</th><th>Email</th><th></th></tr>
  <?php foreach ($users as $u): ?>
  <tr>
    <td><?= e((string) $u['id']) ?></td>
    <td><?= e($u['username']) ?></td>
    <td><?= e($u['email']) ?></td>
    <td>
      <form method="post" action="/settings/users/delete" onsubmit="return confirm('Delete this user?');">
        <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
        <input type="hidden" name="user_id" value="<?= e((string) $u['id']) ?>">
        <button type="submit" class="muted">Delete</button>
      </form>
    </td>
  </tr>
  <?php endforeach; ?>
</table>
<form method="post" action="/settings/users/add">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>New user username</label>
  <input type="text" name="username" required>
  <label>New user password</label>
  <input type="text" name="password" required>
  <label>New user email</label>
  <input type="email" name="email" required>
  <button type="submit">Add user</button>
</form>

<hr>
<h3>Protected URL Rules</h3>
<table>
  <tr><th>ID</th><th>Dummy path</th><th>Real path</th><th>Assigned user</th><th></th></tr>
  <?php foreach ($rules as $r): ?>
  <tr>
    <td><?= e((string) $r['id']) ?></td>
    <td><code><?= e($r['dummy_path']) ?></code></td>
    <td><code><?= e($r['real_path']) ?></code></td>
    <td><?= e($r['username']) ?></td>
    <td>
      <form method="post" action="/settings/rules/delete" onsubmit="return confirm('Delete this rule?');">
        <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
        <input type="hidden" name="rule_id" value="<?= e((string) $r['id']) ?>">
        <button type="submit" class="muted">Delete</button>
      </form>
    </td>
  </tr>
  <?php endforeach; ?>
</table>
<form method="post" action="/settings/rules/add">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>Dummy path (e.g. /name-folder)</label>
  <input type="text" name="dummy_path" required placeholder="/name-folder">
  <label>Real path (e.g. /administrators)</label>
  <input type="text" name="real_path" required placeholder="/administrators">
  <label>Assign to user</label>
  <select name="user_id" required>
    <?php foreach ($users as $u): ?>
      <option value="<?= e((string) $u['id']) ?>"><?= e($u['username']) ?> (<?= e($u['email']) ?>)</option>
    <?php endforeach; ?>
  </select>
  <button type="submit">Add rule</button>
</form>

<hr>
<h3>Change Admin Password</h3>
<form method="post" action="/settings/password">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>Current password</label>
  <input type="password" name="current_password" required>
  <label>New password</label>
  <input type="password" name="new_password" required>
  <button type="submit">Change password</button>
</form>
```

- [ ] **Step 5: Create `php/views/gate.php`**

```php
<?php /** @var array $rule */ /** @var array $errors */ /** @var bool $sent */ ?>
<h2>Restricted Area</h2>
<p class="muted">This URL is protected by the KMCQ GmbH URL Checkpoint. Request an 8-character verification code (sent to the registered email) and enter it to continue.</p>
<?php if (!empty($errors)): ?>
  <div class="flash err"><?= e($errors[0]) ?></div>
<?php endif; ?>
<?php if ($sent): ?>
  <div class="flash ok">A verification code was sent to your email.</div>
<?php endif; ?>
<form method="post" action="<?= e($rule['dummy_path']) ?>">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <input type="hidden" name="action" value="send">
  <button type="submit">Send verification code</button>
</form>
<form method="post" action="<?= e($rule['dummy_path']) ?>">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <input type="hidden" name="action" value="verify">
  <label>8-character code</label>
  <input type="text" name="code" pattern="[A-Za-z0-9]{8}" maxlength="8" required>
  <button type="submit">Verify and continue</button>
</form>
```

- [ ] **Step 6: Create `php/views/real.php`**

```php
<?php /** @var array $rule */ ?>
<h2>Protected Destination</h2>
<p>You have successfully passed the KMCQ GmbH URL Checkpoint gate.</p>
<p class="muted">Real path: <code><?= e($rule['real_path']) ?></code> &middot; Rule ID: <?= e((string) $rule['id']) ?></p>
```

- [ ] **Step 7: Lint all views**

Run: `for f in php/views/*.php; do php -l "$f"; done`
Expected: "No syntax errors detected" for each file.

- [ ] **Step 8: Commit**

```bash
git add php/views
git commit -m "feat(php): add views"
```

---

### Task 9: index.php + routes — admin login flow

**Files:**
- Create: `php/index.php`
- Create: `php/routes.php`
- Create: `php/tests/integration.sh`

- [ ] **Step 1: Create `php/index.php`**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/mailer.php';
require __DIR__ . '/lib/guard.php';

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'");

start_session();

require __DIR__ . '/routes.php';
route();
exit;
```

- [ ] **Step 2: Create `php/routes.php` (login flow first)**

```php
<?php
declare(strict_types=1);

function require_admin_verified(): void
{
    start_session();
    if (empty($_SESSION['admin_verified'])) {
        redirect('/login');
    }
}

function h_login(): void
{
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        require_post();
        require_csrf();
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        $pdo = db();
        $adminId = admin_password_ok($pdo, $username, $password);
        if ($adminId === null) {
            layout(render('login.php', ['errors' => ['Invalid username or password.']]), 'Admin Login');
            return;
        }
        $scope = 'admin:' . $adminId;
        if (!try_record_rate_limit($pdo, $scope)) {
            layout(render('login.php', ['errors' => ['Too many codes requested. Try again later.']]), 'Admin Login');
            return;
        }
        $code = issue_code($pdo, 'admin', $adminId, null, null);
        $stmt = $pdo->prepare('SELECT email FROM admins WHERE id = ?');
        $stmt->execute([$adminId]);
        $email = (string) $stmt->fetchColumn();
        send_verification_email($email, $code);
        session_regenerate_id(true);
        $_SESSION['admin_pw_ok'] = $adminId;
        $_SESSION['admin_username'] = $username;
        flash_set('ok', 'Verification code sent to your email.');
        redirect('/login/code');
    }
    layout(render('login.php', ['errors' => []]), 'Admin Login');
}

function h_admin_code(): void
{
    start_session();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        require_post();
        require_csrf();
    }
    if (empty($_SESSION['admin_pw_ok'])) {
        redirect('/login');
    }
    $errors = [];
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = trim((string) ($_POST['code'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9]{8}$/', $input)) {
            $errors[] = 'Code must be exactly 8 alphanumeric characters.';
        } else {
            $adminId = (int) $_SESSION['admin_pw_ok'];
            if (verify_code(db(), 'admin', $adminId, null, null, $input)) {
                session_regenerate_id(true);
                $_SESSION['admin_verified'] = $adminId;
                unset($_SESSION['admin_pw_ok']);
                flash_set('ok', 'Welcome back.');
                redirect('/settings');
            }
            $errors[] = 'Invalid or expired code.';
        }
    }
    layout(render('admin_code.php', ['errors' => $errors]), 'Verify Code');
}

function h_admin_resend(): void
{
    require_post();
    require_csrf();
    if (empty($_SESSION['admin_pw_ok'])) {
        redirect('/login');
    }
    $adminId = (int) $_SESSION['admin_pw_ok'];
    $pdo = db();
    $scope = 'admin:' . $adminId;
    if (!try_record_rate_limit($pdo, $scope)) {
        flash_set('err', 'Too many requests. Try again later.');
        redirect('/login/code');
    }
    $code = issue_code($pdo, 'admin', $adminId, null, null);
    $stmt = $pdo->prepare('SELECT email FROM admins WHERE id = ?');
    $stmt->execute([$adminId]);
    send_verification_email((string) $stmt->fetchColumn(), $code);
    flash_set('ok', 'New code sent.');
    redirect('/login/code');
}

function h_logout(): void
{
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    redirect('/login');
}

function route(): void
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $path = rtrim((string) $path, '/');
    if ($path === '') {
        $path = '/';
    }

    $pdo = db();

    // Guard: real destination requires a valid gate token.
    $stmt = $pdo->prepare('SELECT * FROM url_rules WHERE real_path = ? LIMIT 1');
    $stmt->execute([$path]);
    $rule = $stmt->fetch();
    if ($rule) {
        if (!gate_valid((int) $rule['id'])) {
            http_response_code(403);
            exit('403 Forbidden');
        }
        layout(render('real.php', ['rule' => $rule]), 'Protected Destination');
        exit;
    }

    // Gate: dummy path.
    $stmt = $pdo->prepare('SELECT * FROM url_rules WHERE dummy_path = ? LIMIT 1');
    $stmt->execute([$path]);
    $rule = $stmt->fetch();
    if ($rule) {
        require __DIR__ . '/routes_gate.php';
        handle_gate($rule);
        exit;
    }

    switch ($path) {
        case '/':
            redirect('/login');
            break;
        case '/login':
            h_login();
            break;
        case '/login/code':
            h_admin_code();
            break;
        case '/login/resend':
            h_admin_resend();
            break;
        case '/logout':
            h_logout();
            break;
        default:
            http_response_code(404);
            exit('404 Not Found');
    }
}
```

- [ ] **Step 3: Write the integration test `php/tests/integration.sh` (login part)**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MAIL_LOG="storage/mail.log"
rm -f "$MAIL_LOG"
PORT="8090"
BASE="http://127.0.0.1:$PORT"
CJAR="$(mktemp)"
export MAIL_MODE=log

php8.2 -S "127.0.0.1:$PORT" index.php >/tmp/kmcq_srv.log 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null; rm -f "$CJAR"' EXIT
sleep 1

fail() { echo "FAIL: $1"; exit 1; }

get_csrf() {
  curl -s -b "$CJAR" -c "$CJAR" "$1" | grep -oP 'name="csrf" value="\K[^"]+' | head -1
}

CSRF="$(get_csrf "$BASE/login")"
[ -n "$CSRF" ] || fail "csrf token missing on login page"

# wrong password stays on login
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&username=admin_security&password=wrongpass" "$BASE/login")
[ "$status" = "200" ] || fail "wrong password should stay on login (got $status)"

# correct password -> code emailed, redirect to /login/code
curl -s -D /tmp/hdr -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&username=admin_security&password=pass_admin_security7777" "$BASE/login"
loc=$(grep -i '^location:' /tmp/hdr | tr -d '\r' | cut -d' ' -f2)
[ "$loc" = "/login/code" ] || fail "login should redirect to /login/code (got $loc)"
ADMIN_CODE=$(grep -oP 'verification code is: \K[A-Za-z0-9]{8}' "$MAIL_LOG" | tail -1)
[ -n "$ADMIN_CODE" ] || fail "admin code not found in mail.log"

# verify code -> /settings
CSRF=$(get_csrf "$BASE/login/code")
curl -s -D /tmp/hdr2 -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&code=$ADMIN_CODE" "$BASE/login/code"
loc=$(grep -i '^location:' /tmp/hdr2 | tr -d '\r' | cut -d' ' -f2)
[ "$loc" = "/settings" ] || fail "code verify should redirect to /settings (got $loc)"

# missing CSRF rejected
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" \
  --data "code=$ADMIN_CODE" "$BASE/login/code")
[ "$status" = "403" ] || fail "missing csrf should be 403 (got $status)"

echo "ALL INTEGRATION TESTS PASSED"
```
> NOTE: the `/settings` reachable check is added in Task 10 (after the `/settings` route exists).

- [ ] **Step 4: Run the integration test, verify it passes**

Run: `bash tests/integration.sh`
Expected: "ALL INTEGRATION TESTS PASSED". If `grep -oP` is unavailable, install `grep` with PCRE or use `sed`. If the server log shows issues, read `/tmp/kmcq_srv.log`.

- [ ] **Step 5: Commit**

```bash
chmod +x tests/integration.sh
git add php/index.php php/routes.php php/tests/integration.sh
git commit -m "feat(php): front controller and admin login flow"
```

---

### Task 10: Settings handlers (users, rules, password)

**Files:**
- Modify: `php/routes.php` (add cases + handlers)

- [ ] **Step 1: Add cases to the switch in `php/routes.php`**

Replace the `default:` case block so the switch reads:

```php
    switch ($path) {
        case '/':
            redirect('/login');
            break;
        case '/login':
            h_login();
            break;
        case '/login/code':
            h_admin_code();
            break;
        case '/login/resend':
            h_admin_resend();
            break;
        case '/logout':
            h_logout();
            break;
        case '/settings':
            h_settings();
            break;
        case '/settings/users/add':
            h_settings_users_add();
            break;
        case '/settings/users/delete':
            h_settings_users_delete();
            break;
        case '/settings/rules/add':
            h_settings_rules_add();
            break;
        case '/settings/rules/delete':
            h_settings_rules_delete();
            break;
        case '/settings/password':
            h_settings_password();
            break;
        default:
            http_response_code(404);
            exit('404 Not Found');
    }
```

- [ ] **Step 2: Append handlers to `php/routes.php`**

```php
function h_settings(): void
{
    require_admin_verified();
    $pdo = db();
    $users = $pdo->query('SELECT id, username, email FROM users ORDER BY id')->fetchAll();
    $rules = $pdo->query('SELECT r.id, r.dummy_path, r.real_path, u.username FROM url_rules r JOIN users u ON u.id = r.associated_user_id ORDER BY r.id')->fetchAll();
    layout(render('settings.php', ['users' => $users, 'rules' => $rules]), 'Settings', true);
}

function h_settings_users_add(): void
{
    require_admin_verified();
    require_post();
    require_csrf();
    $pdo = db();
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $email = trim((string) ($_POST['email'] ?? ''));
    if ($username === '' || strlen($password) < 10 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        flash_set('err', 'Valid username, password (10+ chars) and email required.');
    } else {
        $stmt = $pdo->prepare('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)');
        $stmt->execute([$username, password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]), $email]);
        flash_set('ok', 'User added.');
    }
    redirect('/settings');
}

function h_settings_users_delete(): void
{
    require_admin_verified();
    require_post();
    require_csrf();
    $stmt = db()->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([(int) ($_POST['user_id'] ?? 0)]);
    flash_set('ok', 'User deleted.');
    redirect('/settings');
}

function h_settings_rules_add(): void
{
    require_admin_verified();
    require_post();
    require_csrf();
    $pdo = db();
    $dummy = '/' . trim((string) ($_POST['dummy_path'] ?? ''), '/');
    $real = '/' . trim((string) ($_POST['real_path'] ?? ''), '/');
    $userId = (int) ($_POST['user_id'] ?? 0);
    if ($dummy === '/' || $real === '/' || $userId < 1) {
        flash_set('err', 'Dummy path, real path and a user are required.');
    } else {
        $stmt = $pdo->prepare('INSERT INTO url_rules (dummy_path, real_path, associated_user_id) VALUES (?, ?, ?)');
        $stmt->execute([$dummy, $real, $userId]);
        flash_set('ok', 'Rule added.');
    }
    redirect('/settings');
}

function h_settings_rules_delete(): void
{
    require_admin_verified();
    require_post();
    require_csrf();
    $stmt = db()->prepare('DELETE FROM url_rules WHERE id = ?');
    $stmt->execute([(int) ($_POST['rule_id'] ?? 0)]);
    flash_set('ok', 'Rule deleted.');
    redirect('/settings');
}

function h_settings_password(): void
{
    require_admin_verified();
    require_post();
    require_csrf();
    $pdo = db();
    $adminId = (int) $_SESSION['admin_verified'];
    $current = (string) ($_POST['current_password'] ?? '');
    $new = (string) ($_POST['new_password'] ?? '');
    $stmt = $pdo->prepare('SELECT password_hash FROM admins WHERE id = ?');
    $stmt->execute([$adminId]);
    $hash = (string) $stmt->fetchColumn();
    if ($hash === '' || !password_verify($current, $hash)) {
        flash_set('err', 'Current password is incorrect.');
    } elseif (strlen($new) < 10) {
        flash_set('err', 'New password must be at least 10 characters.');
    } else {
        $stmt = $pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
        $stmt->execute([password_hash($new, PASSWORD_BCRYPT, ['cost' => 12]), $adminId]);
        flash_set('ok', 'Password changed.');
    }
    redirect('/settings');
}
```

- [ ] **Step 3: Lint**

Run: `php -l routes.php`
Expected: "No syntax errors detected".

- [ ] **Step 4: Run integration test (login part still passes)**

Run: `bash tests/integration.sh`
Expected: "ALL INTEGRATION TESTS PASSED". Append to `php/tests/integration.sh` after the "missing CSRF rejected" block (before the final echo):

```bash
# /settings reachable with verified session
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" "$BASE/settings")
[ "$status" = "200" ] || fail "settings should be 200 after verified login (got $status)"

# settings page renders users and rules sections
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
echo "$body" | grep -q 'Settings Dashboard' || fail "settings dashboard not rendered"
echo "$body" | grep -q 'Protected URL Rules' || fail "rules section missing"
```

- [ ] **Step 5: Commit**

```bash
git add php/routes.php
git commit -m "feat(php): settings handlers for users, rules, password"
```

---

### Task 11: Gate handler + real destination guard

**Files:**
- Create: `php/routes_gate.php`
- Modify: `php/tests/integration.sh` (append gate tests)

- [ ] **Step 1: Create `php/routes_gate.php`**

```php
<?php
declare(strict_types=1);

function handle_gate(array $rule): void
{
    start_session();
    $pdo = db();
    $ruleId = (int) $rule['id'];
    $errors = [];
    $sent = false;

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        require_post();
        require_csrf();
        $action = (string) ($_POST['action'] ?? '');
        if ($action === 'send') {
            $scope = 'rule:' . $ruleId;
            if (!try_record_rate_limit($pdo, $scope)) {
                $errors[] = 'Too many codes requested. Try again later.';
            } else {
                $code = issue_code($pdo, 'user', null, (int) $rule['associated_user_id'], $ruleId);
                $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
                $stmt->execute([(int) $rule['associated_user_id']]);
                $email = (string) $stmt->fetchColumn();
                send_verification_email($email, $code);
                $sent = true;
            }
        } elseif ($action === 'verify') {
            $input = trim((string) ($_POST['code'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9]{8}$/', $input)) {
                $errors[] = 'Code must be exactly 8 alphanumeric characters.';
            } elseif (verify_code($pdo, 'user', null, (int) $rule['associated_user_id'], $ruleId, $input)) {
                gate_issue($ruleId);
                redirect($rule['real_path']);
            } else {
                $errors[] = 'Invalid or expired code.';
            }
        } else {
            $errors[] = 'Invalid action.';
        }
    }

    layout(render('gate.php', ['rule' => $rule, 'errors' => $errors, 'sent' => $sent]), 'Restricted Area');
}
```

- [ ] **Step 2: Append gate-flow tests to `php/tests/integration.sh`**

Insert before the final `echo "ALL INTEGRATION TESTS PASSED"` line:

```bash
# --- Create a test user via settings ---
UNAME="user_$(date +%s)"
CSRF=$(get_csrf "$BASE/settings")
curl -s -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&username=$UNAME&password=userpass12345&email=$UNAME@example.com" \
  "$BASE/settings/users/add"
USER_ID=$(mysql -u userauth -ppassuserauth77 -N -e "USE authnamedb; SELECT id FROM users WHERE username='$UNAME'" 2>/dev/null)
[ -n "$USER_ID" ] || fail "test user not created"

# --- Create a rule ---
CSRF=$(get_csrf "$BASE/settings")
curl -s -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&dummy_path=/test-dummy&real_path=/test-real&user_id=$USER_ID" \
  "$BASE/settings/rules/add"
RULE_ID=$(mysql -u userauth -ppassuserauth77 -N -e "USE authnamedb; SELECT id FROM url_rules WHERE dummy_path='/test-dummy'" 2>/dev/null)
[ -n "$RULE_ID" ] || fail "rule not created"

# --- Direct real path is blocked even with admin session ---
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" "$BASE/test-real")
[ "$status" = "403" ] || fail "direct real path should be 403 (got $status)"

# --- Gate flow as a fresh visitor ---
GJAR="$(mktemp)"
trap 'kill $SRV_PID 2>/dev/null; rm -f "$CJAR" "$GJAR"' EXIT
CSRF=$(get_csrf "$BASE/test-dummy")
[ -n "$CSRF" ] || fail "gate page missing"
curl -s -o /dev/null -b "$GJAR" -c "$GJAR" --data "csrf=$CSRF&action=send" "$BASE/test-dummy"
USER_CODE=$(grep -oP 'verification code is: \K[A-Za-z0-9]{8}' "$MAIL_LOG" | tail -1)
[ -n "$USER_CODE" ] || fail "user code not emailed"
curl -s -D /tmp/hdr3 -o /dev/null -b "$GJAR" -c "$GJAR" \
  --data "csrf=$CSRF&action=verify&code=$USER_CODE" "$BASE/test-dummy"
loc=$(grep -i '^location:' /tmp/hdr3 | tr -d '\r' | cut -d' ' -f2)
[ "$loc" = "/test-real" ] || fail "verify should redirect to /test-real (got $loc)"
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$GJAR" -c "$GJAR" "$BASE/test-real")
[ "$status" = "200" ] || fail "gated real path should be 200 (got $status)"

# --- Wrong-code lockout (5 attempts) ---
GJAR2="$(mktemp)"
trap 'kill $SRV_PID 2>/dev/null; rm -f "$CJAR" "$GJAR" "$GJAR2"' EXIT
CSRF=$(get_csrf "$BASE/test-dummy")
curl -s -o /dev/null -b "$GJAR2" -c "$GJAR2" --data "csrf=$CSRF&action=send" "$BASE/test-dummy"
CODE2=$(grep -oP 'verification code is: \K[A-Za-z0-9]{8}' "$MAIL_LOG" | tail -1)
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -b "$GJAR2" -c "$GJAR2" \
    --data "csrf=$CSRF&action=verify&code=WRONGCODE" "$BASE/test-dummy"
done
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$GJAR2" -c "$GJAR2" \
  --data "csrf=$CSRF&action=verify&code=$CODE2" "$BASE/test-dummy")
[ "$status" = "200" ] || fail "lockout verify should stay on gate (got $status)"
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$GJAR2" -c "$GJAR2" "$BASE/test-real")
[ "$status" = "403" ] || fail "real path should be 403 after lockout (got $status)"

# --- Cleanup test data ---
mysql -u userauth -ppassuserauth77 -e "USE authnamedb; DELETE FROM users WHERE id=$USER_ID" 2>/dev/null || true
```

- [ ] **Step 3: Run the full integration test**

Run: `bash tests/integration.sh`
Expected: "ALL INTEGRATION TESTS PASSED". Check `/tmp/kmcq_srv.log` if a step fails.

- [ ] **Step 4: Commit**

```bash
git add php/routes_gate.php php/tests/integration.sh
git commit -m "feat(php): dummy gate handler and real-path guard tests"
```

---

### Task 12: README + final verification

**Files:**
- Create: `php/README.md`

- [ ] **Step 1: Create `php/README.md`**

```markdown
# KMCQ GmbH URL Checkpoint

Secure PHP app: admin login (password + email code), settings dashboard, and dummy→real URL gating with one-time 8-char verification codes.

## Requirements
- PHP 8.1+, MySQL, Composer, Apache (with mod_rewrite) or the PHP built-in server.

## Setup
1. `cd php && composer install`
2. Apply schema: `mysql -u userauth -ppassuserauth77 < php/schema.sql`
3. Configure SMTP in `php/config.php` (defaults point at Gmail SMTP; `MAIL_MODE=log` writes emails to `storage/mail.log` for local testing).
4. Serve the `php/` directory as the document root (Apache + `.htaccess`) or run locally:
   `cd php && MAIL_MODE=log php -S localhost:8080 index.php`

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
- Unit: `cd php && php tests/run_tests.php && php tests/test_mailer.php`
- Integration: `cd php && bash tests/integration.sh`
```

- [ ] **Step 2: Run all verification**

Run:
```bash
cd php
for f in index.php routes.php routes_gate.php config.php lib/*.php views/*.php tests/*.php; do php -l "$f"; done
php tests/run_tests.php
php tests/test_mailer.php
bash tests/integration.sh
```
Expected: no syntax errors, "0 failed" for unit tests, PASS for mailer, "ALL INTEGRATION TESTS PASSED".

- [ ] **Step 3: Commit**

```bash
git add php/README.md
git commit -m "docs(php): add README and final verification"
```

---

## Self-Review

**Spec coverage check:**
- Admin username/password login → Task 9 (`h_login`), Task 5 (`admin_password_ok`)
- Admin 8-char email code → Tasks 4, 5, 9 (`issue_code`, `verify_code`, `h_admin_code`)
- Settings dashboard gated by verified session → Task 9/10 (`require_admin_verified`)
- Users CRUD, rules CRUD, password change → Task 10
- Dummy gate with user code email + verify → Task 11 (`handle_gate`)
- Real destination guard with server-side gate token → Task 7 (`guard.php`), Task 9 (`route()` real-path branch)
- Code format/one-time/expiry/attempts/rate-limit → Tasks 4, 5
- SQL schema + seed → Task 2
- Security: CSRF, secure cookies, prepared statements, hashed codes, sanitized output → Tasks 3, 4, 9
- PHPMailer SMTP + log mode → Task 6

**Placeholder scan:** all steps contain concrete code/commands. No TBD/TODO.

**Type/name consistency:** `gate_issue`/`gate_valid`, `issue_code`/`verify_code`, `try_record_rate_limit`, `handle_gate` (defined in `routes_gate.php`, required before call) — names match across files. `$_SESSION['admin_verified']` stores the admin id int, consistent in `h_admin_code`, `require_admin_verified`, `h_settings_password`.

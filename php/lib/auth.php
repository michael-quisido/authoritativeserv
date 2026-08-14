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
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_verify(?string $token): bool
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
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
    $hash = $row ? (string) $row['password_hash'] : '$2y$12$n9FAyfQMhdNYNVku.aDm4eReZhwO7mEiwajXVjrvrKr6l2f4KgqiO';
    $ok = password_verify($password, $hash);
    if (!$row || !$ok) {
        return null;
    }
    return (int) $row['id'];
}

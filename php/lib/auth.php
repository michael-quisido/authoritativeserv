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

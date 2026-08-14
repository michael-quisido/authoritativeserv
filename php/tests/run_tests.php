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

ob_start(); // buffer output so session cookie headers are not sent prematurely

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

// --- rate limiting ---
$pdo = db();
$scope = 'test:' . bin2hex(random_bytes(6));
for ($i = 0; $i < 3; $i++) { record_rate_limit($pdo, $scope); }
assert_true(!check_rate_limit($pdo, $scope), 'rate limit blocks after 3');
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

$pdo->prepare('DELETE FROM verification_codes WHERE user_id = ?')->execute([$userId]);
$pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);

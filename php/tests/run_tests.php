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

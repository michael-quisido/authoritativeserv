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

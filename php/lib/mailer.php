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

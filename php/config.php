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

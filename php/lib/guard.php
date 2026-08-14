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

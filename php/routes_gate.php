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
                verify_code($pdo, 'user', null, (int) $rule['associated_user_id'], $ruleId, $input);
                $errors[] = 'Code must be exactly 8 alphanumeric characters.';
            } elseif (verify_code($pdo, 'user', null, (int) $rule['associated_user_id'], $ruleId, $input)) {
                session_regenerate_id(true);
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

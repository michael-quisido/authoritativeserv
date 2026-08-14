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

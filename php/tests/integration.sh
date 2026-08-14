#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MAIL_LOG="storage/mail.log"
rm -f "$MAIL_LOG"
PORT="8090"
BASE="http://127.0.0.1:$PORT"
CJAR="$(mktemp)"
export MAIL_MODE=log

# reset rate-limit + code state so the test is repeatable within a 10-min window
php8.2 -r 'require "config.php"; require "lib/db.php"; db()->exec("DELETE FROM email_rate_limits"); db()->exec("DELETE FROM verification_codes");'

php8.2 -S "127.0.0.1:$PORT" index.php >/tmp/kmcq_srv.log 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null; rm -f "$CJAR"' EXIT
sleep 1

fail() { echo "FAIL: $1"; exit 1; }

get_csrf() {
  curl -s -b "$CJAR" -c "$CJAR" "$1" | grep -oP 'name="csrf" value="\K[^"]+' | head -1
}

CSRF="$(get_csrf "$BASE/login")"
[ -n "$CSRF" ] || fail "csrf token missing on login page"

# wrong password stays on login
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&username=admin_security&password=wrongpass" "$BASE/login")
[ "$status" = "200" ] || fail "wrong password should stay on login (got $status)"

# correct password -> code emailed, redirect to /login/code
curl -s -D /tmp/hdr -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&username=admin_security&password=pass_admin_security7777" "$BASE/login"
loc=$(grep -i '^location:' /tmp/hdr | tr -d '\r' | cut -d' ' -f2 || true)
[ "$loc" = "/login/code" ] || fail "login should redirect to /login/code (got $loc)"
ADMIN_CODE=$(grep -oP 'verification code is: \K[A-Za-z0-9]{8}' "$MAIL_LOG" | tail -1)
[ -n "$ADMIN_CODE" ] || fail "admin code not found in mail.log"

# verify code -> /settings
CSRF=$(get_csrf "$BASE/login/code")
curl -s -D /tmp/hdr2 -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&code=$ADMIN_CODE" "$BASE/login/code"
loc=$(grep -i '^location:' /tmp/hdr2 | tr -d '\r' | cut -d' ' -f2 || true)
[ "$loc" = "/settings" ] || fail "code verify should redirect to /settings (got $loc)"

# missing CSRF rejected
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" \
  --data "code=$ADMIN_CODE" "$BASE/login/code")
[ "$status" = "403" ] || fail "missing csrf should be 403 (got $status)"

echo "ALL INTEGRATION TESTS PASSED"

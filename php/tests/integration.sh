#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MAIL_LOG="storage/mail.log"
rm -f "$MAIL_LOG"
PORT="8090"
BASE="http://127.0.0.1:$PORT"
CJAR="$(mktemp)"
export MAIL_MODE=log

# reset rate-limit + code + app data so the test is repeatable and self-contained
php8.2 -r 'require "config.php"; require "lib/db.php"; $p=db(); $p->exec("DELETE FROM email_rate_limits"); $p->exec("DELETE FROM verification_codes"); $p->exec("DELETE FROM url_rules"); $p->exec("DELETE FROM users");'

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

# /settings reachable with verified session
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" "$BASE/settings")
[ "$status" = "200" ] || fail "settings should be 200 after verified login (got $status)"

# settings page renders users and rules sections
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
echo "$body" | grep -q 'Settings Dashboard' || fail "settings dashboard not rendered"
echo "$body" | grep -q 'Protected URL Rules' || fail "rules section missing"

# settings POST without csrf rejected
status=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJAR" -c "$CJAR" \
  --data "username=x&password=x&email=x@x.com" "$BASE/settings/users/add")
[ "$status" = "403" ] || fail "settings POST without csrf should be 403 (got $status)"

# add user -> listed, then delete user -> gone
CSRF=$(get_csrf "$BASE/settings")
TU="inttest_$RANDOM"
curl -s -D /tmp/hdr3 -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&username=$TU&password=inttestpass123&email=$TU@example.com" "$BASE/settings/users/add"
loc=$(grep -i '^location:' /tmp/hdr3 | tr -d '\r' | cut -d' ' -f2 || true)
[ "$loc" = "/settings" ] || fail "add user should redirect to /settings (got $loc)"
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
grep -q "$TU" <<< "$body" || fail "added user not listed"
TU_ID=$(php8.2 -r "require 'config.php'; require 'lib/db.php'; \$s=db()->prepare('SELECT id FROM users WHERE username = ?'); \$s->execute(['$TU']); echo (string) \$s->fetchColumn();")
[ -n "$TU_ID" ] || fail "added user not in db"

# add rule (assigned to $TU) -> listed, then delete rule -> gone
RULE_D="/inttest-dummy-$RANDOM"
RULE_R="/inttest-real-$RANDOM"
CSRF=$(get_csrf "$BASE/settings")
curl -s -D /tmp/hdr5 -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&dummy_path=$RULE_D&real_path=$RULE_R&user_id=$TU_ID" "$BASE/settings/rules/add"
loc=$(grep -i '^location:' /tmp/hdr5 | tr -d '\r' | cut -d' ' -f2 || true)
[ "$loc" = "/settings" ] || fail "add rule should redirect to /settings (got $loc)"
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
grep -q "$RULE_D" <<< "$body" || fail "added rule not listed"
RULE_ID=$(php8.2 -r "require 'config.php'; require 'lib/db.php'; \$s=db()->prepare('SELECT id FROM url_rules WHERE dummy_path = ?'); \$s->execute(['$RULE_D']); echo (string) \$s->fetchColumn();")
[ -n "$RULE_ID" ] || fail "added rule not in db"
CSRF=$(get_csrf "$BASE/settings")
curl -s -D /tmp/hdr6 -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&rule_id=$RULE_ID" "$BASE/settings/rules/delete"
loc=$(grep -i '^location:' /tmp/hdr6 | tr -d '\r' | cut -d' ' -f2 || true)
[ "$loc" = "/settings" ] || fail "delete rule should redirect to /settings (got $loc)"
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
if grep -q "$RULE_D" <<< "$body"; then fail "deleted rule still listed"; fi

# reserved path rejected (no self-lockout)
CSRF=$(get_csrf "$BASE/settings")
curl -s -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&dummy_path=/settings&real_path=/x&user_id=$TU_ID" "$BASE/settings/rules/add"
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
grep -q 'must not collide with app routes' <<< "$body" || fail "reserved path not rejected"

# delete user -> gone
CSRF=$(get_csrf "$BASE/settings")
curl -s -D /tmp/hdr4 -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&user_id=$TU_ID" "$BASE/settings/users/delete"
loc=$(grep -i '^location:' /tmp/hdr4 | tr -d '\r' | cut -d' ' -f2 || true)
[ "$loc" = "/settings" ] || fail "delete user should redirect to /settings (got $loc)"
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
if grep -q "$TU" <<< "$body"; then fail "deleted user still listed"; fi

# password change: wrong current password rejected
CSRF=$(get_csrf "$BASE/settings")
curl -s -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&current_password=wrongpass&new_password=whatever123" "$BASE/settings/password"
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
grep -q 'Current password is incorrect.' <<< "$body" || fail "wrong current password not flagged"
# short new password rejected
CSRF=$(get_csrf "$BASE/settings")
curl -s -o /dev/null -b "$CJAR" -c "$CJAR" \
  --data "csrf=$CSRF&current_password=pass_admin_security7777&new_password=short" "$BASE/settings/password"
body=$(curl -s -b "$CJAR" -c "$CJAR" "$BASE/settings")
grep -q 'New password must be at least 10 characters.' <<< "$body" || fail "short new password not flagged"

echo "ALL INTEGRATION TESTS PASSED"

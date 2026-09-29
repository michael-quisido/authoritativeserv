# Plan: Fix Production Issues + Add Reverse Proxy for Cross-Domain URL Gating

## Date: 2026-08-23

## Issues to Fix
1. Broken image on landing page (DONE in commit `07124ba` — switched from `next/image` to `<img>`)
2. Email sending not working in production (needs `MAIL_MODE=smtp` in `.env`)
3. URL gating cannot protect paths on different backends/ports (needs reverse proxy feature)

---

## Task 1: Reverse Proxy for Cross-Domain URL Gating

### Problem
The admin app at `authoritativeserv.my-main-domain-name.com` (port 3006) can only protect paths served by the same Next.js instance. If the real content lives on a different backend (e.g., port 3002), the gate check can't protect it.

### Solution
Add a reverse proxy feature: after the gate check passes, the Next.js app proxies the request to a configurable target backend and returns the response.

### Files to Change

#### 1. `lib/config.ts` — Add proxy target config
Add a `gateProxyTarget` field:
```ts
gateProxyTarget: process.env.GATE_PROXY_TARGET ?? "",
```
- Empty string = no proxy (current behavior, same-app protection)
- Set to e.g. `http://127.0.0.1:3002` = proxy after gate check passes

#### 2. `.env.example` — Document new env var
Add:
```
# Reverse proxy target for gated real paths (empty = no proxy, same-app only)
GATE_PROXY_TARGET=
```

#### 3. `proxy.ts` — Add reverse proxy logic after gate check
When `gateValid()` passes and `gateProxyTarget` is configured:
- Forward the original request to the target backend (preserving method, headers, body)
- Return the target's response to the visitor (preserving status, headers, body)
- This happens transparently — the visitor never knows they're accessing port 3002

### Proxy Flow
```
Visitor → HAProxy → Next.js (port 3006)
  1. IP check (existing)
  2. Gate rule check (existing)
  3. Gate session check (existing)
  4. If gate valid AND GATE_PROXY_TARGET is set:
     → Proxy request to target backend (e.g., 127.0.0.1:3002)
     → Return target's response to visitor
  5. If gate valid AND GATE_PROXY_TARGET is empty:
     → Serve from Next.js app (current behavior)
  6. If gate invalid → 403 (existing)
```

---

## Task 2: HAProxy ACLs (User's Responsibility)

### What to Add (AFTER existing ACLs, BEFORE default_backend)
```acl
# URL Gate Security - protected paths on main domain
acl host_main_domain hdr(host) -i my-main-domain-name.com
acl path_protected_real path_beg /real-path
acl path_protected_dummy path_beg /dummy-path

use_backend url_gate_security_backend if host_main_domain path_protected_real
use_backend url_gate_security_backend if host_main_domain path_protected_dummy
```

### How to Apply Safely
```bash
# 1. Edit config
sudo nano /etc/haproxy/haproxy.cfg

# 2. Add the ACLs after your existing rules (before default_backend)

# 3. Test syntax
sudo haproxy -c -f /etc/haproxy/haproxy.cfg

# 4. Only reload if test passes
sudo systemctl reload haproxy
```

### Why This Is Safe
- ACLs are purely additive — no existing lines are modified or removed
- New rules only match specific host + path combinations
- Existing routing for all other hosts/paths is unaffected
- Syntax check prevents applying broken configs
- Rollback: remove the new lines and reload

---

## Task 3: Production .env Configuration

### Image Issue
- Already fixed (commit `07124ba` — plain `<img>`)
- Just pull and rebuild

### Email Issue
Set in production `.env`:
```
MAIL_MODE=smtp
MAIL_SMTP_HOST=smtp.gmail.com
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=your-gmail@gmail.com
MAIL_SMTP_PASS=your-app-password
MAIL_FROM=no-reply@kmcq-gmbh.com
```

### New Proxy Config
Set in production `.env`:
```
GATE_PROXY_TARGET=http://127.0.0.1:3002
```
(Adjust port to match your real content backend)

---

## Implementation Order
1. `lib/config.ts` — add `gateProxyTarget`
2. `.env.example` — document new env var
3. `proxy.ts` — add reverse proxy logic
4. `npx tsc --noEmit && npm run lint` — verify
5. Commit and push
6. User: update HAProxy config + production `.env` + rebuild

## Verification
- Unit: no existing tests should break (proxy feature is new)
- Manual: test with a real path on the target backend
- HAProxy: `haproxy -c` syntax check before reload

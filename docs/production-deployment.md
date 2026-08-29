# KMCQ GmbH Gate Security Check Point — Production Deployment Guide

This guide documents how KMCQ GmbH Gate Security Check Point is deployed in
production today (KMCQ GmbH), and how you can replicate it. It covers process
management, HTTPS fronting with HAProxy, integrating a CDN, and the phpMyAdmin
reverse-proxy pattern used with `GATE_PROXY_TARGET`.

---

## Architecture at a glance

```
Browser
   │  https://kmcq-gmbh.com
   ▼
Cloudflare (CDN, terminates TLS edge, forwards client IP)
   │
   ▼
HAProxy (port 443 front-end `https-in`)
   │  path_beg /php_my_admin_secured  → Gate Security Check Point :3006
   │  path_beg /phpmyadmin            → Gate Security Check Point :3006
   │  everything else                 → default backend
   ▼
KMCQ GmbH Gate Security Check Point (Next.js, `npm start`, port 3006)
   │  proxy gate check + nonce CSP
   │  GATE_PROXY_TARGET=http://127.0.0.1:3003
   ▼
phpMyAdmin (PHP built-in server, port 3003, same host)
```

The key idea: all traffic lands on the Gate Security Check Point first,
the gate is enforced at the proxy layer, and only *gated* requests are forwarded
to the phpMyAdmin backend on port 3003.

---

## 1. Build and run the app

```bash
npm install
npm run migrate           # once, creates the sessions table
npm run build             # optimized production build
npm start                 # listens on the port in PORT, default 3000
```

To listen on a specific port:

```bash
PORT=3006 npm start
```

### Process supervision

Run `npm start` under a supervisor so it restarts on crash and boots with the
server. On CyberPanel with systemd, a minimal unit file:

```ini
# /etc/systemd/system/authoritativeserv.service
[Unit]
Description=authoritativeserv (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/hosts/kmcq-gmbh.com/authoritativeserv
EnvironmentFile=/var/www/hosts/kmcq-gmbh.com/authoritativeserv/.env.local
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now authoritativeserv
systemctl status authoritativeserv
journalctl -u authoritativeserv -f    # follow logs
```

> **Note on port 3000:** Cloudflare/HAProxy are the only things that should
> listen on 80/443 publicly. The Node app should bind to localhost (127.0.0.1)
> and be reached only via the reverse proxy.

---

## 2. Required environment for production

`.env.local` (chmod 600):

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_NAME=kmcq_url_sec_gate_db
DB_USER=kmcq_url_sec_gate_user
DB_PASS=<strong-password>

CODE_KEY=<long-random-hex-secret>     # rotate from the dev default
SESSION_SECURE=1                       # HTTPS is in front

MAIL_MODE=smtp
MAIL_SMTP_HOST=smtp.gmail.com
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=<smtp-user>
MAIL_SMTP_PASS=<smtp-app-password>
MAIL_FROM=no-reply@kmcq-gmbh.com

ALLOWED_IPS=58.69.171.44,192.168.2.220
GATE_PROXY_TARGET=http://127.0.0.1:3003
```

Details:

- **`SESSION_SECURE=1`** — required for HTTPS; the session cookie becomes
  `Secure`.
- **`MAIL_MODE=smtp`** — real email delivery (Gmail requires an app password).
- **`ALLOWED_IPS`** — restrict the whole service to known client IPs
  (enforced only in production). Loopback is always allowed, so the local
  reverse proxy still works.
- **`GATE_PROXY_TARGET`** — the backend that gated real paths proxy to.

---

## 3. HAProxy reverse proxy (CyberPanel)

The production front-end is HAProxy with an HTTPS `https-in` front-end and
`option forwardfor` (so the proxy middleware can read the real client IP).

Sample relevant ACLs/backends:

```haproxy
frontend https-in
    bind *:443 ssl crt /etc/haproxy/certs/kmcq-gmbh.pem
    option forwardfor

    # Route gated paths to the Gate Security Check Point
    acl host_kmcq        hdr(host) -i kmcq-gmbh.com
    acl is_gate          path_beg /php_my_admin_secured
    acl is_real          path_beg /phpmyadmin

    use_backend url_gate_security_backend if host_kmcq and is_gate
    use_backend url_gate_security_backend if host_kmcq and is_real

backend url_gate_security_backend
    server app 127.0.0.1:3006 check
```

Critically, **`path_beg /phpmyadmin` must route to the Gate Security Check Point
(3006) for ALL sub-paths** (CSS, JS, images), not just the top-level page. If your web
server or CDN serves static-looking files from disk or a different backend
first, asset requests will never reach the gate. See Troubleshooting.

---

## 4. Cloudflare (CDN / DNS)

The public hostname resolves via Cloudflare, which gives:

- TLS edge certificates,
- DDoS protection,
- a `CF-Connecting-IP` header the app's IP check understands,
- caching. To avoid stale 404s on proxied asset paths, keep proxied responses
  uncached — the app already sends `Cache-Control: no-store, no-cache,
  must-revalidate` on proxied responses.

### IP detection order

The proxy resolves the client IP in this order:
`x-forwarded-for` → `x-real-ip` → `cf-connecting-ip` → `true-client-ip`.
With HAProxy `option forwardfor` and Cloudflare in front, set `ALLOWED_IPS` to
**your real client IPs**, not Cloudflare's edge IPs.

---

## 5. Cross-domain reverse proxy to phpMyAdmin

The production setup gates phpMyAdmin:

| Setting | Value |
|---|---|
| Dummy path | `/php_my_admin_secured` |
| Real path | `/phpmyadmin/` |
| Assigned user | the account whose email receives codes |
| `GATE_PROXY_TARGET` | `http://127.0.0.1:3003` |

phpMyAdmin runs locally on port 3003 (e.g. `php -S 127.0.0.1:3003` from its
directory). How the flow works:

1. Visitor goes to `https://kmcq-gmbh.com/php_my_admin_secured/` → gate page.
2. After email verification, they're redirected to
   `https://kmcq-gmbh.com/phpmyadmin/`.
3. The proxy sees a real-path match, validates the server-side gate, then
   proxies to `http://127.0.0.1:3003/`, stripping the `/phpmyadmin` prefix.
4. Sub-resources (`/phpmyadmin/themes/...`, `/phpmyadmin/js/...`) hit the same
   proxy (prefix-matched), pass the gate, and are forwarded with the prefix
   stripped.
5. Upstream `Location` headers and `Set-Cookie` `path=` values that reference
   `/phpmyadmin` are rewritten back to the gate prefix so redirects and cookies
   stay inside the proxied namespace.

### Same-host, cross-rule caveat

A "gated URL" set is currently **path-scoped, not host-scoped**. If you want a
second domain (e.g. `jhona-quisido.com`) to expose the *same*
`/php_my_admin_secured` + `/phpmyadmin` paths with a *different* assigned user,
the paths must differ because rules are looked up by path. Options:

- **Different paths** (no code change): e.g. `/jhona_securitado` →
  `/jhona_phpmyadmin/` for the second domain, assigned to its own user.
- **Host-scoped rules** (code change): add a host column to `url_rules` and
  match on the `Host` header in the proxy + route resolution.

---

## 6. Post-deploy verification checklist

```bash
# App is up
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3006/login        # 200

# Gate page reachable through the CDN
curl -s -o /dev/null -w '%{http_code}\n' https://kmcq-gmbh.com/php_my_admin_secured/

# Real path is gated (no cookie) -> 403, not 200, not 404
curl -s -o /dev/null -w '%{http_code}\n' https://kmcq-gmbh.com/phpmyadmin/

# A proxied asset sub-path is also gated (no cookie) -> 403
curl -s -o /dev/null -w '%{http_code}\n' \
  https://kmcq-gmbh.com/phpmyadmin/themes/pmahomme/css/theme.css

# Code verification flow (browser) ends on /phpmyadmin/ with assets loading
```

If the top-level gate URL returns **403 for an anonymous visitor**, that's the
expected gated behavior (403 = "protected"). If it returns **404**, the request
never reached the gate proxy (see below).

---

## 7. Troubleshooting production issues

### Assets (CSS/JS/images) return 404 as `text/html`

The proxy found no rule → the Next.js catch-all rendered a 404 page. Causes:

1. **Stale build.** After pulling new code, you must
   `git pull && npm run build && restart`; otherwise the fix (e.g. prefix
   matching for `/phpmyadmin/themes/...`) isn't deployed. Verify by checking
   the served 404 page matches your current `app/not-found.tsx`.
2. **CDN caching.** Cloudflare may cache the first 404. Purge the cache for
   `/phpmyadmin/*` (the app now sends `Cache-Control: no-store` on proxied
   responses).
3. **Front server routing.** If OpenLiteSpeed/CyberPanel or the CDN serves
   files with `.css`/`.js` extensions directly (from a disk path or another
   backend) before HAProxy, requests never reach port 3006. Confirm with:

   ```bash
   curl -s -I https://kmcq-gmbh.com/phpmyadmin/themes/pmahomme/css/theme.css
   ```
   and check the response `Server`/`x-powered-by` headers. You want them to
   come from the Next.js app (via HAProxy), not from LiteSpeed or Cloudflare
   cache.

### Everything returns 403 "IP not authorized"

`ALLOWED_IPS` is set and the resolved client IP isn't in the list. Confirm
`option forwardfor` is enabled and the IP shown to the proxy is the visitor's
real IP. Remember loopback (`127.0.0.1`, `::1`, empty) is always allowed.

### phpMyAdmin loads HTML but login form doesn't work

Check the `Set-Cookie` rewriting: phpMyAdmin sets `path=/phpmyadmin` cookies;
the proxy rewrites them to the public prefix. If the cookie path is wrong the
login state is lost on navigation.

### Codes arrive slowly or not at all

SMTP deliverability. Verify `MAIL_SMTP_HOST/PORT/USER/PASS` (Gmail needs an app
password) and watch the app logs for `Mail send failed`. In `log` mode codes go
to `storage/mail.log`.

---

Next: [Security & architecture reference](security-and-architecture.md)
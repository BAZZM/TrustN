# Content Security Policy and security headers

## Source of truth (what ships today)

CSP is **not identical** everywhere; configure holistically when tightening.

| Delivery | Config file | Effective CSP (summary) |
|----------|-------------|-------------------------|
| **Docker Compose** (`frontend` service) | **`frontend/nginx/default.conf`** mounted over `/etc/nginx/conf.d/default.conf` ([`docker-compose.yml`](../docker-compose.yml)) | **`script-src 'self' 'unsafe-eval'`**, **`style-src`** includes **`'unsafe-inline'`** + Google Fonts, **`connect-src 'self'`** (same-origin API via `/api/` proxy). |
| **Fly.io static app** | **`frontend/nginx/fly-static.conf`** | Same CSP / framing / XSS / Permissions-Policy pattern as Compose **`default.conf`**; **`connect-src`** also allows **`https:`** and **`wss:`** (SPA calls separate API host). |
| **Frontend image bake only** | **`frontend/nginx.conf`** copied in [`frontend/Dockerfile`](../frontend/Dockerfile) | Stricter document CSP (**`script-src 'self'`** only, no **`unsafe-eval`**, no style **`unsafe-inline`**). **Overridden** when Compose mounts **`default.conf`**. |
| **Node API** | **`backend/server.js`** (Helmet) | **`script-src`** includes **`'unsafe-eval'`** (historic justification: **`@spaceymonk/react-radial-menu`** — currently unused from routed UI; see below). **`style-src`** allows **`'unsafe-inline'`**. |

Before tightening **`unsafe-eval`**, read **[`docs/CSP_TIGHTENING_QUESTIONS.md`](CSP_TIGHTENING_QUESTIONS.md)** and align **`server.js`**, **`nginx/default.conf`**, **`nginx/fly-static.conf`**, and **`nginx.conf`** (if still used without compose override) in **one change**.

---

## Why `unsafe-eval` appeared

Comments in **`server.js`** and nginx cite **`@spaceymonk/react-radial-menu`**. That package is imported only from **`RadialContactActions.js`**, which is **not imported** by any page under **`App.js`**. Legacy radial docs live under **`docs/archive/`**.

Removing dead imports + that dependency is the prerequisite most teams want **before** dropping **`unsafe-eval`**.

---

## Backend (Helmet) snippet location

See **`backend/server.js`** → `helmet({ contentSecurityPolicy: { directives: { … }}})`. **`hsts`** is disabled so plain HTTP local URLs keep working.

---

## Frontend nginx snippets location

- **Compose runtime:** [`frontend/nginx/default.conf`](../frontend/nginx/default.conf) — CSP **`add_header`** block near top of `server`.
- **Fly:** [`frontend/nginx/fly-static.conf`](../frontend/nginx/fly-static.conf) — CSP aligns with Compose; **`connect-src`** additionally allows **`https:`** / **`wss:`** for the separate API origin.
- **Image-only baseline:** [`frontend/nginx.conf`](../frontend/nginx.conf) — CSP at **`http`** level.

Compose **`default.conf`** and **`fly-static.conf`** both set **`X-XSS-Protection`** and **`Permissions-Policy`** (as well as framing / nosniff / referrer).

---

## Verification

1. Open DevTools → **Network** → document (`/` or `/contacts`) → **Response Headers** → **`Content-Security-Policy`**.
2. Repeat against **`https://trustn-web.fly.dev/`** (or your Fly hostname) after deploy.
3. Hit **`/api/health`** and inspect API response CSP if you rely on Helmet for HTML/error bodies.

---

## Hardening roadmap

- Answer **[`CSP_TIGHTENING_QUESTIONS.md`](CSP_TIGHTENING_QUESTIONS.md)** (product + **`unsafe-inline`** strategy + env parity).
- Prefer **`unsafe-eval` removal** after dependency/code cleanup; treat **`style-src`** separately if Framer Motion still needs inline styles.

---

*Last updated: 2026-05-05*

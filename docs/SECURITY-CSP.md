# Content Security Policy and security headers

## Overview

The stack uses a **strict Content Security Policy (CSP)** so that:

- **script-src** allows only `'self'` (no `unsafe-eval`, no `unsafe-inline`). This prevents `eval()`, `new Function()`, and string-based `setTimeout`/`setInterval` from running, reducing risk of injected script execution.
- Inline script execution is not allowed; all scripts must be same-origin files (e.g. built JS from `/static/js/`).

## Where CSP and headers are set (reproducible at build)

| Layer   | File(s) | When applied |
|--------|---------|--------------|
| Frontend (web) | `frontend/nginx/default.conf`, `frontend/nginx.conf` | Nginx adds `Content-Security-Policy` and other headers on every response. Config is in repo and copied at Docker build. |
| Backend (API)  | `backend/server.js` (Helmet) | Helmet sets CSP and security headers on API responses. Applied at server start. |

No runtime secrets are required for the base CSP; it is fully defined in version-controlled config.

## Frontend CSP (nginx)

The directive is:

```
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob:;
connect-src 'self';
base-uri 'self';
form-action 'self';
frame-ancestors 'self'
```

- **script-src 'self'** – Only scripts from the same origin (e.g. `/static/js/main.*.js`) are allowed. No `unsafe-eval` or `unsafe-inline`.
- **style-src** – Same-origin styles plus Google Fonts CSS (used in `index.html`).
- **font-src** – Same-origin, `https://fonts.gstatic.com`, and `data:` for font data URIs.
- **connect-src 'self'** – API calls go to same origin (`/api/` proxied by nginx).

Other headers set in nginx: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`.

## Backend (Helmet)

Helmet is configured with a strict CSP (script-src `'self'` only, no `unsafe-eval`) and default security headers. HSTS is disabled by default so local HTTP works; enable it in production when serving over HTTPS.

## Reproducing at build

1. **Frontend:** Rebuild the image; nginx config is copied in the Dockerfile and (if used) overridden by the compose volume mount. CSP is whatever is in the committed nginx config.
2. **Backend:** Restart the API container; Helmet config is in `server.js`. Rebuilding the backend image picks up any change.

To verify CSP in the browser: open DevTools → Network → select the document request → Response Headers → `Content-Security-Policy`.

## If you must allow string evaluation (not recommended)

Allowing `unsafe-eval` weakens protection against script injection. If a dependency truly requires it:

- **Frontend (nginx):** Change `script-src 'self'` to `script-src 'self' 'unsafe-eval'` in `frontend/nginx/default.conf` and `frontend/nginx.conf`, then rebuild the frontend image.
- Prefer removing or replacing the dependency that needs `eval` over enabling `unsafe-eval`.

## Production (HTTPS)

When the app is served over HTTPS you can:

- Add `upgrade-insecure-requests` to the CSP in the nginx config.
- Enable HSTS in Helmet (e.g. set `hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }` in `server.js` or via env-driven config).

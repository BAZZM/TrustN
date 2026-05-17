# CSP tightening — questions before changing runtime headers

This repo historically allowed **`script-src 'unsafe-eval'`** on the API (Helmet) and static nginx configs because **`@spaceymonk/react-radial-menu`** relies on `eval`-style execution. **As of the archive audit (2026-05):** that package is only imported from **`RadialContactActions.js`**, and **nothing in the routed app imports `RadialContactActions`** — the legacy radial disk path is unused.

Framer Motion + CRA bundles generally run under **`script-src 'self'`** (no eval). **`style-src 'unsafe-inline'`** may still be needed for animation-driven inline styles (confirm per release build).

Use this list with product/security owners **before** flipping CSP in production.

---

## 1. Product / UX

1. **Will the legacy disk radial (`RadialContactWheel`, `DemiRadialNetwork`, context radial menu) ship again in the next release cycle?**  
   If yes, defer removing `unsafe-eval` until the UX ships without `eval`, or accept a feature-flagged separate bundle.

2. **Is it acceptable to delete dead frontend files** (`RadialContactActions.js`, optionally entire unused wheel stack) **in the same change set** as CSP tightening, so the dependency graph cannot regress accidentally?

---

## 2. Technical — `unsafe-eval`

3. After removing **`@spaceymonk/react-radial-menu`** (if approved), will you run a **verification pass** (production build + manual smoke + optional CSP evaluator / browser console violations) on:
   - `/connections` (trust graph),
   - `/contacts` (grid / list / dial radial),
   - `/login`, `/settings`?

4. **API responses include CSP via Helmet.** Should API CSP mirror static nginx exactly, or stay minimal because browsers rarely execute scripts from JSON/HTML error bodies? (Today both allow `unsafe-eval`; aligning strictness avoids confusion.)

---

## 3. Technical — `unsafe-inline` (styles)

5. **Are we targeting strict `style-src 'self'` only**, or is **`'unsafe-inline'` for styles** acceptable medium-term for Framer Motion / theme injections?

6. If strict styles are required: **nonce or hash pipeline** through nginx + CRA is non-trivial (often needs custom webpack/html plugins). Is engineering time allocated for that, or is **styles `unsafe-inline`** explicitly accepted risk?

---

## 4. Deployment parity

7. **Docker Compose** mounts **`frontend/nginx/default.conf`** over the image config ([`docker-compose.yml`](../docker-compose.yml)), so **runtime** CSP matches **`default.conf`**, not necessarily the **`frontend/nginx.conf`** baked into [`frontend/Dockerfile`](../frontend/Dockerfile). **Fly** uses **`frontend/nginx/fly-static.conf`**. Who signs off the exact directive strings per environment?

8. Should **`upgrade-insecure-requests`** / **HSTS** be enabled only on Fly (HTTPS-only) and kept off local HTTP compose?

---

## Replacement summary (if legacy radial stays retired)

| Remove / avoid | Replace with |
|----------------|----------------|
| `@spaceymonk/react-radial-menu` | Existing **`DialContactScreen`** flows + plain buttons/menus (already used on Contacts). Trust graph stays **`ConnectionsGraph`**. |
| Ad hoc context menus | Native `<menu>` / dropdown / sheet patterns consistent with dial + graph (no `eval`). |

After answers above, implement CSP changes in **one coordinated PR**: `backend/server.js`, `frontend/nginx/default.conf`, `frontend/nginx/fly-static.conf`, **`frontend/nginx.conf`** if present, `docs/SECURITY-CSP.md`, plus dependency/code deletion if approved.

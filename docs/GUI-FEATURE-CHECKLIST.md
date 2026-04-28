# GUI & feature checklist (from questionnaire + extras)

## 1. Overall feel

| Item | Status | Notes |
|------|--------|-------|
| Dark, understated theme | Done | Login: dark steely gradient; main app: black background |
| First login: brushed, dark steely gradient (not tacky) | Done | `Login.css` + theme config `loginGradient` |
| Main app: completely black background | Done | `.circle-page`, `.app__main--black` |
| Contacts on semi-visible rotating carousel | Done | Circle page with Prev/Next and dots |
| Search bar invisible at top, auto-hides on scroll | Done | Circle page: sticky search, visibility toggled by scroll direction |
| Scaled version of phone experience on web | Done | Single-column layout, same nav; max-width on desktop |

## 2. Web vs phone

| Item | Status | Notes |
|------|--------|-------|
| Don’t overcomplicate; focus on carousel animation quality | Done | Carousel + stroke-path ring on Circle page |
| Dark, minimalistic, matrix-like font | Done | Share Tech Mono in theme config and Circle/Cards |
| Configurable themes for different instances | Done | `themes` table, `/api/themes`, Settings theme picker; DB has `instance_id` for multi-tenant |

## 3. Motion & animation

| Item | Status | Notes |
|------|--------|-------|
| Rich, decorative motion on rotating carousel | Done | Framer Motion on Circle; staggered/list animations |
| Focus on visualising who’s in the circle | Done | Circle page shows connections with ring + strength |
| Black background, unichrome, professional | Done | #000 background, monochrome accents |
| Self-drawing (stroke-path) animation | Done | SVG circle `strokeDasharray` / `strokeDashoffset` on contact ring |

## 4. Trust Network–specific

| Item | Status | Notes |
|------|--------|-------|
| Visualise connections | Done | Circle carousel + Connections list |
| Accept/decline connection requests (inner + secondary circle) | Done | `/api/connection-requests`, respond accept/decline; `circle_type` in DB and UI |
| Trust/connection strength shown via numbers | Done | Connections list and Circle card show numeric strength |
| Notifications: minimal, time-sensitive connection requests; configurable in profile | Done | `notifications_connection_requests` in profile; Settings toggle |
| Profile stored at DB; phone = username/primary key | Done | `users` keyed by phone; profile GET/PATCH with prefs |

## 5. Accessibility & preferences

| Item | Status | Notes |
|------|--------|-------|
| Large text as profile option | Done | Settings toggle; `data-large-text` on root; CSS in `index.css` |
| High contrast as profile option | Done | Settings toggle; `data-high-contrast`; CSS variables |
| Language/locale support | Done | `locale` on user, `locales` table (scalable); i18n `en.js` + `useTranslations` |
| No reduce motion (motion kept) | Done | Questionnaire asked to keep motion; no disabling of animations |

## 6. Extra features

| Item | Status | Notes |
|------|--------|-------|
| Database schema allows customisation and scalability | Done | `themes.config` JSONB; `instances` + `instance_id` on themes/users; `schema_version`; `locales` table |
| Docker: changes propagated to containers, clean rebuild | Done | `docker-compose.yml` with build, init scripts 01/02/03; `DOCKER.md` + rebuild scripts |

## Backend API (for checklist)

- `GET/POST /api/auth/identify` – identify by phone  
- `GET/PATCH /api/profile` – profile and prefs (large_text, high_contrast, locale, notifications_connection_requests, theme_id)  
- `GET /api/connections` – list with strength and circle_type  
- `GET /api/connection-requests`, `POST /api/connection-requests/:id/respond` – list and accept/decline  
- `GET /api/themes` – list themes (configurable per instance)  
- `GET /api/health`, `GET /health` – health for containers/load balancers  

## Database (customisation & scalability)

- **schema_version** – track applied migrations  
- **themes** – `config` JSONB, optional `instance_id`  
- **instances** – optional multi-tenant (e.g. different white-labels)  
- **users** – `theme_id`, `large_text`, `high_contrast`, `locale`, `notifications_connection_requests`, optional `instance_id`  
- **connections** – `strength` (integer), `circle_type` (inner/secondary)  
- **access_requests** – `circle_type`, accept/decline flow  
- **locales** – table for scalable i18n  

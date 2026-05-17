# Frontend Documentation

## Architecture

### Component Structure

```
frontend/src/
├── components/
│   └── connections/
│       ├── ConnectionsGraph.js    # Trust graph (inner ring + branch secondaries, immersive mobile)
│       ├── graphLayout.js          # Layout math shared by web / native
│       └── UnifiedSecondarySearchBar.js
├── pages/
│   ├── Login.js                   # Phone-based login
│   ├── Contacts.js                # Contacts page (grid/list/radial views)
│   ├── Connections.js             # Connections page + unified secondary search
│   ├── Settings.js                # User preferences
│   └── Dashboard.js               # Main dashboard
├── context/
│   └── AppContext.js              # Global state (user, theme, token)
└── i18n/
    └── en.js                      # Translations
```

---

## Authentication Flow

1. **Login** (`Login.js`):
   - User enters phone number
   - POST `/api/auth/identify` with phone
   - Backend returns `{ user, token }`
   - Frontend stores both in localStorage
   - `setUser(user, token)` updates context

2. **API Requests** (`AppContext.js`):
   - Axios interceptor reads token from localStorage on every request
   - Adds `Authorization: Bearer <token>` header
   - Token persists across page refreshes

3. **Protected Routes**:
   - All routes except `/api/auth` and `/api/themes` require authentication
   - Backend middleware `requireAuth` validates JWT
   - Returns 401 if token missing/invalid

---

## View Modes (Contacts Page)

### Grid View
- Card-based layout
- Shows contact name, phone, matched status
- "Add to secondary circle" button for matched contacts

### List View
- Compact single-column list
- Same data as grid, different layout

### Radial View
- Rotating disk with two concentric rings:
  - **Inner ring**: Inner circle connections
  - **Outer ring**: Secondary circle connections
- **Prospective contacts**: Chips below wheel
- **Features**:
  - Drag/swipe to rotate
  - Click node to open detail panel
  - Search filters all rings
  - Hide/show toggles for each ring
  - Keyboard navigation (arrow keys)

---

## Connections page — Trust graph (`ConnectionsGraph.js`)

Narrow viewports use an **immersive** graph (full stage + pinch/pan + bottom sheet). Desktop uses the same SVG inside a static stage.

- **Inner ring**: Inner-circle peers (`circle_type === inner`), limited to `MAX_VISIBLE_INNER` on the ring; overflow appears in the sheet list.
- **Focused branch**: Tap an inner peer to load candidates via `GET /api/connections/secondary-search` with `focused_inner_peer_id` and **`branch_only=1`** (relationship discovery through **that** inner only). The search box still sends **`q`** on top of that set (same endpoint).
- **Reset**: Tap **outside** interactive nodes (backdrop / stage) to clear focus.
- **Implementation notes** (order matters):
  1. Secondary **node bodies**, then **quick-add “+”** chips, then **inner-ring nodes** (inners on top for hit-testing where arcs overlap).
  2. **“+N more”** pill is painted above the ring but uses **`pointer-events: none`** so it never eats clicks meant for an inner peer underneath.
  3. **Desktop (`tapSlop === 0`)**: nodes activate on **`pointerup`** (with **`click`** fallback for accessibility); a short-lived guard skips the duplicate **`click`** so secondary selection doesn’t double-toggle.
  4. **Immersive** inner selection uses **`pointerUp` + tap slop**. The stage **`click`** handler clears focus only when the event did **not** originate from an interactive graph node (`composedPath` / `closest`).
  5. Decorative SVG (full-viewbox backdrop rect, guide rings, edges, status labels) uses **`pointer-events: none`** so hits resolve to real controls.
  6. **Branch listing**: the API uses **`branch_only=1`** when an inner is focused so the arc reflects **that inner’s discovery paths**; the UI may still sort rows for stability.

---

## Form Accessibility

All form inputs include:
- `id` attribute (unique identifier)
- `name` attribute (for form submission)
- `aria-label` where appropriate

**Examples**:
- Login phone: `id="login-phone" name="phone"`
- Import textarea: `id="contacts-import-text" name="importText"`
- Search input: `id="contacts-radial-search" name="radialSearch"`

---

## Content Security Policy (CSP)

### Effective configs (which file wins)

- **Docker Compose:** [`docker-compose.yml`](../docker-compose.yml) mounts **`frontend/nginx/default.conf`** over the container’s site config — **that** CSP applies at **`http://localhost`** / **`8080`**, not the stricter baseline baked from **`frontend/nginx.conf`** inside [`frontend/Dockerfile`](../frontend/Dockerfile).
- **Fly.io:** **`frontend/nginx/fly-static.conf`**.

Compose/Fly currently include **`script-src 'unsafe-eval'`** (historic **`@spaceymonk/react-radial-menu`** dependency — unused by routed UI today) and **`style-src 'unsafe-inline'`** for animation/CSS convenience.

See **`docs/SECURITY-CSP.md`** (truth table) and **`docs/CSP_TIGHTENING_QUESTIONS.md`** before tightening runtime CSP.

### Example directives (Compose / Fly — illustrative)

**Mounted Compose site** (`frontend/nginx/default.conf`):

```nginx
script-src 'self' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```

---

## Error Handling

### API Errors

- **401 Unauthorized**: Token missing/invalid → redirect to login
- **403 Forbidden**: User ID mismatch → show error message
- **500 Server Error**: Log error, show generic message to user
- **Network Errors**: Show user-friendly error message

### Console Logging

- Development: Detailed error logs
- Production: Generic error messages (no sensitive data)

---

## Performance Optimizations

- **React.memo**: Applied to `RadialContactWheel` and `CircleRing` components
- **useMemo**: Used for filtered contact lists
- **Lazy Loading**: Consider code splitting for large components
- **Virtual Scrolling**: Not yet implemented (for 100+ contacts)

---

## Browser Compatibility

- **Modern browsers**: Chrome, Firefox, Safari, Edge (latest versions)
- **Mobile**: iOS Safari, Chrome Mobile
- **Touch Support**: Swipe gestures for radial wheel rotation
- **Keyboard**: Full keyboard navigation support

---

## Build & Deployment

### Development
```bash
cd frontend
npm start  # Runs on http://localhost:3000
```

### Production Build
```bash
npm run build  # Creates optimized build in `build/`
```

### Docker
- Frontend built as static files served by nginx
- Build happens in Dockerfile multi-stage build
- Final image: `nginx:1.25-alpine` with static files

---

## Known Issues & Future Improvements

### Current Issues
- CSP requires `unsafe-eval` for radial menu library
- Token stored in localStorage (XSS risk; consider httpOnly cookies)

### Future Improvements
- [ ] Replace radial menu library with eval-free alternative
- [ ] Implement token refresh mechanism
- [ ] Add virtual scrolling for large contact lists
- [ ] Add service worker for offline support
- [ ] Implement proper error boundaries
- [ ] Add loading skeletons for better UX

---

*Last updated: 2026-05-05*

# Frontend Documentation

## Architecture

### Component Structure

```
frontend/src/
├── components/
│   ├── RadialContactWheel.js      # Radial disk UI with two rings
│   ├── RadialContactWheel.css     # Styles for radial UI
│   ├── RadialContactDetail.js     # Expandable detail panel
│   └── RadialContactActions.js    # Nested radial menu (actions)
├── pages/
│   ├── Login.js                   # Phone-based login
│   ├── Contacts.js                # Contacts page (grid/list/radial views)
│   ├── Connections.js              # Connections list
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

### Current Configuration

**Backend** (`server.js`):
```javascript
scriptSrc: ["'self'", "'unsafe-eval'"]  // Required for radial menu
styleSrc: ["'self'", "'unsafe-inline'"] // Required for Framer Motion
```

**Frontend** (`nginx/default.conf`):
```nginx
script-src 'self' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```

### Why These Directives?

- **`unsafe-eval`**: Required by `@spaceymonk/react-radial-menu` library (uses `eval()` internally)
- **`unsafe-inline`**: Required by Framer Motion for inline styles in animations

### Security Considerations

- `unsafe-eval` is a security risk but required for current radial menu implementation
- Consider replacing radial menu library with eval-free alternative
- `unsafe-inline` is acceptable for CSS animations but could be improved with nonces

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

*Last updated: 2025-02-16*

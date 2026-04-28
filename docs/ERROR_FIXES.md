# Error Fixes & Security Documentation

This document details errors encountered and their fixes, plus security considerations.

---

## Errors Fixed

### 1. 401 Unauthorized Errors

**Problem**: API requests returning 401 even when user is logged in.

**Root Cause**: 
- Axios interceptor wasn't reliably reading token from localStorage
- Token might not be set before first API call

**Fix**:
- Updated `AppContext.js` axios interceptor to always check `localStorage.getItem("trust_network_token")` on every request
- Ensured interceptor runs on mount and reads latest token value
- Added proper header assignment: `config.headers = config.headers || {}; config.headers.Authorization = ...`

**Files Modified**:
- `frontend/src/context/AppContext.js`

---

### 2. 500 Internal Server Error (SQL Syntax Error)

**Problem**: `syntax error at or near "$1"` when setting `app.user_id` in RLS context.

**Root Cause**: 
- PostgreSQL `SET LOCAL` doesn't support parameterized queries (`$1`) in all versions/configurations
- Using `SET LOCAL app.user_id = $1` caused syntax error

**Fix**:
- Changed to direct string interpolation: `SET LOCAL app.user_id = '${userIdInt}'`
- Safe because `userIdInt` is validated as integer before use
- Also fixed `statement_timeout` to use string format: `'3000ms'`

**Files Modified**:
- `backend/db.js` - `withUserContext` function

**Rebuild required**: After changing `backend/db.js`, rebuild and restart the backend container so the fix is applied:
```bash
docker compose build backend --no-cache
docker compose up -d backend
```
Without this, the running container keeps the old code and the 500 error persists.

---

### 3. CSP Eval Violation

**Problem**: Content Security Policy blocking `eval()` usage.

**Root Cause**: 
- `@spaceymonk/react-radial-menu` library uses `eval()` internally (common in some React libraries)
- CSP `script-src 'self'` blocks eval by default

**Fix**:
- Added `'unsafe-eval'` to `script-src` in both:
  - `backend/server.js` (Helmet CSP)
  - `frontend/nginx/default.conf` (nginx CSP header)

**Security Note**: 
- `unsafe-eval` is required for the radial menu library
- Documented as a known dependency requirement
- Consider replacing `@spaceymonk/react-radial-menu` with a library that doesn't use eval in the future

**Files Modified**:
- `backend/server.js`
- `frontend/nginx/default.conf`

---

### 4. Form Field Missing id/name Attributes

**Problem**: Accessibility warning - form fields should have `id` or `name` attributes.

**Fix**:
- Added `id` and `name` attributes to all form inputs:
  - Login phone input: `id="login-phone" name="phone"`
  - Contacts import textarea: `id="contacts-import-text" name="importText"`
  - Radial search input: `id="contacts-radial-search" name="radialSearch"`
- Added `aria-label` where appropriate

**Files Modified**:
- `frontend/src/pages/Login.js`
- `frontend/src/pages/Contacts.js`

---

## Security Considerations

### CSP Configuration

**Current CSP Directives**:
- `script-src: 'self' 'unsafe-eval'` - Allows eval (required for radial menu)
- `style-src: 'self' 'unsafe-inline'` - Allows inline styles (required for Framer Motion)
- All other directives remain strict

**Future Improvements**:
- [ ] Replace `@spaceymonk/react-radial-menu` with eval-free alternative
- [ ] Use nonce-based CSP for inline styles instead of `unsafe-inline`
- [ ] Consider removing `unsafe-eval` if radial menu is replaced

### Authentication Token Handling

- Token stored in `localStorage` (persists across sessions)
- Token sent via `Authorization: Bearer <token>` header
- Axios interceptor ensures token is included on every request
- Token validated server-side via JWT verification

**Security Notes**:
- Token expiration: 7 days (configurable via `JWT_EXPIRES_IN`)
- Token secret: Must be set via `JWT_SECRET` env var in production
- Consider implementing token refresh mechanism for production

### Database Security (RLS)

- Row Level Security enforced on `contacts` table
- `app.user_id` set per request via `withUserContext`
- User ID validated and converted to integer before use
- RLS policies prevent cross-user data access

---

## Testing Checklist

After fixes, verify:

- [ ] Login works and token is stored
- [ ] API calls include `Authorization: Bearer <token>` header
- [ ] Contacts page loads without 401 errors
- [ ] Contacts data displays correctly (grid/list/radial views)
- [ ] No CSP violations in browser console
- [ ] No form field accessibility warnings
- [ ] Radial menu works without CSP errors

---

## Known Limitations

1. **CSP `unsafe-eval`**: Required for `@spaceymonk/react-radial-menu`. Consider replacing library in future.
2. **Token Storage**: Currently in localStorage (XSS risk). Consider httpOnly cookies for production.
3. **RLS**: Only enforced on `contacts` table. Consider extending to `users`, `connections`, `access_requests`.

---

*Last updated: 2025-02-16*

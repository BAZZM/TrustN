# Trust Network – Testing Guide (Web & Phone)

Use this guide to verify the application after the security hardening release. The same web app is used on **desktop** and **phone** (mobile browser); there is no separate native phone app.

---

## Prerequisites

- **Build status**: All services built and running.
- **URLs** (when using Docker as set up):
  - **Web app (desktop or phone)**: `http://localhost` (or your host IP if testing from another device).
  - **API (direct)**: `http://localhost:3000` (backend only; frontend proxies `/api/` to this).
- **From a phone on the same network**: Use `http://<your-PC-IP>` (e.g. `http://192.168.1.100`). Ensure port 80 is reachable and the frontend container is bound to `0.0.0.0:80`.

---

## 1. Quick health check

| Where | What to do | Expected |
|--------|------------|----------|
| Browser (desktop or phone) | Open `http://localhost/health` | Plain "ok" and HTTP 200 |
| Browser | Open `http://localhost/api/health` | JSON: `{"status":"ok","timestamp":"..."}` |
| No auth | Open `http://localhost/api/contacts` (e.g. in a new tab) | 401 and message like "Authentication required" |

If these pass, the stack and auth gate are working.

---

## 2. Web frontend – desktop

### 2.1 Login (identify)

1. Open `http://localhost` in a browser.
2. You should see the **login** screen (phone number only).
3. Enter a **seed user phone** in E.164 or international form, for example:
   - `+1234567890` (John Doe)
   - `+0987654321` (Jane Smith)
   - `1234567890` or `01234567890` (libphonenumber will normalize if valid).
4. Click **Continue**.

**Expected:**

- You are taken into the app (dashboard or main layout).
- **Sign out** is visible in the header; clicking it returns you to login.
- If you enter an **invalid** or **unknown** number, you get an error (e.g. "Invalid phone number" or "User not found").

**Security:** Login response includes a **token**; the frontend stores it and sends it on all API calls. No `user_id` is sent in query or body for protected endpoints.

### 2.2 Profile & settings

1. While logged in, open **Settings** (or profile).
2. Change a preference (e.g. **Large text** or **High contrast**).
3. Save.

**Expected:** The preference is saved and reflected (e.g. theme or accessibility). No 403 and no need to send `user_id` (backend uses the token).

### 2.3 Contacts

1. Go to **Contacts**.
2. **View modes**: Use **Grid**, **List**, or **Radial** to switch layout. **Radial** shows a rotating disk (inner + secondary circle); drag to rotate, click a node for details, use search and toggles to filter.
3. **List**: Your contacts load (may be empty or seeded for the user).
4. **Import**:
   - In the import area, enter lines like:  
     `+15551234567, Alice`  
     `+15559876543, Bob`
   - Click **Import**.

**Expected:**

- List updates with the new contacts.
- Invalid or non-E.164 numbers are skipped (and counted as "skipped" in the response).
- If you import more than the allowed limit in one request (e.g. 500), you get a clear error.
- **Pagination**: Use `limit` and `offset` if the UI or API supports it (e.g. `?limit=20&offset=0`). Max page size is 100.

4. **Matched vs not matched**: Contacts that match a **user** by phone show as "matched" with optional **Add to secondary circle**. Non-matched contacts still appear (LEFT JOIN behaviour).

5. **Export (GDPR)**: If the UI exposes it, or via API (see below), export returns your contacts as JSON.

6. **Delete (GDPR)**: If the UI exposes delete, or via API (see below), deleting a contact removes it only for you.

### 2.4 Connections

1. Go to **Connections**.
2. Your connections (inner/secondary) load.
3. **Connection requests**: If you have pending requests (as target or intermediary), they appear. You can **accept**, **decline**, or (for secondary) **approve as intermediary** / **approve as target**.

**Expected:** All data is for the logged-in user only; no `user_id` in the requests.

### 2.5 Sign out

1. Click **Sign out** in the header.

**Expected:**

- You are returned to the login screen.
- Token and user are cleared; calling `/api/contacts` or other protected endpoints without logging in again returns 401.

---

## 3. Web frontend – phone (mobile browser)

Use the **same** web app on your phone:

1. On the same Wi‑Fi as the host, open `http://<host-IP>` in the mobile browser (e.g. `http://192.168.1.100`).
2. Run the **same** flows as in section 2:
   - **Login** with a seed phone number (E.164 or national format).
   - **Settings**, **Contacts** (list, import), **Connections**, **Sign out**.

**Expected:**

- Layout adapts to the small screen if the app is responsive.
- Login, token storage, and API behaviour are the same as on desktop (auth is per browser/session).
- On import, invalid numbers are still skipped; rate limiting applies per user/session.

**Tip:** To find the host IP: on the machine running Docker, run `ipconfig` (Windows) or `ifconfig` / `ip addr` (Linux/macOS) and use the LAN address.

---

## 4. API-only checks (optional)

Use these to confirm auth and GDPR endpoints without the UI. You can use a REST client (Postman, Insomnia) or `curl` (from Git Bash or WSL on Windows).

### 4.1 Get a token

```http
POST http://localhost/api/auth/identify
Content-Type: application/json

{"phone": "+1234567890"}
```

**Expected:** 200 and body like `{"user":{...},"token":"eyJ..."}`. Copy `token`.

### 4.2 Protected endpoint with token

```http
GET http://localhost/api/contacts
Authorization: Bearer <paste-token>
```

**Expected:** 200 and `{"contacts":[...],"limit":...,"offset":...}`.

### 4.3 Protected endpoint without token

```http
GET http://localhost/api/contacts
```

**Expected:** 401 and `{"error":"Authentication required"}`.

### 4.4 GDPR export

```http
GET http://localhost/api/contacts/export
Authorization: Bearer <paste-token>
```

**Expected:** 200 and JSON with `exported_at` and `contacts` array.

### 4.5 GDPR delete

```http
DELETE http://localhost/api/contacts/<contact-id>
Authorization: Bearer <paste-token>
```

**Expected:** 200 and `{"ok":true,"deleted":"<contact-id>"}` if the contact belongs to the user; 404 otherwise.

### 4.6 Pagination

```http
GET http://localhost/api/contacts?limit=10&offset=0
Authorization: Bearer <paste-token>
```

**Expected:** 200 and at most 10 contacts; `limit` and `offset` in the response.

---

## 5. Summary checklist

- [ ] Health: `/health` and `/api/health` return 200.
- [ ] Unauthenticated `/api/contacts` returns 401.
- [ ] Login with seed phone returns user + token; invalid/unknown phone returns error.
- [ ] After login, Contacts, Connections, Settings work without sending `user_id`.
- [ ] Contact import accepts E.164; invalid rows skipped; bulk import works.
- [ ] Sign out clears session; protected endpoints then return 401.
- [ ] Same flows pass on mobile browser at `http://<host-IP>`.
- [ ] (Optional) GDPR export and delete work with a valid token.

If any step fails, check the browser console and network tab (and backend logs in Docker) for errors.

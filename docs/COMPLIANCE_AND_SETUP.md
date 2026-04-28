# Compliance Rules and Setup Guide

This document states which security and compliance rules are currently adhered to in the Trust Network application and what still needs to be set up (e.g. for production or full compliance).

---

## Compliance Rules Adhered To

1. **Authenticate requests**  
   - `user_id` is no longer taken from query or body for protected endpoints.  
   - The backend uses `req.user.id` from JWT auth middleware.  
   - Mismatched `user_id` in request is rejected (403).  
   - **Acceptance**: Users cannot read or write other users' data via the API.

2. **PostgreSQL Row Level Security (RLS)**  
   - RLS is enabled on the `contacts` table.  
   - Policy: `contacts_isolation` (and insert/update/delete policies) using `current_setting('app.user_id')::integer`.  
   - The app sets `app.user_id` per request via `withUserContext(userId, fn)` when querying contacts.  
   - **Acceptance**: Cross-user reads of contacts return 0 rows when using the app connection with RLS (use `app_writer` role in production for RLS to apply; table owner bypasses RLS).

3. **Phone PII**  
   - Plaintext `phone` is still stored for E.164-normalized value.  
   - Optional columns `phone_encrypted` / `phone_hash` are documented in migration 004 for future use.  
   - **Still to do**: Implement encryption and hash storage, and switch lookups to hash (see “Still needs setup” below).

4. **E.164 normalization**  
   - Phone numbers are normalized to E.164 using `libphonenumber-js`.  
   - Invalid numbers are rejected at the API (auth identify and contacts import).  
   - **Acceptance**: Duplicates prevented across formats; consistent storage.

5. **Database constraints**  
   - `UNIQUE(user_id, phone)` on contacts.  
   - `contacts_phone_length` CHECK (length >= 8).  
   - **Acceptance**: Invalid/duplicate entries rejected at DB layer where applied.

6. **Bulk upsert for import**  
   - Contact import uses bulk upsert via `UNNEST` and `ON CONFLICT (user_id, phone) DO UPDATE`, in batches (e.g. 200).  
   - **Acceptance**: Large imports are significantly faster than per-row inserts.

7. **Indexes**  
   - `idx_users_phone`, `idx_contacts_user_id`, `idx_contacts_phone`, `idx_contacts_user_phone`, `idx_connections_user1`, `idx_connections_user2`, `idx_connections_circle_type`, etc.  
   - **Acceptance**: Queries are indexed for common access patterns.

8. **Connections schema**  
   - Current schema remains bidirectional (`user1_id`, `user2_id`) with existing indexes.  
   - **Still to do**: Optional migration to graph-friendly `(user_id, connected_user_id, circle_type)` for simpler queries (see below).

9. **Pagination**  
   - Contacts list endpoint supports `limit` and `offset` with a maximum page size (e.g. 100).  
   - **Acceptance**: Stable performance with large contact lists.

10. **Least-privilege DB roles**  
    - Migration 004 creates `app_reader`, `app_writer`, and `migrations_role` and grants minimal privileges.  
    - **Still to do**: Run the app in production as `app_writer` (not the migration/owner user) so that RLS and least privilege are effective.

11. **ID enumeration**  
    - Current PKs are integer (SERIAL).  
    - **Still to do**: Migrate to UUID PKs (`gen_random_uuid()`) for non-enumeration where required (see below).

12. **Query/connection safety**  
    - Prepared statements (parameterized queries) are used.  
    - `statement_timeout` is set per request (e.g. 3s) in `withUserContext` and in import.  
    - Pool size and timeouts are configured in `db.js`.  
    - **Acceptance**: Long queries terminate; pool is bounded.

13. **Rate limiting on /import**  
    - Per-user rate limiting is applied on `POST /api/contacts/import` (e.g. window and max requests per window).  
    - Max contacts per request is enforced (e.g. 500).  
    - **Acceptance**: Abusive usage is throttled.

14. **LEFT JOIN for contacts list**  
    - Contacts list uses LEFT JOIN to users so non-registered contacts are returned with optional user enrichment.  
    - **Acceptance**: Unmatched contacts still returned.

15. **Hash indexes**  
    - When `phone_hash` is introduced, index `(user_id, phone_hash)` should be added (documented in migration 004).  
    - **Still to do**: Add columns and indexes when implementing encrypted/hash storage.

16. **Audit and error handling**  
    - Import skips and invalid rows are logged (count); rate-limit events can be logged by the rate-limiter.  
    - Internal errors are not sent to the client; generic “Server error” is returned.  
    - **Acceptance**: Operational visibility without leaking sensitive data.

17. **Input validation and size limits**  
    - Contacts import validates array shape, max contacts per request, and max payload size.  
    - **Acceptance**: Malformed/oversized requests rejected.

18. **Statement-level timeouts**  
    - Import and contacts list use `statement_timeout` (e.g. 3s) via `withUserContext` or explicit SET.  
    - **Acceptance**: Runaway queries auto-cancel.

19. **GDPR hygiene**  
    - Contacts export: `GET /api/contacts/export` returns the authenticated user’s contacts.  
    - Contacts delete: `DELETE /api/contacts/:id` deletes a contact that belongs to the user.  
    - Retention policy is documented in this file (see below).  
    - **Acceptance**: Export and delete supported for contacts; retention policy to be finalized.

20. **Scale checklist**  
    - RLS, E.164, bulk upserts, indexes, timeouts, pagination, rate limiting, and input validation are in place.  
    - UUID PKs, full phone encryption/hash, and least-privilege app role in production remain to be completed (see below).

---

## Still Needs Setup

- **Phone PII (encryption + hash)**  
  - Add and use `phone_encrypted` and `phone_hash`; stop storing plaintext phone (or restrict to legacy only).  
  - Use an env-based encryption key and SHA-256 for hash; index `(user_id, phone_hash)`.

- **Production DB role**  
  - Run the application as `app_writer` (not the schema owner) so RLS and least-privilege grants apply.  
  - Ensure `app.user_id` is set on every request that touches user data (already done for contacts via `withUserContext`).

- **UUID primary keys**  
  - Plan a migration to UUID PKs for users (and FKs) to prevent ID enumeration.  
  - Use `DEFAULT gen_random_uuid()` for new rows.

- **Connections schema (graph)**  
  - Optional: migrate to `(user_id, connected_user_id, circle_type)` with one row per directed pair and update all code that reads/writes connections.

- **Retention policy**  
  - Define and document how long user data (contacts, logs, etc.) is retained and how deletion is performed (e.g. account deletion flow).

- **Key management**  
  - Document and implement secure key management for JWT and (when added) phone encryption (rotation, env, secrets manager).

- **Full RLS coverage**  
  - Extend RLS to `users`, `connections`, and `access_requests` with appropriate policies and ensure the app sets `app.user_id` for all relevant requests.

---

## Retention Policy (Summary)

- **Contacts**: Stored until the user deletes them or exports and requests account/data deletion.  
- **User profile**: Retained while the account exists; deletion on account deletion.  
- **Connection and request data**: Same as above; define exact retention periods in your legal/privacy policy.

Implement automated retention (e.g. periodic purge) according to your policy and document it in your privacy notice.

---

*Last updated: 2025. Review and update when adding features or moving to production.*

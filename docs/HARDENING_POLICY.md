# Security Hardening Policy

This document defines hardening policies and a checklist for future improvements to the Trust Network application.

## 1. Authentication & Authorization

- **Authenticate requests**: Never trust `user_id` from query or body. Use `req.user.id` from auth middleware (JWT/session). Reject requests where client-supplied `user_id` does not match the authenticated user.
- **Acceptance**: Users cannot read or write other users' data.

## 2. Database: Row Level Security (RLS)

- Enable PostgreSQL RLS on all user-owned tables (e.g. `contacts`, and consider `connections`, `access_requests`).
- Policies MUST use `current_setting('app.user_id')` (or equivalent) so that cross-user access returns no rows.
- Application MUST set `app.user_id` at the start of each request (e.g. `SET LOCAL app.user_id = '<auth-id>'`) when using a connection for that request.
- **Acceptance**: Cross-user reads return 0 rows even via direct SQL when RLS is enforced and app uses a non-owner role.

## 3. Phone PII Protection

- Do not store raw phone numbers in plaintext in production.
- Store: `phone_encrypted` (BYTEA) and `phone_hash` (BYTEA, SHA-256). Use hash for lookups; decrypt only when needed for display.
- Index: `(user_id, phone_hash)` for efficient lookups.
- **Acceptance**: Raw numbers unreadable in DB; lookup works via hash.

## 4. Phone Normalization (E.164)

- Normalize all phone numbers to E.164 using a library such as libphonenumber.
- Reject invalid numbers at the API layer.
- **Acceptance**: Duplicates prevented across formats; consistent storage.

## 5. Database Constraints

- `UNIQUE(user_id, phone)` or `UNIQUE(user_id, phone_hash)` to prevent duplicate entries.
- `phone` (or equivalent) NOT NULL; `CHECK(length(phone) >= 8)` (or equivalent for hash) where applicable.
- **Acceptance**: Invalid or duplicate entries rejected at the DB layer.

## 6. Bulk Operations

- Replace per-row import loops with bulk upsert (e.g. `UNNEST` + `ON CONFLICT`). Batch size 100–500.
- **Acceptance**: Large imports are >10x faster.

## 7. Indexes

- Maintain indexes for: `users(phone)`, `contacts(user_id, phone)` or `contacts(user_id, phone_hash)`, `connections(user1_id)`, `connections(user2_id)`, `connections(circle_type)` (and graph-optimized schema if applicable).
- **Acceptance**: Queries stay low latency at scale.

## 8. Connections Schema (Graph)

- Prefer a graph-friendly schema: e.g. `(user_id, connected_user_id, circle_type)` with `PRIMARY KEY (user_id, connected_user_id)`.
- Avoid bidirectional storage or complex OR joins where a single directed row per perspective simplifies queries.
- **Acceptance**: Simpler SQL and measurable speedup.

## 9. Pagination

- All list endpoints that can grow (e.g. contacts) MUST support `limit` and `cursor` or `offset`.
- Enforce a maximum page size (e.g. 100).
- **Acceptance**: Stable performance with 10k+ contacts.

## 10. Least-Privilege DB Roles

- Use dedicated roles: `app_reader`, `app_writer`, `migrations_role`.
- Application role must NOT be a superuser. Grant only required operations.
- **Acceptance**: Permissions limited to required ops.

## 11. ID Enumeration Prevention

- Use UUID primary keys with `DEFAULT gen_random_uuid()` for user-facing or sensitive IDs where feasible.
- **Acceptance**: IDs are non-sequential and unguessable.

## 12. Query & Connection Safety

- Use prepared statements (parameterized queries).
- Set `statement_timeout` (e.g. 3s) per request or per connection.
- Configure pool size and connection timeouts to avoid exhaustion.
- **Acceptance**: Long queries terminate; DB not exhausted.

## 13. Rate Limiting

- Apply rate limiting on sensitive endpoints (e.g. `/import`): per-user and per–time-window, plus max items per request.
- **Acceptance**: Abusive usage is throttled.

## 14. Contacts List Semantics

- Keep LEFT JOIN so that non-registered contacts are still returned with optional user enrichment.
- **Acceptance**: Unmatched contacts remain visible with optional matched user data.

## 15. Hash Indexes

- If using phone hash for matching, index `phone_hash` and `(user_id, phone_hash)` so hash-based lookups use indexes.
- **Acceptance**: Hash joins/lookups use indexes.

## 16. Audit & Error Handling

- Log import counts, failures, and rate-limit events for operational visibility.
- Do not leak internal errors or stack traces to clients; return generic messages.
- **Acceptance**: Operational visibility without sensitive data exposure.

## 17. Input Validation & Size Limits

- Validate request shape (e.g. contacts array structure).
- Enforce maximum payload size and maximum array length.
- **Acceptance**: Malformed or oversized requests rejected.

## 18. Statement-Level Timeouts

- Use statement-level timeouts for import and other long-running or batch operations.
- **Acceptance**: Runaway queries auto-cancel.

## 19. GDPR Hygiene

- Document retention policy for user data.
- Support user data export (e.g. contacts export) and deletion (e.g. delete contact, account deletion).
- **Acceptance**: User data export and deletion supported.

## 20. Scale Checklist

Before scaling to large data or traffic, ensure:

- [ ] RLS enforced on user-owned tables
- [ ] E.164 normalization in place
- [ ] Bulk upserts for imports
- [ ] Proper indexes (including hash if applicable)
- [ ] UUID PKs where required for non-enumeration
- [ ] Encrypted/hashed PII for phone data
- [ ] Least-privilege DB roles in use
- [ ] Graph-friendly connections schema (if applicable)
- [ ] Pagination on list endpoints
- [ ] Rate limiting on sensitive endpoints

---

*Last updated: 2025. Apply these policies in code reviews and before production deployment.*

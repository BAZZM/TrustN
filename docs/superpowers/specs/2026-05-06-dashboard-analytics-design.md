# Dashboard — analytics, KPIs, comparisons & navigation (refined spec)

**Status:** Refined stakeholder resolutions + defaults where ambiguity existed  
**Last updated:** 2026-05-06  

Use this document as the single **requirements-ready** summary before implementation planning (`writing-plans`).

---

## A. Original answers → refined resolutions

| # | Your answer (verbatim-ish) | Refined resolution (what we implement against) |
|---|---------------------------|------------------------------------------------|
| **1** | Server-side | **Only** trusted backends emit analytics signals (`analytics_events` / rollups). Browsers never POST raw analytics payloads for KPI integrity (future optional telemetry would still validate server-side). |
| **2** | Event grain | **Fine-grained events**: append-only rows in **`analytics_events`** (`event_type`, small JSON payload, `occurred_at`, optional hashed refs). **`activity_log`** may duplicate **subset** of high-value rows later for audit UX—not required for v1 KPIs. |
| **3** | Opaque counts / hashed IDs preferred | Event payloads store **counts**, **enums**, and **`sha256(salt + id)`** (or UUID surrogate keys) for relational refs—not raw phones/emails. **Rollups expose aggregates only** to dashboards; drill-down lists remain authorized relational APIs. |
| **4** | 1 year | **Retention = 365 days** on **`analytics_events`** (partition by month or periodic DELETE policy—implementation detail). **Rollup snapshots** may retain longer as anonymized aggregates only if product asks later. |
| **5** | Single-tenant; easy multi-tenant later | All ingest + rollup SQL accepts **`instance_id`** (nullable today). Single-tenant runs with `NULL` or constant `1`; multi-tenant enables filtering without rewriting controllers. |
| **6** | Periodic batch every 5 minutes | **Rollup job cadence: ≤ 5 minutes.** Dashboard APIs read **precomputed** rollup rows (not heavy joins per request). UI shows **“Updated within the last few minutes”** unless live-count exception below is adopted later. |
| **7** | Current user + admin; move API connectivity card | **`GET /api/me/dashboard`** (auth user) and **`GET /api/admin/system-health`** (admin gate). Relocate **API connectivity / dependency smoke** from generic home to **admin** surface first; user home focuses on **trust-network KPIs**. |
| **8** | Didn’t understand; develop properly | See **§ B — Pipeline** (diagram + layers). **Proper development** = typed contracts (OpenAPI or shared TS types later), tests on rollup math, idempotent job, explicit failure logging—not ad hoc SQL in routes. |
| **9** | Inner / secondary / acquired; codebase says “edge” | **User-facing KPI names:** Inner count · Secondary count · **Acquired inner** count. **Code mapping:** inner(`circle_type='inner'`), secondary(`circle_type='secondary'`), acquired inner(`introduced_via_request_id IS NOT NULL` ⇔ API `peer_introduced`). **`sources` contains `'edge'`** in graph/search means “stored intro-backed pathway” for **discovery rows**, not the KPI label—avoid using “edge” in dashboard copy. |
| **10** | Comparisons immediately | Each headline KPI returns **`{ current, previous, delta_abs, delta_pct }`** for **same-length windows** (default **7d vs prior 7d** until you override—see § C). |
| **11** | Contextual | Quick actions **appear when predicates fire** (e.g. pending inbox &gt; 0 → “Review introductions”). No duplicate permanent clutter when counts are zero. |
| **12** | Tray navigation; transparent; Capacitor; design later | **Implementation deferred** until design assets. **Architecture constraints:** touch-first, no hover-only affordances, safe-area aware, optional backdrop blur (watch CSP). |

---

## B. Pipeline (answers “what we’re building” for #8)

```text
Server actions (connections, intros, profile, …)
        │  emit normalized facts (sync or async queue)
        ▼
analytics_events  (append-only, 1y retention, hashed refs)
        │
        │  every ≤5 min
        ▼
Rollup job (idempotent, advisory lock, instance_id-aware)
        │
        ▼
dashboard_rollups_user / dashboard_rollups_admin  (or equivalent tables)
        │
        ▼
GET /api/me/dashboard          GET /api/admin/system-health (+ metrics TBD)
```

**Rules**

- **Dashboard reads never scan raw events** for KPI cards (only rollups).
- **Drill-down** (future) uses existing **`/api/connections`**, **`/api/connection-requests`**, etc.—not analytics UUID soup.

---

## C. Defaults proposed where you did not specify

You can accept these or reply with overrides:

| Topic | Default |
|-------|---------|
| Comparison window | **Last 7 calendar days vs previous 7 days** (aligned to UTC midnight unless product picks user TZ later). |
| Pending intros on home | **Contextual strip + badge**, not a fourth permanent KPI card for v1 (reduces clutter; still powered by rollups). |
| Batch runner | **In-process `setInterval` + Postgres advisory lock** in API container for v1 (simplest on Fly single machine); migrate to **dedicated machine/cron** if job exceeds SLA. |
| Event types v1 (minimum) | `intro_completed`, `connection_created`, `profile_updated` (+ optional `dashboard_viewed` only if needed for DAU—confirm privacy appetite). |
| Search logging | **Counts only** for unified search (no query text in analytics store). |

---

## D. Tray navigation — questions when you share design (optional checklist)

1. **Peek vs expanded height** (px or % of viewport / safe area).
2. **Conflict with `/connections` gestures:** tray handle vs graph pan/zoom priority.
3. **Tray contents:** global routes only vs **same contextual engine** as dashboard actions.

---

## E. Phase order (unchanged)

1. **C** — Events + rollup tables + job + APIs (me + admin skeleton).  
2. **B** — KPI cards + comparisons + staleness copy.  
3. **B.1** — First chart from rollup series (e.g. intros sparkline).  
4. **A** — Contextual actions wired to rollup predicates.  
5. **Nav tray** — after design drop.

---

## F. Self-review

- Ambiguity **#2** closed: fine-grained `analytics_events`.  
- **Edge** vs **acquired inner** disambiguated for copy + engineering.  
- Open items reduced to **§ C defaults**—reply only if you want different windows, runner, or event list.

---

**Next step:** Confirm **§ C defaults** (or edits), then run **`writing-plans`** for migrations, routes, job wiring, and Dashboard/Migration parity checks per **`AGENTS.md`**.

# GUI production-grade initiatives (everything except Connections)

**Date:** 2026-11-02 · **Branch:** `intro` · **Status:** proposal, nothing below is built yet except §2 (quick wins)
**Scope:** Home (`/`), Contacts (`/contacts` + `components/dial/*`), Activity, Settings, Admin, Login, and the shell
(`Layout`, `App.css`, `index.css`). Connections (`pages/Connections.*`, `components/connections/*`) is out of scope
and is treated as the reference for quality.

Visual companion (before/after mockups, token and type sheet, IA diagram, impact/effort map, AI concepts):
https://claude.ai/artifact/8UEYbJCyW3sXdSC2jZXbwu (private until shared from its Share menu).

---

## 1. Audit summary

Walked as the demo user at 375, 768 and 1280 px with real clicks, typing and keyboard. Full list with widths and
severities: the session's shared notes (`gui-audit-2026-11-02.md`). The patterns that matter for planning:

| Theme | Evidence |
|---|---|
| **No shared primitives** | 7 button styles (`contacts__btn`, `contact-card__btn`, `settings-profile-form__btn`, `login__btn`, `admin__retry`, `dial-detail__btn`, `dashboard__quick-link`); 4 error-banner styles; success/error `rgba()` literals repeated in 6 CSS files; page titles at 1.5rem (Contacts) vs 1.75rem (Home, Settings). |
| **Shell built for phones only** | At 1280 px the app is an 860 px column with a 6-item phone tab bar; the nav covered the bottom ~50 px of every page ≥768 px (fixed in §2). Unicode glyphs as icons (Settings = ▷). |
| **Two places for one mental model** | Contacts "Radial" and Connections both show Inner / Secondary / discoverable people with different interactions. Activity's every "View" link goes to `/connections` without a target. |
| **Home has no narrative** | KPI cards repeat the same three sentences; "Needs your attention" listed *outgoing* requests; "Next steps" said "Keep testing the core loops". |
| **Feedback is missing or misplaced** | Settings success message rendered off-screen; tapping a person in the dial opened its detail ~1,700 px below; expired sessions showed a raw "Invalid or expired token" on every page (all fixed in §2). No toasts, no skeletons, no optimistic updates. |
| **Preferences that don't do anything** | Large text and High contrast saved but never applied (fixed in §2). Theme choice has no visible effect inside the app (only the login gradient reads it). |
| **APIs the UI never uses** | `DELETE /api/contacts/:id`, `GET /api/contacts/export`, `POST /api/connection-requests/:id/respond` outside Connections, `GET /api/connections/inner-circle/:id/profile`. |
| **Accessibility** | No `:focus-visible` style outside Connections; unnamed switches; framer-motion ignored `prefers-reduced-motion`; "Add to secondary circle" modal has no dialog semantics, Escape or focus management. |

## 2. Quick wins shipped in this pass (uncommitted on `intro`)

All verified in the browser pane with real input; `CI=true npm test` (11 suites / 106 tests, 4 new) and
`CI=true npm run build` pass.

| Fix | Files |
|---|---|
| Content no longer hidden behind the fixed nav at ≥768 px (`--nav-clearance` token). | `index.css`, `App.css` |
| New page opens at the top instead of the previous page's scroll offset. | `Layout.js` |
| Buttons and inputs use the brand font; one keyboard focus ring for every control. | `index.css` |
| framer-motion honours `prefers-reduced-motion` (`MotionConfig reducedMotion="user"`). | `App.js` |
| Large text and High contrast now apply app-wide (`usePreferenceAttributes`, root font scale). | `hooks/usePreferenceAttributes.js` (+test), `index.css` |
| Expired session → signed out with "Your session expired" on Login; signing in returns to the same page. | `context/sessionExpiry.js` (+test), `AppContext.js`, `Login.js` |
| Login: empty submit explains itself; errors are `role="alert"`; visible focus on the phone field. | `Login.js`, `Login.css` |
| Settings: switches are real `role="switch"` controls named by their label; save feedback is a toast above the nav that clears itself; current theme shows ✓; empty name can't be saved; strings moved to i18n. | `components/ToggleRow.js` (+test), `Settings.js/.css` |
| Toggle "off" track now visible (3:1 non-text contrast token). | `index.css`, `Settings.css` |
| Activity: newest item first (the snapshot was always appended last); "—" instead of fake zeros while loading. | `pages/activityEvents.js` (+test), `Activity.js` |
| Admin: a non-admin sees a calm "not available on this account" card instead of an error with a useless Retry. | `Admin.js` |
| Home: "Needs your attention" only when something needs you ("In progress" otherwise); KPIs in one row on wide screens with the comparison window stated once; product copy for Next steps; no black seam. | `Dashboard.js/.css`, `App.css` |
| Contacts: dial detail is a sticky sheet above the nav, next to the chip you tapped; chips and view switcher expose pressed state; no "No contacts yet" flash while loading; grid badge no longer stretches; name not repeated in card meta. | `Contacts.js/.css`, `dial/DialContactScreen.js/.css` |

Side effect to know about: the global `font-family: inherit` also moves Connections' HUD buttons (Ask, Search,
Details) from the UA font to Outfit. Checked visually at 1024 px; layout unchanged.

### Left as findings (not quick wins)

- `Contacts.js` (453 lines) and `DialContactScreen.js` (342) are over the 300-line refactor cue; the modal and
  search fixes below need an extraction first (plan in §4.5).
- Server-side validation of an empty profile name (`routes/profile.js`) – backend contract change, needs `npm test`
  on Postgres 5433.
- Hide Admin from non-admins – the client has no admin flag; needs `is_admin` on the identify/profile payload.

---

## 3. Principles for every initiative

1. **One job per screen, summary before detail** (visual hierarchy, progressive disclosure). Each page answers one
   question first: *Home*: what needs me today? *Network*: who can I reach and through whom? *Inbox*: what is waiting
   on whom?
2. **Gestalt over decoration.** Group by proximity and a shared surface, not a border on everything. Cards only for
   things you can act on as a unit.
3. **Perceived performance.** Skeletons shaped like the content, optimistic updates for respond/request, no
   blocking route exit animations.
4. **Motion with purpose.** Motion explains a change of place (sheet up, item moves to "done"); nothing animates
   just because it mounted. 3 durations, 2 easings, all off under reduced motion.
5. **WCAG 2.2 AA as the floor**, including 2.4.11 Focus Not Obscured (fixed bars!), 2.5.8 Target Size (24 px),
   3.3.7 Redundant Entry (import flow), and 1.4.11 Non-text Contrast.
6. **Trust is the product.** Every AI suggestion shows *why* (the path and the shared attributes) and never acts
   without the user; phone numbers never leave the server.

## 4. Initiatives (priority order)

Impact and effort are 1–5. Effort assumes one engineer familiar with the codebase.

### 4.1 Foundations: tokens v2 + component primitives — Impact 5 · Effort 3

**Problem.** Seven button styles, four banner styles, literals for semantic colours, no type scale, unicode icons
(§1). Every later initiative would otherwise add an eighth.

**Direction.**
- Token layers in `index.css`: *primitives* (`--gold-400`, `--ink-900`…) → *semantic* (`--surface-1/2/3`,
  `--text-1/2/3`, `--accent`, `--success/-soft`, `--danger/-soft`, `--focus`) → *component* (only where a component
  needs a knob). Themes (`theme.config`) map onto the semantic layer at `:root`, which finally makes theme choice do
  something.
- Type scale (1.25 ratio, 16 px base): 12 / 14 / 16 / 20 / 25 / 31 px, two weights (500, 600), tabular numerals for
  counts. Page title = 25/31, section label = 12 uppercase +0.06em.
- Spacing stays 4/8/16/24/32; add 48 for page sections. Radius: 8 controls, 12 cards, 20 sheets, full for pills.
- Primitives in `components/ui/`: `Button` (primary / secondary / ghost / danger, sizes sm/md), `IconButton`,
  `Card`, `Field` (label + hint + error wired with `aria-describedby`), `Switch` (from `ToggleRow`), `Badge`,
  `Dialog` / `Sheet` (built on the existing `useModalOverlay`), `Toast` + `useToast`, `EmptyState`, `Skeleton`,
  `PageHeader`. Inline SVG icon set (16/20/24) replacing glyphs.
- A living reference page at `/dev/ui` (dev builds only) instead of Storybook, to avoid a new dependency.

**Risks.** Churn across every page; mitigate by landing primitives first, then migrating page by page behind no
flag (pure visual). Connections keeps its own HUD styles until a later pass.
**Dependencies.** None. Everything else depends on this.

### 4.2 App shell and information architecture — Impact 5 · Effort 3

**Problem.** Phone tab bar on desktop; 6 destinations at 375 px; Contacts and Connections overlap; Admin visible to
everyone; Activity links nowhere specific.

**Direction.**
- Four primary destinations: **Home**, **Network** (graph = today's Connections, list = today's Contacts, as two
  views of one page), **Inbox** (today's Activity, made actionable), **You** (profile + settings). Admin moves under
  You and only renders when the API says `is_admin`.
- ≥1024 px: left rail (icons + labels, 240 px) and a content area up to 1120 px with an optional right panel for
  detail (person, request). <1024 px: bottom bar with 4 items + safe-area.
- Deep links: `/network/person/:id`, `/inbox/:requestId`, so Inbox items open the exact request.
- Global "Ask" (⌘K / search icon) available everywhere, backed by `POST /api/connections/ask`.

**Risks.** Merging Contacts into Network moves users' muscle memory; keep `/contacts` and `/connections` as
redirects. Route changes touch `App.js` (auth gate stays there).
**Dependencies.** 4.1 (rail, icons). Backend: `is_admin` field (small), no other API change.

### 4.3 Home: a "Today" narrative — Impact 5 · Effort 2

**Problem.** Three identical KPI slabs and dev copy; nothing to act on from Home.

**Direction (top to bottom).**
1. **Needs you** – incoming requests with inline *Vouch* / *Accept* / *Decline* (`POST /connection-requests/:id/respond`), optimistic, undo toast.
2. **Next best introduction** (AI, §4.9a) – one card: person, path, why, *Ask Bob to introduce you*.
3. **Moving** – outgoing requests as a stage tracker (sent → vouched → accepted) with days waiting.
4. **Your network** – one compact row: inner, secondary, acquired, each with a 7-day delta and a sparkline
   (the rollup already has 7-day windows; add 8 weekly points to `/api/me/dashboard`).
5. **Get started** checklist only until it's done (§4.8).

**Risks.** Sparklines need a small API addition. **Dependencies.** 4.1; 4.9a for the AI card (ship the slot with a
deterministic ranking first).

### 4.4 Inbox (Activity made actionable) — Impact 4 · Effort 2

**Direction.** Group by day; each row shows who, the path, status chip (Waiting on Bob · 5 d / Accepted /
Declined), and the one action available to *you*. Filters: Needs you / Waiting on others / Done. Deep link per
request. Empty state explains how intros work.
**Dependencies.** 4.1, 4.2 deep links. API: none (data is already in `GET /api/connection-requests?scope=all`).

### 4.5 Network list (Contacts redesign) — Impact 4 · Effort 3

**Problem.** 55 contacts with no search in Grid/List, a "Radial" view that is chip lists, an inaccessible modal,
hidden delete/export.

**Direction.**
- One list with a search field and filter chips: *Inner · Secondary · On Intro · Not on Intro*; rows show avatar,
  name, role, relationship badge, and the one next action. Virtualised past 100 rows (the 200-secondary test user).
- Import becomes a 3-step sheet: paste or upload CSV → preview with parsed rows, duplicates and invalid numbers
  flagged (§4.9c) → confirm. Export and delete exposed in a row menu (APIs exist).
- "Choose who vouches" becomes a `Dialog` with real semantics and shows each intermediary's relationship strength.
- **Extraction first** (per the 300-line rule): `hooks/useContactsData.js` (fetch, import, request),
  `ContactsToolbar`, `ContactsList`, `ContactRow`, `ImportSheet`, `IntermediaryDialog`; `Contacts.js` < 150 lines.

**Risks.** Removing the dial view – confirm with the user first; keep it behind a view toggle for one release.
**Dependencies.** 4.1, 4.2.

### 4.6 Feedback and motion language — Impact 4 · Effort 2

**Direction.** Motion tokens: `--dur-1: 120ms` (hover/press), `--dur-2: 200ms` (small moves), `--dur-3: 320ms`
(sheets); `--ease-out` for entering, `--ease-in-out` for moving. Route transitions become a 120 ms cross-fade with
`mode="popLayout"` instead of `mode="wait"` (today every navigation waits for the exit fade). Toast region shared
by all pages. Skeletons for Home, Inbox, Network list. Optimistic respond/request with rollback toast.
**Dependencies.** 4.1.

### 4.7 Accessibility to WCAG 2.2 AA — Impact 4 · Effort 2 (ongoing)

**Direction.** Skip link; `scroll-padding-bottom: var(--nav-clearance)` so focused items never hide behind the
bar (2.4.11); 44 px targets on touch, ≥24 px everywhere (2.5.8); landmark and heading audit; live regions for
async results; contrast check of every text token pair (muted `#888` on `#181818` is ~5:1 – fine; placeholders at
40 % white are not). Add `jest-axe` (new dev dependency – needs approval) for primitives and pages.
**Dependencies.** 4.1 makes most of this automatic.

### 4.8 Onboarding and empty states — Impact 3 · Effort 1

**Direction.** First-run checklist on Home: complete profile → import contacts → mark 3 inner-circle people → first
introduction request; each step links to the exact control. Every list has an `EmptyState` with one sentence and one
action. Registration asks only for name; role/industry later, with a reason ("helps people find you for intros").
**Dependencies.** 4.1, 4.3.

### 4.9 AI where it fits a trust network — Impact 4 · Effort 3–4

Grounded in data and code that exist today. Start deterministic, add an LLM only for language, keep a human in the
loop, never send phone numbers to a model, and show the reasoning every time.

a. **Next best introduction (Home).** Candidates: secondaries reachable through the user's inner circle
   (`secondary-search` with `branch_only`, migrations 016/017). Score with the existing `lib/askRank.js` signals plus
   relationship strength (migration 011) and overlap with the user's `job_role` / `industry` / `experience`. Exclude
   anyone with a pending request. Card shows path (*You → Bob Brown → Leo Lee*) and the matched fields. New
   endpoint `GET /api/me/suggestions?limit=3` (thin route, logic in `lib/`). LLM optional for the one-line "why".
b. **Draft the intro message.** When requesting an intro, offer a draft note to the intermediary built from both
   profiles' role/industry/experience and the user's stated goal. Server-side call to Claude, user edits, nothing is
   sent automatically. Needs a `message` column on connection requests (migration) and `verify:migrations`.
c. **Smart contact de-duplication.** On import preview, cluster rows by normalised phone (`lib/phone.js`) and fuzzy
   name; offer merge. Fully deterministic; no model needed.
d. **Ask everywhere.** The existing natural-language Ask (`lib/askInterpret.js`, `askRetrieve.js`, `askRank.js`)
   behind a global ⌘K, results open the person in Network.
e. **Nudges.** In Inbox: "Your request via Bob has waited 5 days – send a reminder?" From `created_at` and status;
   reminder is a user action.

**Risks.** Privacy and consent (opt-in setting, data minimisation, model never sees phone numbers), cost and rate
limits (reuse `rateLimitAsk`), explainability (always show path + fields). **Dependencies.** 4.3 for (a), 4.5 for
(c), backend tests on Postgres 5433 for (a) and (b).

### 4.10 Theming and brand — Impact 3 · Effort 2

**Direction.** `theme.config` maps to semantic tokens at `:root`; ship Dark (default), Light and High-contrast as
first-class themes; retire per-component theme reads (`RadialContactWheel` builds colours from `theme.config.accent`
with hex suffixes). Brand: a wordmark and a 24 px mark built on the inner/secondary rings, used for the favicon, empty
states and the login card. One display face for page titles only.
**Dependencies.** 4.1.

### 4.11 Performance — Impact 3 · Effort 2

**Direction.** `React.lazy` for Connections, Admin and the dial (rule 11 lists them); route cross-fade instead of
`mode="wait"`; a tiny cached data hook (stale-while-revalidate) so Home → Inbox → Home doesn't refetch and flash;
virtualise long lists; measure LCP and INP with `web-vitals` (already shipped by CRA) and set budgets
(main JS ≤ 150 kB gz – today 136 kB).
**Dependencies.** None; pairs well with 4.2.

## 5. Impact / effort map and sequencing

| # | Initiative | Impact | Effort | Phase |
|---|---|---|---|---|
| 4.1 | Foundations | 5 | 3 | 1 |
| 4.2 | Shell + IA | 5 | 3 | 1 |
| 4.3 | Home "Today" | 5 | 2 | 2 |
| 4.4 | Inbox | 4 | 2 | 2 |
| 4.6 | Feedback + motion | 4 | 2 | 2 |
| 4.7 | Accessibility | 4 | 2 | continuous |
| 4.5 | Network list | 4 | 3 | 3 |
| 4.9 | AI layer | 4 | 3–4 | 3–4 |
| 4.8 | Onboarding | 3 | 1 | 2 |
| 4.10 | Theming + brand | 3 | 2 | 3 |
| 4.11 | Performance | 3 | 2 | continuous |

**Phase 1 (foundations):** 4.1 then 4.2. **Phase 2 (daily loop):** 4.3, 4.4, 4.6, 4.8. **Phase 3:** 4.5, 4.10,
4.9c/4.9d. **Phase 4:** 4.9a/b/e once Home and Inbox exist to host them. 4.7 and 4.11 ride along with each phase.

## 6. Decisions needed before major development

1. Merge Contacts into a **Network** page with Connections (graph + list views)? Keeps `/contacts` as a redirect.
2. Retire the chip-based "Radial" dial view, or keep it as a third view for one release?
3. Approve dev dependencies `jest-axe` (and optionally `@testing-library/react`) for accessibility tests.
4. Backend additions: `is_admin` on the user payload, weekly series on `/api/me/dashboard`, `GET /api/me/suggestions`,
   a `message` column on connection requests.
5. AI: which features are opt-in, and is a server-side Claude call acceptable for intro drafts (profile fields only,
   never phone numbers)?

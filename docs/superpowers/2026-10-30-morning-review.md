# Morning review — overnight run (2026-10-30)

Everything below is **uncommitted** on branch `intro` (base commit `9eb86d4`). Nothing was committed, merged or pushed. `git status` and `git diff` show exactly this run: 16 modified files, 10 new files.

## What happened

1. **Reviewed last round's code** with `/code-review` at high effort: 10 findings, 9 fixed, 1 skipped.
2. **Performance:** graph nodes are memoized; a per-frame test proves a physics frame no longer re-renders the whole graph.
3. **Closed the gaps I had deferred:** rate-limit test, coarse-pointer touch targets, hook tests, the Ask hand-off logic.
4. **Ask now draws the path** (You → introducer → person) and the graph is calmer while a branch is open.
5. **Desktop:** stats and buttons share a row, so the graph is about 15% taller (406px → 467px at 1280×800).
6. **Docs** brought up to date, including `UI_CHANGE_GUIDANCE.md`, which `AGENTS.md` treats as canonical.

Details and the findings are in `plans/2026-10-30-round3-hardening-and-polish.md` (progress log).

## Verified

| Check | Result |
|-------|--------|
| Backend tests | 105 passed, 11 suites (throwaway Postgres, see below) |
| Frontend tests | 92 passed, 7 suites |
| `CI=true npm run build` | compiled, no warnings |
| `npm run verify:migrations` | ok (no migration added) |
| Browser, every page at 1280 and key flows at 375 | Home, Contacts, Activity, Settings, Connections load, no console errors, no horizontal scroll |

## Try it (the app is running)

- http://localhost:3000, log in with the demo phone `+1234567890` (no code needed locally).
- **Connections** on a phone-sized window or a desktop window: tap **Ask**, type `who is a content writer`, tap Kate King. The branch opens, she is selected, and the path lights up.
- Try `anyone in software` (finds engineers *and* people whose industry says Software) and `médecin à Zürich` (no longer mangled).
- The graph now floats and is draggable **by default** (this changed after the first morning check; see the follow-up below). `?layout=fixed` or the "Free layout" pill turns it off.
- Keyboard: arrow keys move between inner nodes, Enter opens a branch, Escape clears it; Tab inside a modal stays inside.

## Decisions waiting for you

1. **Commit / merge / push.** Suggested commits: (a) backend ask changes + tests, (b) frontend perf + highlight + desktop polish + tests, (c) docs. `main` and both remotes are untouched.
2. **Should bio text be searchable by people who cannot read it?** Search (existing `secondary-search` and the new Ask) matches the full profile, so asking about a word can reveal that someone's bio contains it (only the matching *field name* is returned, never the text). Changing that belongs in the SQL function and needs a migration.
3. **Per-word discovery queries in Ask.** They run one after another (100-350ms on demo data), capped at 5 words x 50 rows. An OR-capable SQL function would fix it properly but needs a migration, so I left it.
4. **Docker Desktop.** I launched it earlier and its engine never came up; close it if you do not need it.

## How the backend tests were run

Docker's daemon never started, and the local Windows Postgres role (`intro`) is not a superuser, so the project's migrations fail under row-level security there. I ran the suite against a **throwaway cluster in the scratch folder** (superuser, port 5433, trust auth) with the project's default test settings, then stopped it. To repeat, either start `docker compose up -d database` or initialise a temporary cluster:

```bash
"C:/Program Files/PostgreSQL/17/bin/initdb.exe" -D /tmp/pgtest -U intro --auth=trust -E UTF8
"C:/Program Files/PostgreSQL/17/bin/postgres.exe" -D /tmp/pgtest -p 5433 &
cd backend && npx jest --runInBand
```

## Not done / known limits

- The `/code-review` skill and `security-review` skill could not scan the whole branch (`origin/HEAD` is not set in this repo), so the second review was done by hand; no injection, authorization or secret-handling problems found. One memory-growth issue was found and fixed (unbounded regex cache).
- Free layout: reduced-motion behavior is covered by hook tests but I did not eyeball it in the browser; there is no before/after screenshot diff with the flag off.
- `.claude/launch.json` (dev server config I added) and `scripts/install-wsl-for-docker.ps1` are untracked; decide whether to keep them.

## Follow-up: "the Connections screen didn't move"

A first look at the screen found it static. Causes, all fixed in the working tree (uncommitted):

1. **Free layout was off by default**, behind a small pill, so a normal visit showed a still ring. It is now **on by default** (still switchable off).
2. **A real mouse drag never started.** The pointer was only captured after the drag threshold, on a handler that stops receiving events once the cursor leaves the node, so fast drags went to the SVG instead. My earlier check used synthetic events fired straight at the node, which skip hit-testing and hid this. The pointer is now captured on press; real fast drags of inner and secondary nodes were verified in the browser.
3. **No idle motion.** The "gentle drift" from the original suggestion had been left out. Nodes now float a few pixels out of phase with each other by CSS alone (the physics loop still sleeps, so idle JavaScript cost stays at zero).


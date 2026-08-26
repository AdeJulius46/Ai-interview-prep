# Build Progress

Tracks `README.md`'s phase table. Checked = that phase's gate command has been run for real
and passed, and the work is committed. Updated after every phase lands — this file is the
place to check status, not the chat scrollback.

- [x] **Phase 0** — Workspace, Docker Postgres, Prisma migrated, both apps boot — `gate:0` — commit `281ab85`
- [x] **Phase 1** — `packages/contracts` types + Zod schemas, both apps import them — `gate:1` — commit `31fb880`
- [x] **Phase 2** — Interview setup persisted, question bank seeded, per-session question selection varies — `gate:2` — commit `c798d5a`
- [x] **Phase 3** — Session token endpoint, Anam call mocked in tests, key never leaks — `gate:3` — commit `46ef714`, full chain re-confirmed green
- [x] **Phase 4** — `apps/web/app/ui` primitives with visual snapshot coverage — `gate:4` — commit `0ebc297`, restructured into `apps/web` in `23331c3`
- [x] **Phase 5** — Setup screen wired to phase 2 — `gate:5` — commit `c004596`
- [x] **Phase 6** — Live room streams avatar, timer enforces limit, teardown is clean — `gate:6` — commit `a03fd9d`
- [ ] **Phase 7** — Transcript captured, flushed to API, reconciled on complete — `gate:7` — in progress
- [ ] **Phase 8** — STAR feedback report generated and persisted — `gate:8`
- [ ] **Phase 9** — History and progress trend across sessions — `gate:9`
- [ ] **Phase 10** — Full Playwright happy path with a mocked SDK, a11y pass — `gate:10`

## Notes / deviations from spec so far

- Docker Postgres ports remapped: dev `5432→5442`, test `5433→5443` (conflicts with unrelated
  containers already running on this machine). Reflected in `docker-compose.yml` and both
  `apps/api/.env*.example` files.
- `msw` pinned to exact `2.6.6` in `apps/api` (later versions pull in an ESM-only transitive
  dependency that breaks the current CJS Jest transform).
- `packages/contracts` ships a dual ESM/CJS build (`dist/` + `dist-cjs/`) since pure ESM broke
  `apps/api`'s `ts-jest`.
- `packages/ui` was folded into `apps/web/app/ui` (commit `23331c3`) — the spec originally
  called for a separate workspace package mirroring `packages/contracts`, but only `apps/web`
  ever consumed it, so it's now colocated inside `app/` per Next.js's own convention
  (`app/ui/`, `app/lib/`). `README.md`, `frontend.md`, `shared.md`, and `testing.md` were
  updated to match.

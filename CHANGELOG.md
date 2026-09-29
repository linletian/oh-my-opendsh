# Changelog

## Unreleased

### Phase 3 (2026-09-21) — hook listener port (no version bump in this change; the next release heading is assigned at release time)

- feat(omo-hooks): new host-only plugin `patches/omo-dsh/omo-hooks/` (`@oh-my-opendsh/omo-hooks`)
  — OMO's behaviour-guardrail hooks ported onto DSH events as listeners, with `src/manifest.ts`
  as the single source of truth (14 ported entries, per-file upstream provenance, mode A–F) and
  boot markers (`[omo-hooks] loaded` summary + per-hook `registered` lines)
- feat(hooks): 14 semantic ports, each with unit tests + a mock-LLM e2e scenario:
  `bash-file-read-guard` (advisory via post-execute `additionalContexts`),
  `todo-continuation-enforcer` (turn-stopping `agent.steer()` continuation with a
  progress-resetting circuit breaker, cap 5), `empty-task-response-detector`,
  `session-notification` (scheduler + Linux `notify-send` CI-verifiable backend + macOS
  `osascript` L4-only; Windows out per D9), `background-notification` (deferred `ctx.jobs`
  acquisition via `ctx.inject`), `edit-error-recovery`, `json-error-recovery`,
  `tool-output-truncator` (adaptive budget computed from the token-meter wire view formula),
  `directory-readme-injector`, `agent-usage-reminder`, `task-resume-info`,
  `webfetch-redirect-guard` (B-mode `{kind:'deny', reason}` exemplar), `prometheus-md-only`,
  `ulw-execute` (start-work hook semantics; the `/ulw-execute` command face stays Phase 4)
- docs(hooks): 47 further hook modules carry documented skip/defer verdicts (DSH-native coverage
  incl. `dsh-fs-observation-policy` / `dsh-goal` / `dsh-compaction` / `dsh-agent-instructions`;
  Phase 4/5/6/7 ownership) — the coverage authority is `docs/plans/phase3-dev/phase3-hooks.md`
- test(gates): static gate c11–c14 (census 19→23), probe asserts all 14 registered markers, two
  new guardrail proofs (deny path + listener-throw fail-closed modes); attribution section in
  `THIRD_PARTY_NOTICES.md` (Phase 3 hook semantic ports, per-file)

### Phase 2 (2026-09-14) — 11-agent roster (no version bump in this change; the next release heading is assigned at release time)

- feat(roster): `src/roster.ts` — the 11-agent single source of truth (conductor `sisyphus` +
  10 delegation targets: class / write capability / `maxDepth` / default seat / `OMO_*` env
  pair), with the routes roster-derived (`resolveModelRoutes`, AC-5 `sisyphus`≠`explore` hard
  precheck kept, two non-blocking seat warnings added, `MODEL_ROUTE_ENV_VARS` grown to 11 pairs
  with the 4 pre-existing names unchanged)
- feat(persona): 9 semantic ports under `system-sections/` (`hephaestus`, `oracle`, `librarian`,
  `plan-consultant`, `plan-reviewer`, `atlas`, `multimodal-looker`, `sisyphus-junior`,
  `prometheus`) + the sisyphus prompt's new 3rd section (of 5) `delegation-roster.md`, each with an
  HTML-comment attribution header; per-file upstream disclosure added to `THIRD_PARTY_NOTICES.md`
- feat(composition): the concerto preset's delegation group grows to 12 rows, all sentinels
  (11 persona / 10 `agentOptions` / 8 `deny`) roster-rendered by `concerto-preset.ts`; per-class
  `toolFilter` and a uniform `maxDepth: 2` under the corrected *invoked-row* depth semantics
- feat(boot): roster-wide boot markers (10 `persona assembled` lines + an 11-route summary) plus
  three non-blocking warning lines — same-route, same-seat, and provider-not-registered (settled
  check: settings-driven adapters register after a plugin's `apply()`)
- test(gates): roster-composition unit suite + `roster.md` structural snapshot, `MOCKROLE`
  generalized to the roster with a `roster-parade` scenario, `plan-reviewer-write-denied` and
  `atlas-nested-delegation`, and roster-derived static/doctor-lite/probe/proof assertions
- e2e: 7 scenarios green (was 4); all 8 local gates green
- docs: Phase 2 planning set (plan / roster baseline / task list) under
  [`docs/plans/phase2-dev/`](./docs/plans/phase2-dev/); pitfalls P-22/P-23/P-24 registered
- ⚠️ **Roster completeness ≠ full OMO orchestration**: the `/ulw-*` command face is Phase 4 and
  Team Mode membership semantics are Phase 5 — neither is claimed here — and the installer
  channel still ships the frozen 1+1 preset (Phase 7 decides that channel)

## v0.2.1 (2026-09-10)

- docs: record the D7 pin's real scope, the v0.2.0 release defect, and refresh the status prose
- fix(docs): every live alias pointer must name the current alias (d08)
- fix(release): the release commit missed the Pages install wrapper

## v0.2.0 (2026-09-10)

- Merge pull request #2 from linletian/feature/dsh-omo-mvp
- docs: address the PR #2 round-2 review
- docs: address the PR #2 review — coordinates, citations, section placement
- fix(release): preserve the verification note across the in-place upgrade
- feat(release): the develop branch model — in-place row upgrade
- ci: validate every config-bearing row, and run the proofs as gate 8
- fix(harness): follow the 0.1.5-rc.1 session, proof and boot contracts
- fix(preset): follow dsh 0.1.5-rc.1 — persona key rename + upstream parity
- docs: retarget the project to dsh 0.1.5-rc.1
- docs(dsh): add the 0.1.5-rc.1 review and upgrade records
- docs: evidence files are per-device by design (never synced) — the freshness gate means each releasing device verifies locally
- docs: formalize docs/ vs .omo/ split — machine artifacts only in .omo/

## v0.1.1 (2026-09-04)

- chore: post-merge — stable line moves to main (release.sh default, Pages note, d06 changelog-heading parse fix)
- Merge pull request #1 from linletian/feature/dsh-omo-mvp
- fix(pr1-review): harden legacy preset path (F1) + F2-F11 dispositions
- feat: release process D13 — compat matrix + local-first release automation
- docs(install): plain-language explanation of install options (EN+zh)
- feat(install): GitHub Pages install endpoint + README install section


# Changelog

## Unreleased

### Phase 5 close-up (P5-T15, 2026-10) — weak-form settle pins + doctor-lite mutation evidence + notices truth

- test(e2e): `settleReachedChildren` — the weak form `settleReached !== false` (pre-existing since
  T5, flagged by the T14 review as always-passing: `undefined` rode through and `true` only echoed
  the hook's boolean) is hardened to named settle evidence in BOTH team analyzers: strict equality
  pins that the settle hook really ran and returned true (hook removed/renamed = red), and the
  durable settle lines are re-read off the frozen final log — every member session carries a
  `turn/end reason.kind='completed'` row, and `team-nested-create-denied` additionally re-pins the
  lead's durable `teamRunId` tool/result row (the denial text never carries that substring, so the
  two axes cannot collapse). Both scenarios green on the real host; all fabricated channels green.
- test(gate): doctor-lite check 4's T14 repo-row arms got their mutation evidence — four legs
  red→green (`config:` on a declared-no-schema row; `omo-team` Config export stripped →
  `REPO_ROWS_WITH_SCHEMA` pin; `omo-team` cordis.yml row dropped → same pin, row-gone half;
  `omo-agents` sprouting a Config → the declared-no-schema flip arm), restores sha256-verified
  (`.omo/evidence/p5t15/mutation-gate4-doctor-lite.log`).
- docs(notices): THIRD_PARTY_NOTICES.md team-core tally corrected against the manifest —
  `verbatim` 37→**7** / `已修改` 7→**37** / `deviations` 13→**17**: the T8b import-wall completion
  flipped 30 rows to `modified` (mechanical `.ts`/`/index.ts` specifier completion, semantically
  zero-change, machine-proven) and the manifest flipped honestly then; the table never followed
  until this re-read. All 47 rows now agree origin-for-origin with `VENDOR-MANIFEST.json`;
  vendor-manifest drift + `verify-licenses` re-run green.
- feat(manifest): the last six `pending` rows — `vendor-team-core-types` / `-member-parser` /
  `-team-registry` / `-team-tasklist` / `-team-state-store` / `-closure` — flip to **`ported`**
  under the refined flip rule (arbitration: the row's own semantics landed AND its named e2e
  scenario is green — bytes vendored at T8a, consumption wired at T8b, `team-task-claim` green),
  each with a per-row delivery note in `manifest.ts` naming its vendored paths, its consuming edge
  and its scenario. Census `pending=0 / ported=22 / recorded=2`; `pending` STAYS in the vocabulary
  (a roster without a starting state cannot declare "not yet"). The flip's other half lands in the
  same commit: `src/team/team-core-vendor.ts`, the **per-row vendor integrity gate** — the
  verification set is DERIVED from each row's own `upstreamSources` (prefix stripped onto the vendor
  tree), every file is sha256-checked against `VENDOR-MANIFEST.json` at registration, any drift
  throws by name so that row FAILS and the census stops short, and the verified facts publish as
  six distinct read-only cordis faces. Six registrars, one per row, so the boot census reads the
  honest `22/24`. The whole synchronisation net moves in this commit: `boot-markers.test.ts` (pinned
  summary line + registry table + the six published faces), `manifest.test.ts` (split / counts /
  spot pins + a new per-row block for ⑱–㉓), `drive.mjs` (census literals, the
  `bootCensusTwentyTwoOfTwentyFour` verdict keys, fabricated fixtures carry the six registered
  lines), `assert-team-probe-face.mjs` — ON the sync net too: its two fabricated census literals
  move with the flip (`pending=6, ported=16 — 16/24` → `pending=0, ported=22 — 22/24`), named
  here so no later review reads that edit as out of scope — and the probe's derived face re-checked.
- test(gate): **c28 — the NOTICES mirror** (`verify-concerto-static.mjs`): THIRD_PARTY_NOTICES.md's
  team-core table is compared with `VENDOR-MANIFEST.json` row-for-row, path-for-path,
  origin-for-origin through a CLOSED named disposition vocabulary (`verbatim`/`已修改`/`本项目新增`
  → `verbatim`/`modified`/`project-new`; an unmapped token FAILs, never skips), with contiguous
  `P5-n` numbering, both directions (a notices row without a manifest row, and a manifest file no
  row names, are both red), and every count the prose prints re-read against the derived tally
  (6 prose anchors + the Totals line + the manifest's own `counts.{verbatim,modified,projectNew,total}`).
  The arm exists because the drift is measured, not hypothetical: the table said `verbatim 37 /
  已修改 7` while the manifest had honestly flipped to `7/37` at T8b, and c27 only ever checked the
  vendor tree against ITSELF — four commits carried a NOTICE that misdescribed its own vendor tree.
  Mutation leg: flipping one row's origin reddens c28 alone
  (`.omo/evidence/p5t15/mutation-c28-notices.log`).
- docs(notices): **the semantic-port table the task book required** — a new section
  `Phase 5 omo-team semantic ports (the 9 ported files — c25's ported population)` lists, in the
  Phase 4 per-command precedent's shape (DSH file ↔ upstream path at `v4.19.4` ↔ disposition),
  the 9 ported `omo-team` files: `team/member-validator.ts` / `team/team-spec.ts` /
  `team/team-state.ts` / `tools/team-create.ts` / `tools/team-delete.ts` / `tools/team-message.ts`
  / `tools/team-shutdown.ts` / `tools/team-status.ts` / `tools/team-task.ts` — row material taken
  verbatim from each file's own attribution header and the manifest's `upstreamSources[]`; the
  table states it is the INDEX, not the authority (headers + manifest + Q1a/Q1b evidence hold the
  per-file detail), and names the 11 DSH-native files + `manifest.ts` (INFRA) as deliberately
  outside it — a false upstream attribution in a NOTICE is exactly what this file exists to
  prevent. Placed after the prompts-team section, outside c28's team-core read window; c28
  re-checked 47↔47 green. Grammar fix rode along: three vendor-table rows (P5-20/P5-36/P5-41)
  had the T8b completion clause glued onto the prefix without a separator — semicolons added,
  matching the other completion rows' house style (c28 reads only the first three cells; zero
  mirror impact).
- test(e2e): **review-round settle hardening + fabricated settle legs** — the two remaining
  weak-form `settleReached !== false` checks (P5-T9's `team-teardown-no-orphans` and
  `stop-continuation-team` analyzers) hardened with the same named-pin discipline: strict
  `=== true` (hook removed/renamed/never-fired = red) plus durable re-pins off the frozen final
  log — teardown re-reads the dormant signature through a hoisted named helper
  (`closedByParentInterrupt`, the very yard `memberTurnsClosedByParentInterrupt` uses, so the two
  pins cannot drift apart), stop-continuation re-reads the quiescence shape (`laneQuiescent`:
  `turn/start == turn/end` and `ends ≥ 1` per lane, the settle hook's own rule) plus both
  members' non-completed closures. Fabricated reverse legs added and pinned: `teamCreateSurfaceDefectCases`
  grows 9→10 (`settle-hook-never-ran-undefined` — the weak form's exact hole, red ONLY on
  `settleReachedChildren`), and `team-nested-create-denied`, which had NO fabricated self-test
  at all, gains a GOOD fixture built on the analyzer's own extraction shapes plus a one-leg
  defect list (count pinned 1) with the same undefined leg; counts, failure messages and the
  SELF-TEST banners all moved together (`--self-test` green, both new legs named in the banner).
  The third scenario rode along by arbitration (the review-round MAJOR fix round): the
  self-reported residual — `team-shutdown-handshake`'s `settleReached`, once left as
  "untouched, for the arbitrator's discretion" — was ruled IN and hardened with the same
  discipline: strict `=== true` plus frozen-log re-pins of the tombstone pair (`"status":
  "deleted"` + the named `is deleted` refusal) and the three-lane `laneQuiescent`, with the
  scenario-specific semantics on the record (the teardown `aborted(parent)` dormant yard
  CANNOT be borrowed here — measured at teardown both members are already idle with every
  member `turn/end` completed; the interruption half is pinned independently by
  `deleteInterruptedBothMembers`). The MAJOR race the arbitration named: a tombstone-only
  settle froze while the scenario-declared tail (the native post-delete follow-up cold-waking
  the analyst, whose receipt waking the lead's processing turn) could still be in flight —
  measured 1-red-in-4 (lead turn 11 open 76ms before SIGTERM) — and of the two ruled fixes
  the measurement chose quiescence-before-freeze: the deadline-at-hook-return half of ② is
  unmeasurably narrow (instrumented run: the tail turn OPENS before the hook returns —
  ...092222 open vs ...092546 return), and an event-cursor deadline would exempt every
  post-refusal turn and hollow the pin; so `awaitTeamShutdownSettled` now holds `stopDsh`
  (bounded) until all three lanes satisfy the analyzer's own yard AND the log snapshot stays
  quiet for 2s — the frozen-face pin keeps full strength with zero exemptions, and an
  unsettled tail reports itself red. `stop-continuation-team` audited for the same shape:
  its hook already embeds quiescence + a 4s stability window, nothing to add. Evidence:
  6 consecutive green handshake runs, 3 consecutive green stop runs, `--self-test` green
  (`.omo/evidence/p5t15/race-fix-handshake-6runs.log`, `race-fix-stop-continuation-3runs.log`,
  `race-probe-instrumented-run.log`).
  Honest ledger stays: the real runs remain the primary evidence (the flip round's first
  5-RED run is on the record); the fabricated legs are the no-retreat pin.
- docs(evidence): RUN-SUMMARY corrections — the "coverage baseline's vendor row status column
  stays as-is" claim was FALSE as written (`phase5-dev/phase5-team.md` carries no
  `pending`/`ported` tokens at all: its column is the disposition enumeration, all terminal
  since T1; the machine-readable row-status face is `manifest.ts`), rewritten to the fact; and
  the supplement-② closure is now on the record — c26/c27 mutation legs were already closed at
  P5-T14 (`.omo/evidence/p5t14/mutation-gate6.log`, legs C–I), the real gap was gate 4's
  repo-row arms, filled by legs A–D this phase.
- test(omo-commands): the Phase 4 per-command derivation in `commands.test.ts` read its table
  with an UNBOUNDED slice (header → EOF), so any later table sharing the disposition vocabulary
  rode the count — the new Phase 5 semantic-port table reddened it 5→14 on first vitest. Fixed
  at the reader, not the notices: the slice is now BOUNDED at the next `##`/`###` heading
  (c28's section discipline), the honest `semantic port only` phrasing in the new rows stays
  exactly where the review required it. 78/78 green.

### Phase 5 gate hardening (P5-T14, 2026-10) — relay/broadcast e2e + honest scenario rename + gates 4/6/8 extensions

- rename(e2e): scenario `hyperplan-degraded-noted` → `hyperplan-team-mode-full-ring` — the sandbox
  has mounted omo-team since T3, so the form that runs is the FULL adversarial ring; the old name
  contradicted the fact and honest naming wins. Full-repo reference sync (omo-commands manifest row
  + comment, `tests/omo-commands/manifest.test.ts` pin, THIRD_PARTY_NOTICES.md mapping, drive.mjs
  scenario/script/analyze/self-test labels/banner); the coverage baseline is anchored by H-numbers,
  not scenario names, so the baseline does NOT move (c14 arbitration note). The old name stays in
  historical entries (this file's Phase 4 entry, phase4 task books — read-only archives).
- test(e2e): `team-create-and-message` grew its relay/broadcast half — member→member delivery
  relayed through the live lead (frame annotated `(relayed via lead)`, durable source still the
  lead's `agent-message` kind) and lead-only wildcard broadcast (fan-out to both members under one
  id, lead never receives its own), plus the member-side broadcast denial (`broadcast requires lead
  role`, refused by name before any id is allocated — zero frames under its canary id); 11 new
  named checks + 11 fabricated defect legs, each red ONLY on its own check; `dualLedgerDurable-
  AcrossReboot` strengthened from substring-matching the serialized detail to reading the ledger
  structurally (`processedMessageIds.length > 0` + both member names in `briefingInjectedMembers`).
- feat(gate): omo-team now exports a plugin `Config` (`{ maxMembers?: number }`, default 8 = the
  vendored `MAX_TEAM_MEMBERS`), consumed at team_create spec validation; doctor-lite check 4 gained
  the repo's own `cordis.yml` plugin rows as a validated face (omo-team checked; the three sibling
  packages declared no-schema BY DECLARATION with their refusal tested).
- feat(gate): `verify-concerto-static.mjs` c25–c27 — omo-team source signature/coverage census,
  manifest↔file-set pin, vendor existence + team-core subset terminal pin; the c14 arbitration
  (phase5-team.md does not join COVERAGE_BASELINE_MDS) is codified as a live re-check + comment.
- feat(gate): `run-proofs.sh` proof 8 — vendored team-core host-Node loadability (the T8b wall
  ruling's regression net) + manifest integrity + state-machine resume shape.

### Phase 5 landing (P5-T1 … P5-T13, 2026-10) — team-mode over startContinuable, fork (B)

> Backfilled at the P5-T15 close-up: the phase's landing faces had no entry here except T14's.
> One bullet per task, faces only — the task book (`docs/plans/phase5-dev/phase5-tasks.md`) and
> `.omo/evidence/p5t*/` stay the detail authority. Historical entries untouched.

- docs(research) T1: full team-face reconciliation Q-1…Q-8 on the pinned 0.2.0-rc.2 host —
  upstream 12-tool census (read-only `git show`), activation probe, the Q-3 triple-seal chain
  (per-member roster routing cannot close on the native spawn path), wake-canary PIN-OK 25/25;
  **fork ruling (B)** (`.omo/evidence/p5t1/FORK.md`): omo-team self-owns the state machine and
  creates members through `ctx.subagents.startContinuable`; the experimental team face is NOT
  adopted (D18, shipped with T3).
- feat T2: `@oh-my-opendsh/omo-team` package skeleton + `manifest.ts` as the single source of
  truth (24 rows, four-value status vocabulary, `validateManifest` 12 checks); `typecheck:team`
  joined `typecheck:libs`; license gate moved checked 56→57 with the workspace row.
- feat T3: root `cordis.yml` gained the fourth `- insert:` row `id: omo-team` + the derived boot
  marker line; the 3→4 count-coupling net moved ALL seven sites in one commit
  (`EXPECTED_INSERT_ROW_IDS`, cordis-inserts.test, cold-start, drive, probe, smoke-real, header);
  D18 + ROADMAP Phase 5 landed bilingually in the same commit.
- feat T4: `member-validator.ts` + `team-spec.ts` as pure functions — the 11-seat terminal
  matrix (allowlist {hephaestus, sisyphus-junior} + category aliases quick/deep), object/JSON
  dual-arm inline spec, members 1..8, closed v1 shape, every refusal named.
- feat T5: `team_create` — fork (B) execution face: in-memory state machine mirroring the upstream
  RuntimeState shape, roster-seats trio (persona/toolFilter/route byte-checked against the persona
  files), nested-create gate, first-failure rollback (failed→interrupt→drain), briefing injected
  as its own frame (`omo-team-briefing`, never merged into the spawn prompt).
- feat T6: `team_send_message` — lead↔member direct adjacent delivery, member↔member relayed
  through the live lead (`(relayed via lead)`, durable carrier stays the lead's `agent-message`),
  broadcast lead-only with named refusal, reservation-first dedup ledger (may-miss, never
  double-deliver), 32 KB payload cap; full-segment e2e `team-create-and-message`.
- feat T7: shutdown handshake (`team_request/approve/reject_shutdown`, incl. the fourth path —
  the lead approving on a member's behalf) + `team_delete` (DELETABLE gate, force bypass,
  interrupt-with-inbox-preserved, tombstone rows) + `team_status` aggregate; briefing injection
  deduped to EXACTLY once per member.
- vendor T8a: `patches/omo-dsh/vendor/team-core/` — the T2-arbitrated subset under the full
  vendor playbook (`VENDOR-MANIFEST.json` per-file sha256 + `deviations[]`, prominent
  modified-copy `NOTICE.md`, zod `^4.4.3` kept verbatim, strip-only rewrites for Node 24
  type-stripping, 10 upstream tests carried via the `bun:test`→vitest alias).
- feat T8b: the import-wall ruling executed — `.ts`/`/index.ts` completion across 34 files /
  141 specifiers, semantically zero-change machine-proven (`prove-zero-semantic-change.mjs`; this
  is what moved the manifest to 37 `modified` — see the T15 notices correction above);
  `team_task_create/list/get/update` thin shells over the vendored tasklist; durable state-store
  swap-in (restart resumes); the `@oh-my-opencode/team-core` workspace dependency edge registered.
- test T9: e2e `team-teardown-no-orphans` (tombstone closure + `turn/end aborted(parent)` +
  live-read descendants/jobs probes with the depth≥2 NEGATIVE canary) and
  `stop-continuation-team`; the stop guard gained the team branch (`cascadeTeamMembers`:
  per-member ancestor interrupt, one never-awaited drain, mutually exclusive marker tokens).
- test T10: the (B)-form visibility half — drive catalog/claim-frame assertions (exactly two
  continuable rows under verbatim `team:<run>:<name>` labels, wake-round seq anchors, handshake
  frames at the lead) + the bidirectional probe face (`assert-team-probe-face.mjs`: present =
  trio registration + boot-resume + `errors=0`; absent = named degradation pair, zero-marker
  catch-all); 13 new checks each with a fabricated leg red ONLY on its own name.
- (T11 was NOT triggered — the arbitration terminal ruled no landing; recorded for completeness.)
- feat T12: the keyword-detector `team` slot wired — `TEAM_PATTERN` hit injects the vendored
  `team.md` verbatim (`omo-team-keyword`), members structurally never released
  (`SUBAGENT_ALLOWED_TYPES` stays team-free); new vendor package `prompts-team` (team.md + the
  team-mode skill template, byte-pinned both directions; deviations N1/N9 registered, zero bytes
  changed); e2e `team-keyword-mode`.
- feat T13: hyperplan upgrade to the FULL adversarial ring + remove-ai-slops team-mode addendum,
  switched by RUNTIME presence detection (`team-tool-presence.ts`, read per call, never cached at
  apply; absent/mis-shaped/non-true all fall back byte-exact to the P4 degraded text); the N1
  hollow-status bomb disarmed in the model-visible face; `team.md`'s opencode-carrier sentence
  registered as the 5th `note` deviation (kept verbatim, the adaptation lives in the consumers).

### Phase 4.5 code landing (2026-10-06 … 2026-10-08) — declaration-face installer + D17 cutover + four review-fix rounds

- feat(installer): `scripts/install-concerto.sh` rewritten to the declaration face — renders the preset
  as one `- insert:` row in `profiles/web/cordis.patch.yml` (0.2.x never reads `.agent-presets/`),
  refuses dsh < 0.2 by name and the nested-group shape loudly, byte-exact backups + retention +
  `.bak.first` permanent original, idempotent no-op runs write nothing, refused installs leave zero
  bytes, user comments in old blocks are refused (wrapper-level) or WARNING-named (block-internal),
  and symlinked patch files are resolved to their real target instead of being silently replaced.
- feat(cutover): D17 — 0.1.x compatibility dropped; the D7 pin flipped to `0.2.0-rc.2` together with
  the seat-id re-pin in one commit (`2323658`); T13 cleanup made the 0.2.x eight-gate green the single
  non-regression signal of record (CI run 37476903377).
- fix(review): four PR #12 review-fix rounds (qwen 17+5+4 inline findings + kimi 4 rounds of summary
  findings, every item reproduced before fixing): backup/no-op/refusal leaks, comment-loss paths,
  non-string YAML keys, SIGINT trap semantics, restore-command quoting, compat-probe exit codes +
  `--tag` parsing + GH_TOKEN + dist-tag coverage + the install-alias face leg + the label it files
  under, the d10 gate (hermetic working-tree form) + release.sh step 7b alias content gate,
  stop-continuation third bucket, disposer ordering, and a ledger-vs-code truthfulness sweep across
  comments/docs/tests.

### Phase 4.5 kickoff (2026-10-02) — adaptation plan (docs-only; no code, no pin flip)

> *Historical note (superseded 2026-10-06, D17): the "dual-runtime adaptivity" strategy below was
> abandoned mid-phase — 0.1.x compatibility was dropped by ruling D17 and the D7 pin flipped early
> (P4.5-T12b, commit `2323658`), so adaptation sites fork on the runtime-identity marker instead of
> bridging both generations. The entry stays as written for the record.*

- docs(plan): `docs/plans/phase4.5-dev/` — the Phase 4.5 development plan + task list (13 tasks, 8 WPs,
  ~8.5 person-days), implementing ROADMAP Phase 4.5 against the 0.2.0-rc.2 review. Core strategy:
  **dual-runtime adaptivity** — every adaptation site carries a capability probe so the same code keeps
  working on the CI-pinned 0.1.5-rc.1 *and* the locally installed 0.2.x (the repo's feature-probe
  tradition: `--no-open`, `isSessionLogName`, transport-adaptive T9, the jobs three-tier probe), keeping
  branch CI green mid-phase; the D7 pin flips only in the closing change, together with the green
  evidence (exit criterion f). Task order follows the review's forced sequence: jobs surfaces → concerto
  preset registration (`agentPresets.register()` + held disposer) → installer delivery line (declarative
  `PresetDefinition` or documented re-scope) → session-log v4 observation channel → (deferrable) source
  kinds → pin machinery last

### dsh 0.2.x adaptation docs (2026-10-02) — review + roadmap Phase 4.5 (docs-only; no code, no pin flip)

- docs(review): `docs/dsh-0.2.0-rc.2-review.md` / `_zh-CN.md` — a static, source-verified analysis of the
  published dsh 0.2.x line (`dsh-v0.1.5-rc.1..dsh-v0.2.0-rc.2`, 4102 commits) against every upstream surface
  this project touches. Verdict: **two P0 surfaces, both silent, plus one P1 that breaks the test
  infrastructure** — the agent-preset re-architecture deletes the `$DSH_HOME/.agent-presets/` file discovery
  `syncConcertoPreset` targets (concerto never registers on 0.2.x; roster `trust` field gone; the
  declarative `agentPresets.register()` path replaces it; **the released curl installer's static-preset
  line is hit by the same deletion** — review §2.4, scoped as its own Phase 4.5 work item), the `ctx.jobs`
  rewrite (`caller: Agent → SessionId`, `ownerSession → owner`, `onJobDone` → `jobs.events.subscribe`,
  `JobSpec` reshaped) invalidates all three job touch points without a throw, and session-log **format v4**
  restructures the `tool/result` envelope the e2e driver fabricates and parses. The cordis core
  (`vendor/cordis/src/{context,registry,service}.ts` zero-diff), all 15 subscribed events, `agent.inject()`,
  `goals.pause`, `sessionProjections`, `commands`/`skills` registries, and the concerto composition's 20
  upstream packages are verified stable. zstd log compression is recorded as **not new** (default since
  0.1.5-rc.1; sandbox profiles already pin `compression: none`) to foreclose a phantom work item. Two
  review rounds against this report were adjudicated and the fixes landed in the same change: P0-count
  wording (3 → 2 P0 + 1 P1), the installer delivery line added to scope, `decisions.md` / PRD §12
  registration, four over-strong "zero-diff / line-identical" claims narrowed, the §2.1 Remote baseline
  completed (`read`/`select` predate 0.2.0), and citation-precision corrections throughout; two findings
  were rebutted with evidence (the "R-8" reference is **not** dangling — it lives in
  `docs/plans/phase2-dev/phase2-plan.md` §6 — and the `kind:'plugin'` count is exactly 13 in the plugin
  sources, site-listed in the rebuttal)
- docs(roadmap): **Phase 4.5 — DSH 0.2.x runtime adaptation** inserted ahead of Team Mode (numbered 4.5 so
  Phases 5–7 keep every existing reference). Team Mode builds on `ctx.jobs` + `ctx.subagents`, so the
  adaptation is a dependency, not a sequencing preference. Scope in the review's forced order — jobs
  surfaces → concerto preset registration (disposer held for HMR/unload) → **installer delivery line**
  (declarative `PresetDefinition` in profile/bundle YAML) → v4 observation channel → (deferrable) dedicated
  message-source kinds → pin machinery **deliberately last**; exit criteria demand the full L1 chain green
  on 0.2.x, L2 re-verified, the roster carrying `concerto` again, the `/stop-continuation` cascade e2e
  proving jobs are actually cancelled (the silent-skip canary), and the installer line's 0.2.x status
  resolved before the D7 pin flips
- docs(readme): both READMEs' Current Status carry the 0.2.x review row (🔬) and the key-facts DSH row now
  names 0.2.0-rc.2 as reviewed-but-unpinned — **the CI pin stays `0.1.5-rc.1` until Phase 4.5 closes**
  *(historical by construction — accurate as of this 2026-10-02 docs commit; superseded 2026-10-06: the pin
  flipped to `0.2.0-rc.2` at the D17 cutover (P4.5-T12b, commit `2323658`) and the compat row migrated to
  `tested` at T13; the READMEs carry the corrected text)*
- chore(compat): `0.2.0-rc.2` registered as an `untested` matrix row (`.omo/compat.yaml`, matrix
  re-rendered) — the standing "upstream published a new version" mechanism; **no `tested` row moves**

### Phase 4 (2026-10) — command face + vendored skills (no version bump in this change; the next release heading is assigned at release time)

- feat(omo-commands): new host-only plugin `patches/omo-dsh/omo-commands/` (`@oh-my-opendsh/omo-commands`)
  — 5 builtin commands registered as semantic ports, `src/manifest.ts` as the single source of truth
  (6 declared rows: 5 ported + 1 `pending`), boot markers (`[omo-commands] loaded` + per-command
  `registered` lines). **Semantic port, not vendored code and not a copy**: the upstream instruction
  body is reproduced, the command entry and the injection path are DSH-native
- feat(commands): `/ulw-execute`, `/handoff`, `/remove-ai-slops`, `/stop-continuation`, `/hyperplan`,
  each with per-file upstream attribution headers, unit tests and a mock-LLM e2e scenario
  (`ulw-execute-command-activates-atlas`, `handoff-summary-driven`, `remove-ai-slops-driven`,
  `stop-continuation-halts-todo`, `hyperplan-degraded-noted`)
- feat(ulw-execute): the R-10 closure — the command template produces both marker constants verbatim
  (`<session-context>` + `You are starting an Atlas work session.`), the conductor session receives the
  instruction as a followup, and the marker reaches the Phase 3 `ulw-execute` listener through the
  delegation task text, where H-32 activates in the **atlas child** (the conductor session is not an
  injection surface by design — it has no atlas descriptor, so the listener returns before the decision).
  Cross-package constant equality is pinned on the **rendered product**, not on the constants, because a
  template that stopped emitting one marker would silently deactivate H-32 without any error
- feat(keyword-detector): the 15th `omo-hooks` manifest row (H-33 / Phase 3 S-06) — an `agent/pre-step`
  waterfall listener detecting `ultrawork` / `ulw` / `hyperplan` / `hpp` and the `hyperplan ulw`
  combination, then injecting the mode instruction via `agent.inject()`; the injected body quotes this
  repo's **vendored** skill text, 5+1 upstream model variants are narrowed to one roster-aware text, the
  `team` enum slot is reserved but unwired (Phase 5), and toast is narrowed to an audit line
- feat(skills): 19 OMO instruction skills **vendored** (content, not ported) under
  `patches/omo-dsh/vendor/shared-skills/skills/` and registered in the catalog, with per-skill licence
  statements in `THIRD_PARTY_NOTICES.md`
- feat(stop-continuation): a cross-plugin service (`omoStopContinuation`, provided by `omo-hooks`,
  consumed by `/stop-continuation`) with four mechanisms — the todo-continuation stop marker read as
  H-03's **first** skip gate, `ctx.goals.pause` (**pause**, not upstream's clearGoal, so the goal is
  kept and resumable), a cascading `ctx.jobs.list(caller)` + `kill` fenced on `ownerSession === sessionId`
  (**the caller argument is load-bearing**: `list` without it returns only ownerless jobs, so a real
  producer's jobs would be silently skipped), and ralph — which has **no programmable stop API** on this
  runtime, so the template says so instead of promising cancellation
- docs(omo-commands): per-command semantic-port table (upstream file lists, dispositions and every
  narrowed difference) + a per-vendor-skill section in `THIRD_PARTY_NOTICES.md`, **add-only** over the
  pre-existing Phase 2/3 entries; the missing attribution row for the `keyword-detector` listener added
  so the table agrees with the derived 15 hook ids / 26 derived files that static gate c21 recomputes
- test(gates): static gate c15–c22 extended (census 23→31) — cordis.yml insert rows resolve to real
  published packages, per-file signature headers, manifest ↔ src file set, manifest ↔ coverage baseline,
  the vendor skills' manifest/NOTICES/disk three-way agreement with `EXPECTED_VENDOR_SKILL_COUNT`, v5
  rename consistency, the **derived** NOTICES hook counts, and **c22** (PR #10 review round 1): every
  status cell in the Phase 4 coverage baseline's §1.1/§1.2/§2/§3 must be terminal — those four tables
  list terminal dispositions only, so none may carry a forward-looking marker (「待 vendor」/「待 P4-Tn」
  /📋/⏳); work that has not landed belongs in §4 (the deferred table, deliberately out of scope), and a
  row stuck in a pending cell is precisely the failure c14 cannot see (c14 only reads rows already
  marked ported); e2e driver grew to 33 mock-LLM scenarios
- ⚠️ Scope honesty (R-7, unchanged by this landing): the command face is **not** OMO's whole
  orchestration surface. Team Mode (`team_create`, the adversarial review loop, `team` keywords) is
  Phase 5; the editing face (`/refactor`, LSP/ast-grep) is Phase 6; `/hyperplan` is a **degraded
  form** (roster delegation replaces `team_*`) and must declare the degradation in its reply; `/ulw-plan`
  is a **zero-code gesture bridge** and must never become a registered command (it would shadow DSH's
  own skill gesture); `session_read` is narrowed to guidance prose

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


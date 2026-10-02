# oh-my-opendsh Roadmap

> **Primary document (English).** 中文版见 [ROADMAP（中文）](./roadmap_zh-CN.md)。
>
> Adopted 2026-09-11, alongside decision **D14** (OMO baseline freeze). This roadmap governs development **under the frozen OMO v4.19.4 baseline**; it operationalizes D14 and supersedes the follow-up split sketched in the MVP PRD §6 wherever the two disagree.

## 1. Mission (unchanged)

Bring OMO's harness capability system onto the DSH framework so that **"don't bet on a single model" becomes the default way of working** on DSH — orchestration-first (Concerto posture), with the right model doing the right job.

The mission is a **one-time semantic transplant** onto DSH, not an ongoing dependency on OMO's release stream. That is the premise D14 formalized and this roadmap executes.

## 2. Upstream version policy (D14, operationalized)

| Rule | Content |
|---|---|
| Frozen baseline | OMO semantic & code baseline = **v4.19.4** (last v4 release, 2026-08-01). All validated knowledge (personas, hook mapping, Concerto design) stays anchored there |
| No beta tracking | The v5.0 beta line (53 tags / 33 days) is **not followed**. No weekly OMO sentinel (the existing `compat-probe` sentinel watches **DSH only**, unchanged) |
| Code intake = git vendoring | The 19 core packages are `private: true` and were never on npm (feasibility report §16.2). When a phase needs OMO source, **vendor from a git tag**: v5.0.0 stable if released by then, else v4.19.4 — the targeted core packages are nearly identical between the two, so the choice is low-stakes |
| Selective lifts | A concretely needed upstream fix/capability may be cherry-picked file-by-file from a newer tag at any time, with attribution — a targeted lift, not a version bump |
| Awareness practice | At each own release node (`scripts/release.sh` run), read the upstream CHANGELOG once; record anything that invalidates a §16 errata assumption in `docs/decisions.md` |
| Naming anchors | v5 names: `plan-consultant` / `plan-reviewer`, `/ulw-execute`; **codegraph excluded** (deleted upstream); memory / DAG / model-profiles = DSH-native-first candidate domains |

## 3. Non-negotiable constraints

Every phase is governed by the README's two principles (DSH-native first; honor OMO's design and license) plus these license guardrails, which have equal force:

1. **SUL-1.0 compliance on every vendored file**: `LICENSES/oh-my-openagent.LICENSE.md` ships verbatim; every vendored file/dir gets attribution in `THIRD_PARTY_NOTICES.md`; the framework stays dual-licensed MIT OR SUL-1.0.
2. **Non-commercial** (D8): no sales, no commercial services/SaaS.
3. **No PRs to OMO** (D5); no attribution removal, ever.
4. `scripts/verify-licenses.sh` must stay green; an upstream license change triggers a fail — **do not bypass** (README principle boundaries).
5. Prefer porting semantics from OMO's **harness-neutral core layer** (team-core / delegate-core / hashline-core / rules-engine / …), not from its opencode adapter layer (v5 errata, feasibility report §16.2).

## 4. Phases

### Phase 0 — Concerto MVP skeleton ✅ (closed 2026-09-10, v0.2 line)

Delivered: `concerto` run mode (persistent preset), omo-sisyphus conductor persona + omo-explore subagent binding, dual model routes (deepseek-official + pi-ai), Hard-Blocks injection listener, doctor-lite + mock e2e, release process (D13). Pitfalls P-1–P-21 recorded in `docs/mvp-pitfalls.md`.

### Phase 1 — Core-source vendoring spike (revised O1) ✅ (closed 2026-09-11)

Delivered: `hashline-core` (`@oh-my-opencode/hashline-core` @ v4.19.4, commit `b072d279…`) vendored into `patches/omo-dsh/vendor/` and wired into the pnpm workspace + vitest (6 files / 78 tests green); `THIRD_PARTY_NOTICES.md` **per-file** attribution of 29 rows (D15); `verify-licenses` green (D15 `license` field + D16 name-gate extension, `checked` 51→52); `docs/plans/phase1-dev/vendoring-playbook.md` field-record version. **Vendored, not consumed** (the preset does not wire it yet).

- **Goal**: prove the git-vendor intake path end-to-end on the smallest useful surface.
- **Scope**: pick ONE core package (candidate: `hashline-core` — self-contained, no harness deps); vendor it from the chosen tag into `patches/omo-dsh/vendor/`; build + unit-test green under our toolchain; attribution + license entries landed.
- **Exit criteria**: (a) vendored package builds and its tests run in our CI; (b) `verify-licenses` green; (c) `THIRD_PARTY_NOTICES.md` lists the vendored package; (d) a short "vendoring playbook" note records the mechanics (how files were copied, what shims were needed) so later phases repeat it cheaply.
- **Not in scope**: consuming the vendored code from the preset yet (that lands with the phase that needs it).

### Phase 2 — Agent roster expansion (1+1 → full team)

- **Goal**: expand Concerto from sisyphus+explore to the full OMO roster, on DSH agent presets with per-agent `{provider, model}` routes.
- **Scope**: hephaestus, oracle, librarian, **plan-consultant** (metis), **plan-reviewer** (momus), atlas, multimodal-looker, sisyphus-junior, prometheus; persona text derived from the frozen baseline's prompts (v5 role names per §16); per-agent tool restrictions mirroring OMO's semantics (e.g. plan-reviewer read-only); delegation bindings between them.
- **Key constraint**: model chains stay in config, not hardcoded; DeepSeek-family routes first (R1 phased strategy).
- **Exit criteria**: each agent callable through the conductor with its own route observable in the session log (the AC-5 pattern generalized); roster snapshot test green.

### Phase 3 — Hook listener port

- **Goal**: port OMO's hook semantics onto DSH events via the listener translation pattern (validated as V3 in the MVP).
- **Scope**: the ~30 hook modules per the §1.2 mapping table, minus `codegraph-bootstrap` (dead), with `start-work` content read under its v5 name `ulw-execute`; priority order: file guards (write-existing-file-guard, bash-file-read-guard) → todo/goal enforcers → compaction aids → session notification → the rest.
- **Key constraint**: where DSH natively covers a hook (`ctx.goals`, `ctx.compaction`, `ctx.todo`), use DSH — do not translate OMO's implementation (README principle #1).
- **Exit criteria**: each ported hook has a mock-LLM e2e showing the DSH event → OMO-semantic effect; a hook-coverage checklist doc tracks ported/skipped(with-reason).

### Phase 4 — Slash commands & skills

- **Goal**: OMO's command surface on DSH `ctx.commands`: ultrawork keyword mode, `/ulw-execute`, `/ulw-plan`, `/goal` (already native via `dsh-goal`), `/hyperplan`, stop-continuation, handoff, remove-ai-slops.
- **Scope**: command registration + the shared-skills content (17 skills, bare names — no `shared/` prefix, per §16).
- **Exit criteria**: each command drives the expected agent behavior in a scripted scenario; skill loading reuses `dsh-skill` unchanged.

### Phase 4.5 — DSH 0.2.x runtime adaptation

> Inserted 2026-10-02, ahead of Team Mode. Numbered 4.5 on purpose: renumbering Phases 5–7 would churn every existing reference (README status, plan directories, the README R-8 note in `docs/plans/phase2-dev/phase2-plan.md` §6) for zero semantic gain. Scope and evidence: [`dsh-0.2.0-rc.2-review.md`](./dsh-0.2.0-rc.2-review.md) (static, source-verified; no runtime gates run yet).

- **Goal**: make the overlay — concerto preset, hooks, commands — fully functional and gate-green on the published dsh 0.2.x line (reviewed against `0.2.0-rc.2`), then flip the D7 pin. Until this phase closes, the CI pin stays `0.1.5-rc.1` and 0.2.x is a registered-`untested` matrix row, not a supported runtime.
- **Why now**: upstream shipped three rewrites that land on this project's load-bearing layers, and **all three fail silently** — two of them break the **runtime**: the agent-preset re-architecture deletes the `$DSH_HOME/.agent-presets/` file discovery `syncConcertoPreset` targets (concerto mode simply never registers — and the released curl installer writes its static preset into the same deleted path), and the `ctx.jobs` rewrite invalidates all three job touch points without a throw; the third breaks the **test infrastructure**: session-log format v4 restructures the `tool/result` envelope the e2e driver fabricates and parses. Team Mode (Phase 5) builds directly on `ctx.jobs` + `ctx.subagents`, so adapting first is not optional sequencing, it is the dependency.
- **Scope** (in the forced order the review derives — fix what features stand on before the features, and the pin last):
  1. **`ctx.jobs` adaptation** (small, isolated): `background-notification.ts` → `jobs.events.subscribe({owners:'scope'})` with `settled.awaited` de-dup; `stop-continuation-guard.ts` → `SessionId` caller + `JobView.owner`; `ulw-execute/live-state.ts` → the new `JobSpec` (`owner: SessionId`, `run(job: JobHandle)`, `result`).
  2. **Concerto preset registration** (the core feature): keep the sentinel-rendering pipeline, replace its file-materialization exit with `ctx.agentPresets.register({id:'concerto', …, plugins})` — and **hold the returned disposer** for HMR/unload; drop `trust` from the roster vocabulary; re-point the probe and e2e assertions at the registry roster and the composed agent tree.
  3. **Installer delivery line** (the published one): `scripts/install-concerto.sh` writes the static 1+1 preset into the same deleted discovery path, and `agentPresets.register()` cannot host a curl-fetched artifact (process-scoped, disposer-owned). Carry the line as a **declarative** `@deepseek-ai/dsh-agent-preset` row (`PresetDefinition`) in the profile's own `cordis.patch.yml` (or a bundle layer) that the installer writes instead — or deliberately re-scope the line with the reason recorded (review §2.4).
  4. **Session-log v4 observation channel**: sandbox profiles keep `compression: none` (already the design); the driver's fabricated entries and log parsers move to the v4 `tool/result` shape (`role:'tool'` + top-level `toolCallId`/`isError`).
  5. **Deferred-parity item**: `source:{kind:'plugin'}` → dedicated declared source kinds (13 sites in the plugin sources — 10 code, 3 comments, no runtime filter to port; deprecated idiom, not a live break).
  6. **Pin machinery, deliberately last**: ci.yml `DSH_VERSION` + `--before` cutoff via `scripts/bump-dsh.sh`, doctor-lite's D7 semver assertion, the compat-matrix row — only after the evidence chain below is green on 0.2.x.
- **Exit criteria**: (a) the full L1 chain green on the pinned 0.2.x runtime — unit tests, doctor-lite (roster semantics gate included), `verify-concerto-static`, `check-docs-consistency`, e2e driver, `run-proofs.sh`; (b) L2 real-model verification re-run on 0.2.x with a new evidence file, and the matrix row for 0.2.x ships `tested`; (c) the roster shows `concerto` again and a scripted delegation round-trip lands on it; (d) the `/stop-continuation` cascade e2e proves jobs are actually cancelled (the silent-skip canary); (e) the installer line's 0.2.x status is resolved — `concerto` registers from a fresh install, or the line is re-scoped with the reason recorded; (f) the D7 pin flipped in the same change that ships the green evidence.
- **Explicitly not in scope**: new OMO capability ports (Phases 5–7 own those); adopting 0.2.x *features* beyond what the adaptation requires (each candidate goes through the DSH-native-first check on its own merits later); OMO-side changes of any kind (D14 untouched).
- **Watch**: 0.2.0 is an rc line — the adaptation pins whatever 0.2.x rc is current at execution time, and the review's tag-scoped citations are re-validated against it as the first task.

### Phase 5 — Team Mode (v5 model, DSH-native)

- **Goal**: parallel multi-agent collaboration on DSH — **current session = lead**, members = category workers (fresh subagent sessions with per-category model/skills) and user-defined agents; mailbox-style coordination.
- **Design basis**: v5 team-mode model (feasibility report §16.2) — NOT the v4 declarative-lead model; the v5 model maps 1:1 onto `ctx.subagent` + `ctx.jobs`. The targeted-lift list from the v5 survey: member-revival TTL, fallback-wake (#5317), member-task association.
- **Visualization**: D4 — web ChatNode via `ConversationNodeDefinition`; **no external tmux**.
- **Exit criteria**: a 3-member team (lead + 2 category workers) completes a scripted parallel task with message exchange visible in the web UI; nested `team_create` denied; teardown leaves no orphan sessions.
- **Watch**: upstream's mass-ulw DAG topology is senpi-only and overlaps `dsh-workflow`; revisit only if a concrete need survives the DSH-native-first check.

### Phase 6 — MCPs & editing

- **Goal**: LSP (via `dsh-lsp`), ast-grep (upstream's living direction), web search/fetch (DSH built-ins), and the editing model decision: hashline (`hashline-core`, vendored in Phase 1) vs DSH `str-replace-editor` — decide per principle #1 with an A/B evidence note.
- **Explicitly excluded**: codegraph (deleted upstream, §16.2).
- **Exit criteria**: each chosen capability demonstrably used by an agent in a scripted scenario.

### Phase 7 — Hardening & cadence

- Release per D13 (matrix row must be `tested`); the awareness practice (§2) runs at every release node; open dimensions O3 (npm naming) and O5 (telemetry) decided before a 1.0; Windows stays out (D9) until explicitly revisited.

## 5. Explicit non-goals (carry-over, unchanged)

- No PRs to OMO or DSH upstream (D5); no commercial use (D8); no Windows/WSL support (D9); no replacement of OMO — this is a DSH adapter for OMO's capability system (feasibility report Summary 3).

## 6. Watch items (awareness, not tracking)

| Item | Why watched | Trigger to act |
|---|---|---|
| v5.0.0 stable release | Vendor tag choice (D14 rule 3) | At Phase 1 start, or when a §16 assumption breaks |
| memory-core / mass-ulw DAG / model_profiles | Candidate capability domains | Only after the DSH-native-first check fails for a concrete need |
| Upstream license change | SUL-1.0 compliance | `verify-licenses` fails or a release-node changelog read flags it |
| v4-line archive branches | Baseline integrity | None — v4.19.4 is frozen knowledge, not a dependency |

## 7. Estimates

The §10 workload figures (incl. the ~16-week full-port rough estimate, R3: no buffer, not a commitment) remain the reference. Two adjustments from the v5 survey: Team Mode (Phase 5) trends **downward** (v5 model is DSH-shaped); the vendoring spike (Phase 1) is **new but small** and de-risks every later phase. A third adjustment from the 0.2.x review (2026-10-02): Phase 4.5 is **small-to-medium** (two small items, two medium items, one deferred-parity item — §4 Phase 4.5 scope) but **gates everything after it**, because its surfaces fail silently and only the full evidence chain proves them.

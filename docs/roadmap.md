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

### Phase 1 — Core-source vendoring spike (revised O1)

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

The §10 workload figures (incl. the ~16-week full-port rough estimate, R3: no buffer, not a commitment) remain the reference. Two adjustments from the v5 survey: Team Mode (Phase 5) trends **downward** (v5 model is DSH-shaped); the vendoring spike (Phase 1) is **new but small** and de-risks every later phase.

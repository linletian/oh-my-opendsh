# oh-my-opendsh — Project Decision Record

> **Primary document (English).** 中文翻译见 [决策记录](./decisions_zh-CN.md).
>
> This document is the **single place where project-level decisions are recorded**. The feasibility report ([English](./feasibility-report.md) / [中文](./feasibility-report_zh-CN.md)) is the **research basis** for those decisions; each entry below cites the report sections that justify it.

## Document split

| Document | Role |
|---|---|
| `docs/feasibility-report.md` (+ Chinese) | **Research & evidence**: feasibility analysis, evidence (`file:line` refs), options analysis for the open dimensions (§10) |
| This document (+ Chinese) | **Decision record**: confirmed decisions (D#), risk dispositions (R#), open-dimension status tracking (O#) |

- Decision changes (new decisions / reversals) → register here with date and basis
- Research detail behind a decision → see the feasibility report section cited; not duplicated here

## ID conventions

- **D#** (D1–D16): confirmed decisions
- **R#** (R1–R6): risk dispositions (accept as-is / defer)
- **O#** (O1–O8): open dimensions (O1 / O2 / O4 / O6 / O7 / O8 have since become decisions)
- Cite as: `decisions.md D7`

## Confirmed decisions

### 2026-08-16 (first batch, 6 items)

| ID | Decision | Basis (feasibility report) |
|---|---|---|
| D1 | Physical form: independent `oh-my-opendsh/` repository | §4.3 |
| D2 | OMO introduction: DSH official scratch plugin pattern (`dsh --patch` overlay) | Summary conclusion 2; §4.3 |
| D3 | LLM scope: all providers + phased + prioritize community reuse | §2.4 |
| D4 | Visualization: Plan B (web ChatNode via `ConversationNodeDefinition`) | §2.5 |
| D5 | OMO PRs: none; follow license norms + credits | §11.5 |
| D6 | Upgrade method: Plan B (dual license + directly import OMO source) — *import mechanics revised by D14: npm import → git vendoring; baseline frozen at v4.19.4* | §7.3 / §7.4 |

### 2026-08-19 (second batch, 4 items)

| ID | Decision | Basis |
|---|---|---|
| D7 | DSH pin strategy: pin minor (`0.1.x`) | §10.2; §12.7 |
| D8 | Commercial boundary: no sales, and no commercial services / SaaS | §7.2 |
| D9 | Windows / WSL: out of current scope | §10.4 |
| D10 | Third-party attribution: respect original authors, full attribution | §11.6 |

### 2026-08-19 (third batch, 1 item)

| ID | Decision | Basis |
|---|---|---|
| D11 | MVP scope: adopt the "MVP PRD: Concerto Skeleton" ([English](./mvp-prd.md) / [中文](./mvp-prd_zh-CN.md)), including the "Concerto Mode / 协奏模式" naming and all Q-1–Q-4 resolutions | §10.8; §12.7; §14 |

### 2026-08-19 (fourth batch, 1 item)

| ID | Decision | Basis |
|---|---|---|
| D12 | License whitelist extension: accept MPL-2.0 (weak copyleft) into the verify-licenses whitelist | Feasibility report §4.7; empirical finding from MVP implementation T3 (vite@8.2.1 → lightningcss@1.33.0 is an MPL-2.0 hard dependency) |

### 2026-09-05 (fifth batch, 1 item)

| ID | Decision | Basis |
|---|---|---|
| D13 | Version management & release process: adopt the [Release Process](./release-process.md) / [发布流程](./release-process_zh-CN.md) — three-party compatibility matrix (`.omo/compat.yaml` single source of truth, machine-rendered to the compat-matrix docs), tag convention (immutable `vX.Y.Z` + moving alias `vX.Y`), local-first test layering (L0 static / L1 zero-LLM e2e / L2 real-model local-only), the `scripts/release.sh` six-step release with the docs-consistency checker, the D7-named `scripts/bump-dsh.sh` pin flip, and the weekly `compat-probe` sentinel. Principles: automation first, local-first cost | This discussion (closes O6 / O7) |

### 2026-09-11 (sixth batch, 1 item)

| ID | Decision | Basis |
|---|---|---|
| D14 | OMO upstream strategy: **freeze the v4.19.4 baseline** — no tracking of the v5.0 beta line, no standing rebase cadence; at full-port import time, **vendor source from a git tag** (v5.0.0 stable if released by then, else v4.19.4) under SUL-1.0 with verbatim LICENSE + attribution; selective targeted lifts of upstream fixes allowed at any time; read the upstream CHANGELOG once at each of our own release nodes (awareness, not tracking); naming/capability choices follow the v5.0 errata (feasibility report §16). **Closes O1 with a revision**: the "npm import of the 19 core packages" plan is replaced by git vendoring, because the core packages are `private: true` and have never been published to npm | v5.0.0-beta survey: [architecture investigation](./omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md) + [agent-team investigation](./omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md); feasibility report §16 |

### 2026-09-11 (seventh batch, 1 item)

> Produced during the planning stage of Phase 1 (core-source vendoring spike): surveying the upstream v4.19.4 tag turned up two compliance questions that **every** core-package vendor will hit again, so they are pinned here instead of being re-decided for each of the remaining 18 packages. Basis: [Phase 1 development plan](./plans/phase1-dev/phase1-plan.md).

| ID | Decision | Basis |
|---|---|---|
| D15 | **Vendoring compliance rules** (the operative reading of D14 clause 3): (a) upstream core packages carry **no `license` field** (19/19; permission comes only from OMO's repository-root `LICENSE.md`), so a vendored copy **must add `"license": "SUL-1.0"` explicitly** — that value records the license actually applicable to the file, it is not self-granted permission, and it is a precondition (necessary, not sufficient — see D16) for `verify-licenses` passing. (b) D14 clause 3's "attribution per vendored file" is applied **literally**: `THIRD_PARTY_NOTICES.md` lists **every file** in the vendored package with its disposition (verbatim / modified / copied-in / project-added); `VENDOR-MANIFEST.json` is the machine-readable layer carrying per-file sha256 for drift detection and does **not** replace the NOTICES attribution. (c) SUL-1.0's "**modified copies**" notice is adopted, placed in **package-level files** (a `NOTICE.md` at the vendored package root, the NOTICES entry, and the manifest's `deviations[]`) — **not** as a header note in every source file, which would push every verbatim file away from upstream and destroy the operability of D14 clause 4 (selective lifts) and of drift detection | Phase 1 planning-stage measurements on the v4.19.4 tag: `packages/hashline-core/package.json` has no license field; the package holds 26 upstream files (23 verbatim + 3 modified); one out-of-package `test-support` import; 6 `bun:test` test files. SUL-1.0 "Notices" second sentence; [license & attribution checklist](./plans/phase1-dev/phase1-license-attribution.md) |

### 2026-09-11 (eighth batch, 1 item)

> Produced by the review of the Phase 1 planning documents: the review empirically checked the plan's tooling claims against the repo and the upstream tag, and found one gate-blocking mis-analysis (the `verify-licenses` name gate) that must be settled by decision before implementation starts. Basis: [Phase 1 development plan](./plans/phase1-dev/phase1-plan.md).

| ID | Decision | Basis |
|---|---|---|
| D16 | **`verify-licenses` SUL name gate extended to the `@oh-my-opencode` scope**: D15 clause 1's required `"license": "SUL-1.0"` addition is necessary but **not sufficient** — `SUL_ALLOWED_NAME` (whole-word `omo`, or `oh-my-openagent`) does **not** match `@oh-my-opencode/*`, so a vendored package keeping its upstream name would be scored a violation even with the field added. (a) Vendored core packages **keep the upstream name** — renaming is rejected: the name is the provenance anchor for drift detection and targeted lifts (D14 clause 4). (b) `SUL_ALLOWED_NAME` gains an `oh-my-opencode` alternative — a whitelist-class change made **by decision** (Roadmap §3 constraint 4, D12 precedent), not the ad-hoc bypass D15 clause 1 forbids. (c) The script change (regex + header comment + test cases) lands with Phase 1 (P1-T9). Applies to all 19 core packages (same scope as D15 clause 4) | Phase 1 plan review: simulated `verify-licenses` run on the planned manifest → `violations: ["@oh-my-opencode/hashline-core@0.1.0: SUL-1.0"]`; `scripts/verify-licenses.mjs` (`SUL_ALLOWED_NAME` L75, name-gated branch L164); existing repo packages pass only via the whole-word `omo` in `omo-agents` and the `MIT` branch of `MIT OR SUL-1.0` |

### Decision details (authoritative wording)

**D7 — DSH pin strategy: pin minor (`0.1.x`)**
During the 0.x phase, breaking changes land in minor bumps (0.1→0.2); under pin-minor, breaking upgrades can only enter via an explicit `scripts/bump-dsh.sh` run (full typecheck + test gate), while patch-level fixes flow automatically. Not pin-patch (rc-phase bugfixes are frequent; locking them out buys nothing) and not dev-head (breaking changes would flow in uncontrolled). Maps to feasibility report §10.2 option A.

**D8 — Commercial boundary**
No sales, and no commercial services / SaaS either — fully exits SUL-1.0's "Use vs Distribute" gray zone (feasibility report §7.2).

**D9 — Windows / WSL**
Out of current scope — no cross-platform e2e; Windows users are blocked until a later scope expansion. Maps to feasibility report §10.4 option B.

**D10 — Third-party attribution**
Respect original authors, full attribution — hashline (concept originating in `oh-my-pi`) etc. fully credited in `THIRD_PARTY_NOTICES.md` / README acknowledgements (feasibility report §11.6); exact wording to be settled at implementation time.

**D11 — MVP scope: adopt the "MVP PRD: Concerto Skeleton"**
Adopts the MVP scope defined in the [MVP PRD](./mvp-prd.md), closing open dimension O8 (feasibility report §10.8): the minimal skeleton = a new run mode "Concerto Mode / 协奏模式 (identifier `concerto`)" + 1 main agent (omo-sisyphus) + 1 subagent (omo-explore) + 1 hook listener + dual model routes (deepseek + pi-ai); the goal is validating assumptions V1–V4 (scratch plugin cold start / per-subagent LLM routing / listener translation pattern / subagent restriction chain) and stepping on landmines early — no real engineering problems solved. OMO core package npm import is NOT merged into the MVP (Q-2 option B) and becomes the immediately following follow-up *(that follow-up is now defined by D14 as git vendoring — the core packages were never on npm; see [Roadmap](./roadmap.md) Phase 1)*. Full scope, acceptance criteria (AC-1–AC-9), and the pitfall-hunting plan (P-1–P-9) are authoritative in the MVP PRD.

**D12 — License whitelist extension: accept MPL-2.0**
The `scripts/verify-licenses` whitelist gains MPL-2.0 on top of the MIT / Apache-2.0 / BSD / ISC / SUL-1.0 (OMO-only) baseline sketched in feasibility report §4.7. Basis: MVP implementation T3 empirically found vite@8.2.1 (a vitest 4 hard dependency) transitively depends on lightningcss@1.33.0, which is MPL-2.0; MPL-2.0 is a file-level weak copyleft and is widely allowed in the industry; lightningcss is only a build tool in the dev chain (transitive via devDependencies) and this project does not distribute it. Should the MPL-2.0 policy tighten in the future, remove the corresponding single line from the script and pin the vite version instead.

**D14 — OMO upstream strategy: freeze the v4.19.4 baseline**
Adopted after the 2026-09-11 v5.0.0-beta survey (evidence: [architecture investigation](./omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md) and [agent-team investigation](./omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md); errata absorbed into feasibility report §16). Authoritative wording:

1. **Frozen baseline.** The OMO semantic and code baseline is frozen at **v4.19.4** (the last v4 release, 2026-08-01). Everything this project has validated against OMO — personas, the hook mapping, the Concerto design — stays anchored there.
2. **No beta tracking, no standing rebase cadence.** The v5.0 beta line (53 tags in 33 days) is not followed. R4's "verify the 1-hour rebase on the first OMO bump" premise is retired as a *goal*: there is no dependency stream to rebase against, because the 19 core packages are `private: true` workspace packages that have never been published to npm (verified 2026-09-11: all 404 on the registry; the published `oh-my-opencode` package exports only a bundled `dist/index.js`).
3. **Import = git vendoring.** When the full port needs OMO source (the former O1 plan), we vendor from a git tag under SUL-1.0: keep `LICENSES/oh-my-openagent.LICENSE.md` verbatim, extend `THIRD_PARTY_NOTICES.md` attribution per vendored file, stay non-commercial (D8). Tag choice at import time: **v5.0.0 stable if it has been released by then** (same effort, no dead codegraph code, current role names), **otherwise v4.19.4** — the core packages we target (team-core / delegate-core / hashline-core / rules-engine / …) are nearly byte-identical between the two, so the choice is low-stakes either way.
4. **Selective targeted lifts.** An upstream fix or capability we concretely need (e.g. a team-mode fallback-wake fix) may be lifted from a newer tag file-by-file at any time — a targeted cherry-pick with attribution, not a version bump.
5. **Awareness, not tracking.** At each of our own release nodes (`scripts/release.sh` runs), read the upstream CHANGELOG once and note anything that invalidates a §16 errata assumption; no weekly sentinel is added for OMO (the existing sentinel watches DSH only, unchanged).
6. **Naming and capability choices follow §16** (v5 role names `plan-consultant` / `plan-reviewer`, `/ulw-execute`, codegraph excluded from the port list, memory/DAG/model-profiles registered as DSH-native-first candidate domains).
7. **O1 is closed by this decision with its framing revised**: "pin strategy for npm import" was premised on a published artifact stream that does not exist; the vendoring policy above replaces it.

**D15 — Vendoring compliance rules (the operative reading of D14 clause 3)**
Adopted during the planning stage of Phase 1 (core-source vendoring spike): surveying the upstream v4.19.4 tag turned up two compliance questions every core-package vendor will hit again, so they are pinned here rather than re-decided for each of the remaining 18 packages (evidence and operating detail: [Phase 1 plan](./plans/phase1-dev/phase1-plan.md) and [license & attribution checklist](./plans/phase1-dev/phase1-license-attribution.md)). Authoritative wording:

1. **The `license` field must be added, and the value is meaningful.** All 19 upstream core packages omit `license` from their `package.json`; permission comes only from OMO's repository-root `LICENSE.md` (SUL-1.0, verified byte-identical in this repo). Two consequences: (a) `scripts/verify-licenses.mjs` scores a package with no license as `MISSING` and counts it in `violations`, so without this addition Phase 1 exit criterion (b) is unreachable; (b) the value written, `"SUL-1.0"`, is not self-granted permission but a **record of the license actually applicable to that file**. Loosening the `verify-licenses` whitelist to get around this is **forbidden** (Roadmap §3 constraint 4). The one whitelist-class change this project does require — extending the checker's SUL **name gate** to `@oh-my-opencode/*`, without which even a correctly added field is still scored a violation — is made **by decision** as D16, not ad-hoc.
2. **Attribution follows D14 clause 3 literally — file by file.** `THIRD_PARTY_NOTICES.md` lists every file in the vendored package with its disposition (`verbatim` / `modified` / `copied-in` / `project-added`), so that file's "attribution" means what D14's wording says. The per-file sha256 in `VENDOR-MANIFEST.json` is a **machine-readable supplement** for drift detection and targeted lifts, and does **not** replace the NOTICES attribution. Where a package's file list makes NOTICES hard to read, the package-level `NOTICE.md` of clause 3 is the relief valve — but the NOTICES per-file entries may **not** be dropped on that account.
3. **SUL-1.0's "modified copies" notice is adopted, placed in package-level files rather than file headers.** OMO's `LICENSE.md` is GitHub's "Sustainable Use License" template (**not** the Functional Source License template); its "Notices" section requires modified copies to carry a prominent notice. This project's copies are modified (a license field must be added, the test framework must be adapted, an out-of-package import must be handled), so every vendored copy must carry a prominent notice. The notice lives in three package-level files: a `NOTICE.md` at the vendored package root, the corresponding `THIRD_PARTY_NOTICES.md` entry, and the manifest's `deviations[]`. It is **expressly not** a "modified by …" note in every source file header — that would push every verbatim file away from upstream and directly destroy the operability of D14 clause 4 (targeted lifts) and of drift detection. For the same reason a modified copy is **not** re-attributed to this project: copyright stays with the original authors; this project declares only that the copy has been modified.
4. **Scope.** This decision applies to **every** OMO core-package vendor (Phase 1 and every phase after it), not only hashline-core.

**D16 — `verify-licenses` SUL name gate extended to the `@oh-my-opencode` scope**
Adopted in the review round of the Phase 1 planning documents (2026-09-11): the review empirically re-ran the plan's `verify-licenses` claims and found a gate-blocking mis-analysis that must be settled before implementation starts. Authoritative wording:

1. **The name gate is real, and the plan had it wrong.** `tokenAllowed('SUL-1.0', '@oh-my-opencode/hashline-core')` evaluates to `false`: `SUL_ALLOWED_NAME` requires a whole-word `omo` or the literal `oh-my-openagent`, and the upstream scope contains neither. The Phase 1 plan's original §4.4 claim that the regex "happens to match `@oh-my-opencode/…`" was false (caught in review; the plan is corrected). A simulated run on the planned manifest produced `violations: ["@oh-my-opencode/hashline-core@0.1.0: SUL-1.0"]` — so D15 clause 1's field addition is necessary but **not sufficient**.
2. **The upstream name is kept.** Renaming a vendored package to satisfy the gate is rejected: the package name is the provenance anchor for drift detection and targeted lifts (D14 clause 4), and Phase 1 has no consumers whose imports would break — but future consumers (Phase 6) benefit from upstream-matching names.
3. **The gate is extended by decision, not by bypass.** `SUL_ALLOWED_NAME` gains an `oh-my-opencode` alternative (matching the whole upstream core-package scope). This is a whitelist-class change and is therefore made here, explicitly, per Roadmap §3 constraint 4 and the D12 precedent — it is not the ad-hoc loosening D15 clause 1 forbids, because it records upstream's actual license situation (root `LICENSE.md` = SUL-1.0, byte-verified) rather than evading a check.
4. **Implementation.** Lands with Phase 1 (task P1-T9): the regex change, a note in the `scripts/verify-licenses.mjs` header comment, and new cases in `tests/omo-agents/verify-licenses.test.ts` pinning `@oh-my-opencode/*` as allowed.
5. **Scope.** All 19 upstream core packages (same scope as D15 clause 4) — the extension is scope-based, so no per-package work recurs.

## Risk dispositions (2026-08-19)

The following risks were confirmed by the user as "accept as-is / defer"; the risk analysis itself is in the feasibility report sections cited:

| ID | Risk | Disposition | Basis |
|---|---|---|---|
| R1 | LLM adapter workload possibly underestimated | Accept as-is; keep the phased strategy (DeepSeek + OpenAI-compatible first, the rest as needed) | §5.1 |
| R2 | DSH has no fallback chain | Accept as-is; thin retry wrapper (30–80 lines / plugin instance) remains an optional mitigation, not committed | §12.5 |
| R3 | 16-week estimate has no buffer | Accept as-is; use as a research-stage estimate, not a commitment (its DSH-pin premise is confirmed as D7) | §2.10 |
| R4 | "1-hour rebase" rests on the thin-listener assumption | ✅ Closed (2026-09-11) → D14 + MVP V3: the standing rebase cadence is retired (no dependency stream to rebase against); the thin-listener assumption itself was already validated as V3 | §4.5 |
| R5 | `args.prompt` trust-boundary gap | Accept as-is; same assumption as OMO — the parent agent is a trusted internal LLM, no untrusted input sources | §13.7.1 |
| R6 | `<plan>` envelope is not a security boundary | Accept as-is | §13.7.2 |

## Open dimensions (pending decision)

| ID | Dimension | Status | Options analysis (feasibility report) |
|---|---|---|---|
| O1 | OMO 19 core packages pin strategy | ✅ Decided → D14 (revised: npm import → git vendoring; baseline frozen at v4.19.4) | §10.1 |
| O2 | DSH self pin strategy | ✅ Decided → D7 | §10.2 |
| O3 | npm package naming | Open | §10.3 |
| O4 | Windows in scope? | ✅ Decided → D9 | §10.4 |
| O5 | Telemetry default state | Open | §10.5 |
| O6 | OMO upstream release notification | ✅ Decided → D13 | §10.6 |
| O7 | Upgrade cadence | ✅ Decided → D13 | §10.7 |
| O8 | Capability scope: MVP vs. follow-up split | ✅ Decided → D11 | §10.8 |

## Decision history

- **2026-08-16**: D1–D6 confirmed.
- **2026-08-19**: D7–D10 and R1–R6 confirmed; all decision records migrated from the feasibility report (former §10.1 / §5.4) into this document. The feasibility report is now purely the research basis (its §10 keeps only the open-dimension options analysis).
- **2026-08-19**: D11 confirmed ([MVP PRD](./mvp-prd.md) adopted, including Q-1–Q-4 resolutions); open dimension O8 closed.
- **2026-08-19**: D12 confirmed (license whitelist accepts MPL-2.0; triggered by the empirical finding in MVP implementation T3).
- **2026-08-29**: DSH 0.1.2-alpha.1 review registered ([English](./archived/dsh-0.1.2-review.md) / [中文](./archived/dsh-0.1.2-review_zh-CN.md)); no new decision — the rc.6 → 0.1.2-alpha.1 pin bump proceeds under D7's deliberate-bump mechanism and is tracked in PRD §12; the SubagentProvider extension-path facts are registered as research sediment in the feasibility report's 2026-08-29 follow-up note.
- **2026-09-05**: D13 confirmed (version management & release process — three-party matrix, tag convention, local-first test layering, release automation, weekly sentinel); open dimensions O6/O7 closed.
- **2026-09-10**: DSH 0.1.5-rc.1 review registered ([`dsh-0.1.5-rc.1-review.md`](./dsh-0.1.5-rc.1-review.md)); **no new decision** — the rc.6 → 0.1.5-rc.1 pin bump proceeds under D7's deliberate-bump mechanism and is tracked in PRD §12, which the review's findings rewrote. The review's one P0 (`@deepseek-ai/dsh-persona`'s `text:` → `prefix:` rename, landed at `dsh-v0.1.3-alpha.2`) is a **breaking** config change that the repo's own gates scored green against, which re-opens the L3 gate's coverage as an implementation item rather than a decision. Two side effects worth recording here: (1) **Q-3's dual-provider pairing is now a per-deployment choice, not a fixed one** — a deployment that does not write the `llm-pi-ai.providers` section pins the explore seat to `deepseek-official` via the documented `OMO_EXPLORE_PROVIDER` override, while the repo default stays pi-ai; the AC-5 requirement (two *distinct* pairs) holds either way, since distinctness is judged on provider+model together. (2) **P-1.3's premise is retired** — `composeProfile` no longer force-patches the `agent-presets` row's `roots` (removed in 0.1.5-rc.1), so a config-declared preset root is a live mechanism again; the caveat is that the shipped root now *precedes* configured roots, making first-root-wins per id the thing to check before relying on it.
- **2026-09-11**: D14 confirmed (OMO upstream strategy — freeze the v4.19.4 baseline, no beta tracking, import = git vendoring under SUL-1.0, selective targeted lifts, awareness-only changelog reading at our release nodes); open dimension **O1 closed with its framing revised** (the 19 core packages are `private: true` and were never on npm, so "npm import" is replaced by vendoring); the full v5.0.0-beta survey is preserved as two investigation reports ([architecture](./omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md), [agent teams](./omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md)) and absorbed as errata in feasibility report §16; the development direction under the frozen baseline is formalized in the [Roadmap](./roadmap.md).
- **2026-09-11 (later the same day)**: D15 confirmed (vendoring compliance rules — upstream core packages have no `license` field, so a vendored copy must add `SUL-1.0` explicitly; D14 clause 3's "attribution per vendored file" is applied at **file** granularity; SUL-1.0's "Notices" clause is met by a **package-level** "modified" notice, not by header notes in source files). Trigger: Phase 1 planning-stage measurements on the upstream v4.19.4 tag. **Implementation status**: Phase 1 itself (landing the vendored files, CI wiring, exit criteria a–g) has **not started** — this batch lands the decision and the planning documents only.
- **2026-09-11 (review round)**: D16 confirmed (`verify-licenses` SUL name gate extended to the `@oh-my-opencode` scope — D15 clause 1's field addition turned out necessary but **not sufficient**; the upstream name is kept; the gate extension is made by decision, per the D12 precedent, not as a bypass). The same review round corrected the planning documents: the verbatim/deviation accounting is unified as **23 verbatim / 3 modified / 1 copied-in / 2 project-added** (vendored tree 29 files, NOTICES 29 rows, manifest `deviations[]` 6 entries), and a **fourth integration point** was added — the root `tsconfig.json` must exclude vendored test files, otherwise gate 1 (`pnpm typecheck`) compiles the 6 `bun:test` files and fails. **Implementation status**: unchanged — Phase 1 has not started.

---

**中文版**：[`decisions_zh-CN.md`](./decisions_zh-CN.md)

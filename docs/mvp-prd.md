# MVP PRD: Concerto Skeleton

> Primary document (English). Chinese version: [MVP PRD（中文）](./mvp-prd_zh-CN.md).
>
> This document defines the **Minimum Viable Product (MVP)** scope of oh-my-opendsh. Research basis: [Feasibility Report](./feasibility-report.md); project decisions: [Decision Record](./decisions.md). This PRD was adopted on 2026-08-19 and registered as decision **D11** (open dimension O8, "Capability surface: MVP vs. follow-up split", closed thereby).

---

## 1. Document Positioning

**What this document is**
- The MVP's **Product Requirements Document (PRD)**: defines the minimal skeleton's scope, acceptance criteria, test strategy, and pitfall-hunting plan
- A **concrete proposal** for open dimension O8 (report §10.8): carving an MVP subset out of the 12 capability areas in §8

**What this document is not**
- Not an implementation plan / schedule commitment (the §10 estimates are spike estimates, not commitments)
- Not the scope definition of the full port (see report §2.10, ~16 weeks)
- It solves no real engineering problem — the MVP's sole purpose is to **validate feasibility and step on landmines early**

### 1.1 Mapping to the report §8 capability areas (the O8 proposal)

Report §10.8 states: how the 12 capability areas in §8 split into MVP / follow-up is an open decision, and the decision belongs to the user. This PRD is that split's proposal:

| §8 capability area | This MVP | Notes |
|---|---|---|
| #1 Cold start | ✅ In | AC-1 |
| #2 Agent presets | ✅ In (1+1, not 11) | FR-3 / FR-4 |
| #3 Hook listeners | ✅ In (exactly 1, not 30+) | FR-6 |
| #4 Slash commands | ❌ follow-up | |
| #5 MCP servers | ❌ follow-up | |
| #6 Team Mode | ❌ follow-up | |
| #7 Hashline edit | ❌ follow-up | |
| #8 E2E smoke | ✅ In (minimal form: mock e2e + dummy scenario) | AC-4 / AC-7 |
| #9 Bump scripts | ❌ follow-up | No OMO import by default in the MVP, so nothing to bump; introduced together with the import-validation follow-up immediately after the MVP (Q-2 resolved → D11) |
| #10 License hygiene | ✅ In | FR-1 / AC-8 |
| #11 Documentation | ✅ Partially in (pitfall records + this PRD; the 8 full docs are follow-up) | AC-9 |
| #12 CI | ✅ In (minimal green set) | §8 of this document |

Two deliberate differences from the §10.8 research-phase draft: ① #9 moves out of "must" (no import → nothing to bump); ② a minimal form of #8 is pulled forward from "follow-up" (validation is the very purpose of this MVP).

---

## 2. Background and Goals

The feasibility report (Summary, conclusion 1) judges this project "highly feasible," but several key assumptions **have never been verified at runtime** — all research evidence comes from reading source code and test fixtures (§12.7, §13.10, §14.10 all state this limitation). The MVP's mission: pin these assumptions down with the cheapest possible skeleton before committing 16 weeks.

### 2.1 Three goals (equal priority)

| # | Goal | Notes |
|---|---|---|
| G1 | **Validate core feasibility assumptions** | See V1–V4 in §3. If any is falsified, the 16-week estimate and architecture direction must be re-examined |
| G2 | **Step on landmines early** | Deliberately hit DSH 0.1.0-rc.5's unstable surfaces and record every pitfall in `docs/mvp-pitfalls.md` (a **formal deliverable**, not a byproduct) |
| G3 | **Establish a sustainable engineering skeleton** | Repo structure, license hygiene, and the base of the test pyramid (mock-LLM e2e + doctor-lite) done right once; the following 16 weeks grow on top of it |

### 2.2 Explicit non-goals

- ❌ Solving real engineering problems (the demo scenario is a scripted dummy task)
- ❌ Porting the remaining 10 agents / Team Mode / MCPs / hashline / slash commands
- ❌ Performance tuning, production readiness, Windows support (decision D9)
- ❌ Any PR to DSH or OMO upstream (decision D5)

---

## 3. Core Assumptions Under Test (the MVP's "exam questions")

| # | Assumption | Research basis | If falsified |
|---|---|---|---|
| V1 | **Scratch plugin path works**: `dsh --patch ./cordis.yml` loads our plugin with zero DSH modification and cold-starts to idle | Summary conclusion 2; §4.3 | The entire physical form (D1/D2) is re-examined |
| V2 | **Per-subagent LLM routing works**: two agents run on different `{provider, model}` routes, observable in the session log | §12 (§12.7 admits "no runtime test was run; a smoke test under our own plugin is recommended before MVP sign-off") | OMO's core value — "the right model for the right job" — requires new infrastructure on DSH; workload re-estimated |
| V3 | **The listener translation pattern works**: one DSH event listener achieves intercept/inject semantics (85% of future hook porting depends on this pattern) | §2.2; §13.8 | The hook-porting cost model ("1-hour rebase", R4) breaks; a new approach is needed |
| V4 | **The subagent restriction chain works**: toolFilter (read-only) + depth cap (no nested delegation) behave as expected | §13.5.1 / §13.6.1; §12.5 | Multi-agent safety boundaries must be self-built; Team Mode port cost (3 weeks) revised upward |

---

## 4. Run Mode Design: Concerto Mode

### 4.1 Positioning

DSH officially ships 4 run modes: **Standard / PTC / Minimal / Creative**. All four (judging by naming and official positioning) are variations of a "**single-agent direct answer**" posture — they differ in capability sets and sampling styles, not in *who does the work*.

**Concerto Mode** is the 5th mode, and the first with an "**orchestration-first**" posture:

> The main agent is not the worker — it is the conductor. On receiving a task it first asks "who is best suited for this", and delegates by default to subagents carrying their own model routes. The right model for the right job — by default, not by luck.

This is the direct expression of the project's founding belief (README "Why This Project": "don't bet on a single model") at the run-mode level.

### 4.2 Comparison with the official 4 modes

| Mode | Posture | Main agent | Model routing | Delegation |
|---|---|---|---|---|
| Standard | Single-agent, all-purpose direct answer | Default agent | Single route | Not default |
| PTC | Single-agent, procedural direct answer | Default agent | Single route | Not default |
| Minimal | Single-agent, bare-capability direct answer | Trimmed agent | Single route | None |
| Creative | Single-agent, high-divergence direct answer | Default agent (sampling raised) | Single route | Not default |
| **Concerto (this MVP)** | **Orchestration-first** | **omo-sisyphus (conductor)** | **Independent `{provider, model}` per agent** | **Delegates to omo-explore by default** |

Note: the exact internal semantics of the official 4 modes are as implemented in DSH v0.1.0-rc.5; this table commits only to "how Concerto differs from them", not to a precise description of the 4 modes' internals. Verify and revise this table during implementation (associated work of pitfall P-1).

### 4.3 Naming

- **Chinese**: 协奏模式; **English**: Concerto Mode; **mode identifier (proposal)**: `concerto`
- Metaphor: a concerto = soloist (main agent) + orchestra (subagent ensemble). The MVP's 1+1 is the smallest possible ensemble, and the concept scales losslessly to the full 11-agent orchestra
- Alternatives (not adopted, recorded for reference): `Sisyphus Mode` (pays homage to OMO but is not self-explanatory), `Orchestrated Mode` (accurate but bland), `Team Mode` (collides with OMO Team Mode, a specific later feature)

### 4.4 Activation and technical composition

**Activation (requirement, not implementation detail)**: the user can select Concerto Mode through an entry point equal to the official 4 modes (CLI flag / interactive selector, subject to DSH's actual mode-registration mechanism).

> ⚠️ **This is the first pitfall to hit (P-1)**: whether DSH 0.1.0-rc.5 allows a scratch plugin to register a new run mode was not covered by the research. If the official mode registry is closed/built-in, the fallback is: an `omo` profile + a `dsh --patch ./cordis.yml` launch script, with full evidence of "mode registration not open" recorded in `docs/mvp-pitfalls.md`. This fallback does not affect the validation of V1–V4.

**Concerto Mode = an assembly of these five parts**:

| # | Component | Content |
|---|---|---|
| 1 | `omo-sisyphus` agent preset | Minimal conductor persona (local markdown system sections: role + delegation discipline + Hard Blocks) |
| 2 | `omo-explore` subagent preset | Read-only retriever persona (same selection as OMO's `call_omo_agent` allow-list: explore is the subagent OMO itself deems safest, §13.3.2) |
| 3 | Delegation tool | One `dsh-tool-subagent` instance bound to explore, mounted into sisyphus's toolset (§12.4 binding form A: static plugin config) |
| 4 | Dual model routes | sisyphus and explore each hold a distinct `{provider, model}` pair, using DSH's built-in adapters (`dsh-llm-deepseek` + `dsh-llm-pi-ai`); concrete model ids live in config, not hardcoded |
| 5 | 1 hook listener | `agent/pre-step` + `agent.inject()`: injects the Hard Blocks / Anti-Patterns sections into the subagent system prompt (validates V3; content from local markdown, OMO attribution recorded in `THIRD_PARTY_NOTICES.md`) |

---

## 5. Functional Requirements

| # | Requirement | Acceptance link |
|---|---|---|
| FR-1 | **Repo & license skeleton**: standalone `oh-my-opendsh/` scratch plugin repo; `package.json` declares `"license": "MIT OR SUL-1.0"`; `LICENSES/oh-my-openagent.LICENSE.md` included verbatim; full attribution in `THIRD_PARTY_NOTICES.md` (decisions D6/D10); `cordis.yml` entry point | AC-1, AC-8 |
| FR-2 | **Concerto Mode activatable**: the new mode entry exists at the same level as the official 4 modes (or the §4.4 fallback is executed and the pitfall recorded) | AC-2 |
| FR-3 | **omo-sisyphus preset registered**: system prompt assembled from local markdown sections (role / delegation discipline / Hard Blocks), snapshot-assertable | AC-3 |
| FR-4 | **omo-explore subagent registered**: read-only toolFilter (write-class tools denied); nested delegation forbidden (depth cap = 1, verifying pass-through to DSH `policy.maxDepth`) | AC-4, AC-6 |
| FR-5 | **Dual model routing**: the two agents run on different `{provider, model}` routes, each route observable in the session log | AC-5 |
| FR-6 | **Hard Blocks injection hook**: one `agent/pre-step` listener performs the injection; the injected sections are visible in the subagent system prompt snapshot | AC-3, AC-6 |
| FR-7 | **Demo scenario script**: a scripted dummy retrieval task (e.g., "what does this repo's README say") drives the full sisyphus → explore → answer chain; solves no real engineering problem | AC-4 |
| FR-8 | **Validation toolchain**: mock-LLM e2e (replicating the §14 L2 pattern) + doctor-lite (3–5 checks) + the `docs/mvp-pitfalls.md` pitfall-recording template | AC-7, AC-9 |

---

## 6. Out of Scope (explicitly not doing)

| Item | Destination |
|---|---|
| The remaining 10 agents (hephaestus / oracle / librarian / metis / momus / atlas / multimodal-looker / sisyphus-junior / prometheus / full sisyphus) | follow-up |
| Team Mode (lead + N members + web visualization) | follow-up (report §2.5, 3 weeks) |
| MCPs (LSP / ast-grep / codegraph / git-bash / web) | follow-up |
| hashline edit | follow-up |
| slash commands (ultrawork / ulw / team / hyperplan / search) | follow-up |
| OMO 19 core packages via npm import | **NOT in the MVP** (Q-2 resolved → D11): MVP defaults to local markdown + attribution; import-chain validation is the first follow-up immediately after the MVP |
| Real engineering task driving | Never part of this MVP |
| Windows / WSL | Settled by decision D9 |
| Performance / token cost optimization | follow-up |

---

## 7. Acceptance Criteria

| # | Criterion | Verification | Assumption |
|---|---|---|---|
| AC-1 | `dsh --patch ./cordis.yml` (or the Concerto Mode entry) cold-starts to idle with no plugin load errors in the log | cold-start script + log inspection | V1 |
| AC-2 | Concerto Mode appears in the mode selection entry (or the fallback path is documented + the pitfall recorded) | manual verification + pitfall record | V1 |
| AC-3 | sisyphus system prompt snapshot contains: conductor role + delegation discipline + injected Hard Blocks sections | snapshot test (`DSH_SNAPSHOT=record` mode, report §4.6) | V3 |
| AC-4 | Dummy demo scenario passes end-to-end: session log shows sisyphus invoking the delegation tool → explore runs → result returns → sisyphus summarizes | mock-LLM e2e + one real-model manual run | V1 |
| AC-5 | The `{provider, model}` pairs of sisyphus and explore are observable in the session log and **differ** | e2e assertion on logged routes | V2 |
| AC-6 | explore's write attempts are denied (toolFilter effective); explore's attempt to delegate further is denied (depth cap effective) | negative e2e assertions | V4 |
| AC-7 | mock-LLM e2e produces `{"result":"PASS"}` in CI at zero LLM cost | CI job | V1–V4 |
| AC-8 | `scripts/verify-licenses.sh` passes; attribution complete | CI job | — |
| AC-9 | `docs/mvp-pitfalls.md` records at least 1 real pitfall, each with: symptom / evidence / root cause / fallback | document review | G2 |

**Sign-off condition**: AC-1 through AC-9 all green, and each of V1–V4 receives a "validated / falsified + impact assessment" verdict, written into the MVP closeout record (end of `docs/mvp-pitfalls.md` or a standalone closeout section).

---

## 8. Test Strategy

Replicate the **minimal subset** of the four-layer pyramid from report §14 (§14.8: "patterns are reusable; paths and OMO-specific assertions are not"):

| Layer | MVP approach | Source |
|---|---|---|
| L2 mock-LLM e2e (core) | ~200 LoC OpenAI-compatible mock server (scripted MockSteps: text / tool_call / hang); 1 scenario driver covering AC-4/5/6; observation channel = DSH session JSONL + shared-directory assertion files; sandboxed HOME/XDG (replicating the `drive.mjs` pattern) | §14.4 / §14.5 / §14.8 |
| L3 doctor-lite | 3–5 checks: `dsh --version` exists and is the pinned 0.1.x (D7); cordis.yml parses; both LLM adapters registered; subagent instance config valid. `--json` output, exit 1 on fail | §14.6 |
| L4 real-model manual smoke | 1 manual run (not a CI gate): real provider keys + dummy scenario, human-verified AC-4/5; cost <$1 | §14.7 |
| L1 unit | Only covers glue code we write (system section assembly, config parsing) | §14.3.1 |
| License check | `scripts/verify-licenses.sh` in CI | §4.7 |

Explicitly not doing: performance benchmarks, adversarial/red-team testing, Web UI visual regression (same exclusions as §14.9).

---

## 9. Anticipated Pitfall List (validation plan)

Each item is hit during implementation and recorded in `docs/mvp-pitfalls.md`; the "if the assumption fails" column is the fallback plan.

| # | Candidate pitfall | Assumption | If the assumption fails |
|---|---|---|---|
| P-1 | **Run-mode registration openness**: does DSH 0.1.0-rc.5 allow a scratch plugin to register a 5th run mode | The mode registry is extensible via official extension points | Degrade to profile + `--patch` launch script; record pitfall; Concerto semantics unaffected |
| P-2 | **`agentOptions` routing effective**: the `agentOptions.{provider,model}` of a `dsh-tool-subagent` instance config actually overrides parent inheritance at runtime (§12.7 admits no runtime verification) | Effective and observable in logs | V2 falsified; escalate as a DSH-side gap; evaluate a self-written wrapper |
| P-3 | **`agent/pre-step` waterfall semantics**: listener registration order, authoritative reject/inject behave as documented | As described in `docs/architecture.md` | V3 partially falsified; switch to another mount point and re-estimate hook porting cost |
| P-4 | **toolFilter field semantics**: field name/semantics match expectations | Match | Use the equivalent mechanism it provides; record pitfall |
| P-5 | **depth cap default**: `policy.maxDepth` default and pass-through behavior | Configurable and effective | Declare explicitly; if ineffective, V4 falsified |
| P-6 | **Dual-target build**: our plugin builds/loads cleanly under both `build:lib:host` and `build:lib:client` targets | Clean | Adjust tsconfig/build boundaries; record pitfall |
| P-7 | **Observability**: does the session log record the child agent's resolved route (AC-5 depends on it) | Recorded | Add our own log listener; record pitfall (also an empirical check of §2.9 "model-visible means logged") |
| P-8 | **cordis.yml schema**: scratch plugin config schema validation details | Docs match implementation | Fix per actual errors; record pitfall |
| P-9 | **Config schema compatibility** (same class as omo-senpi's pitfall, report §11.4 issue #6794): path resolution of local markdown/config loading under the DSH event flow | No path/parsing pitfalls | Fix the loading approach; record pitfall |

---

## 10. Milestones and Workload (spike estimates, not commitments)

| Milestone | Content | Estimate |
|---|---|---|
| M1 Skeleton | FR-1 (repo / license / cordis.yml cold start) + hitting P-1/P-8 | ~2 days |
| M2 Mode & main agent | FR-2 / FR-3 (Concerto Mode + sisyphus preset) + P-6 | ~2 days |
| M3 Delegation chain | FR-4 / FR-5 / FR-6 (explore + dual routes + hook) + P-2/P-3/P-4/P-5/P-7 | ~4 days |
| M4 Validation & closeout | FR-7 / FR-8 (mock e2e + doctor-lite + real-model smoke + pitfall doc + V1–V4 verdicts) | ~2 days |
| **Total** | | **~2 weeks (one person)** |

---

## 11. Open Questions (✅ all resolved 2026-08-19)

| # | Question | Options | Resolution (2026-08-19) |
|---|---|---|---|
| Q-1 | Adopt the mode name "Concerto / 协奏"? | A. Concerto / B. Sisyphus / C. Orchestrated / D. other | ✅ **Adopted A**: named "协奏模式 / Concerto Mode", mode identifier `concerto` |
| Q-2 | Merge "import 1 minimal OMO core package (validating the npm import + dual license + typecheck chain)" into the MVP? | A. Merge (+1~2 days) / B. Leave as the immediate follow-up | ✅ **Adopted B**: not merged; the MVP stays minimal, import-chain validation becomes the immediately following follow-up |
| Q-3 | The two providers for the real-model smoke run | A. deepseek + pi-ai (DSH built-in) / B. other combination | ✅ **Adopted A**: deepseek + pi-ai, zero new LLM adapter work |
| Q-4 | After PRD adoption, register decision D11 to close O8? | A. Yes / B. Discuss further | ✅ **Adopted A**: this PRD is adopted and registered as decision D11; open dimension O8 closed |

All four resolutions are registered in the [decision record](./decisions.md) (D11).

---

## 12. After the MVP (connection to the full port)

At MVP closeout, the V1–V4 verdicts directly determine follow-up ordering:

- **All of V1–V4 validated** → proceed to the full port per report §2.10 (OMO core import → remaining agents → batch hook translation → Team Mode → …)
- **Any V falsified** → register a new risk (R7+) in the decision record, re-estimate the affected workload blocks, then decide direction
- All MVP artifacts are retained and grow: repo skeleton → full patch framework; mock e2e → the full L2 layer; doctor-lite → the full doctor; `mvp-pitfalls.md` → a continuously accumulating pitfall knowledge base
- [ ] **DSH pin bump 0.1.0-rc.6 → 0.1.2-alpha.1** (deliberate bump under D7) — surfaces: `.github/workflows/ci.yml:37` (+ comment :14-21), `scripts/doctor-lite.mjs:189`, `scripts/doctor-lite-core.ts:26`, `tests/omo-agents/doctor-lite.test.ts` fixtures+expectations; re-derive `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml` against the moved shipped preset (`packages/preset/agent-presets/presets/standard/agent.cordis.yml`); re-run `scripts/ci-local.sh` + out-of-session probes; re-verify P-1.2/P-1.3 fallbacks under the refactored preset subsystem. The rc.6 citations in patch comments (`patches/omo-dsh/omo-agents/src/explore-prompt.ts:8`, `.../hard-blocks-injection.ts:7`) stay as historical rc.6-era verification records; the 0.1.2 re-verification is recorded in mvp-pitfalls P-11. Registered from the dsh 0.1.2 review ([English](./dsh-0.1.2-review.md) / [中文](./dsh-0.1.2-review_zh-CN.md)) §4. **Status 2026-08-29: BLOCKED on npm publish** — `@deepseek-ai/dsh@0.1.2-alpha.1` exists only as a git tag (registry tops at `0.1.1-rc.2`); the concerto preset was re-derived (a9049b5) and the full gate + probe chain verified GREEN locally against a source build of the tag plus the rc.6 pin (evidence `.omo/evidence/task-{7,8,9}-dsh-012-review-sync.log`); the harness is now transport-adaptive for both runtimes (ad3acf5, ed2f1a2). Unblock: `npm view @deepseek-ai/dsh versions` shows `0.1.2-alpha.1` → flip `DSH_VERSION` in `.github/workflows/ci.yml` (+ comment :14-21) and refresh the doctor-lite strings/fixtures.

---

**中文版**: [`mvp-prd_zh-CN.md`](./mvp-prd_zh-CN.md)

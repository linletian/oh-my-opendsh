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

- **D#** (D1–D12): confirmed decisions
- **R#** (R1–R6): risk dispositions (accept as-is / defer)
- **O#** (O1–O8): open dimensions (O2 / O4 / O8 have since become decisions)
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
| D6 | Upgrade method: Plan B (dual license + directly import OMO source) | §7.3 / §7.4 |

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
Adopts the MVP scope defined in the [MVP PRD](./mvp-prd.md), closing open dimension O8 (feasibility report §10.8): the minimal skeleton = a new run mode "Concerto Mode / 协奏模式 (identifier `concerto`)" + 1 main agent (omo-sisyphus) + 1 subagent (omo-explore) + 1 hook listener + dual model routes (deepseek + pi-ai); the goal is validating assumptions V1–V4 (scratch plugin cold start / per-subagent LLM routing / listener translation pattern / subagent restriction chain) and stepping on landmines early — no real engineering problems solved. OMO core package npm import is NOT merged into the MVP (Q-2 option B) and becomes the immediately following follow-up. Full scope, acceptance criteria (AC-1–AC-9), and the pitfall-hunting plan (P-1–P-9) are authoritative in the MVP PRD.

**D12 — License whitelist extension: accept MPL-2.0**
The `scripts/verify-licenses` whitelist gains MPL-2.0 on top of the MIT / Apache-2.0 / BSD / ISC / SUL-1.0 (OMO-only) baseline sketched in feasibility report §4.7. Basis: MVP implementation T3 empirically found vite@8.2.1 (a vitest 4 hard dependency) transitively depends on lightningcss@1.33.0, which is MPL-2.0; MPL-2.0 is a file-level weak copyleft and is widely allowed in the industry; lightningcss is only a build tool in the dev chain (transitive via devDependencies) and this project does not distribute it. Should the MPL-2.0 policy tighten in the future, remove the corresponding single line from the script and pin the vite version instead.

## Risk dispositions (2026-08-19)

The following risks were confirmed by the user as "accept as-is / defer"; the risk analysis itself is in the feasibility report sections cited:

| ID | Risk | Disposition | Basis |
|---|---|---|---|
| R1 | LLM adapter workload possibly underestimated | Accept as-is; keep the phased strategy (DeepSeek + OpenAI-compatible first, the rest as needed) | §5.1 |
| R2 | DSH has no fallback chain | Accept as-is; thin retry wrapper (30–80 lines / plugin instance) remains an optional mitigation, not committed | §12.5 |
| R3 | 16-week estimate has no buffer | Accept as-is; use as a research-stage estimate, not a commitment (its DSH-pin premise is confirmed as D7) | §2.10 |
| R4 | "1-hour rebase" rests on the thin-listener assumption | Defer; verify empirically on the first OMO bump after the project starts | §4.5 |
| R5 | `args.prompt` trust-boundary gap | Accept as-is; same assumption as OMO — the parent agent is a trusted internal LLM, no untrusted input sources | §13.7.1 |
| R6 | `<plan>` envelope is not a security boundary | Accept as-is | §13.7.2 |

## Open dimensions (pending decision)

| ID | Dimension | Status | Options analysis (feasibility report) |
|---|---|---|---|
| O1 | OMO 19 core packages pin strategy | Open | §10.1 |
| O2 | DSH self pin strategy | ✅ Decided → D7 | §10.2 |
| O3 | npm package naming | Open | §10.3 |
| O4 | Windows in scope? | ✅ Decided → D9 | §10.4 |
| O5 | Telemetry default state | Open | §10.5 |
| O6 | OMO upstream release notification | Open | §10.6 |
| O7 | Upgrade cadence | Open | §10.7 |
| O8 | Capability scope: MVP vs. follow-up split | ✅ Decided → D11 | §10.8 |

## Decision history

- **2026-08-16**: D1–D6 confirmed.
- **2026-08-19**: D7–D10 and R1–R6 confirmed; all decision records migrated from the feasibility report (former §10.1 / §5.4) into this document. The feasibility report is now purely the research basis (its §10 keeps only the open-dimension options analysis).
- **2026-08-19**: D11 confirmed ([MVP PRD](./mvp-prd.md) adopted, including Q-1–Q-4 resolutions); open dimension O8 closed.
- **2026-08-19**: D12 confirmed (license whitelist accepts MPL-2.0; triggered by the empirical finding in MVP implementation T3).

---

**中文版**：[`decisions_zh-CN.md`](./decisions_zh-CN.md)

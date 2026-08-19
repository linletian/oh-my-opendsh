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

- **D#** (D1–D10): confirmed decisions
- **R#** (R1–R6): risk dispositions (accept as-is / defer)
- **O#** (O1–O8): open dimensions (O2 / O4 have since become decisions)
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

### Decision details (authoritative wording)

**D7 — DSH pin strategy: pin minor (`0.1.x`)**
During the 0.x phase, breaking changes land in minor bumps (0.1→0.2); under pin-minor, breaking upgrades can only enter via an explicit `scripts/bump-dsh.sh` run (full typecheck + test gate), while patch-level fixes flow automatically. Not pin-patch (rc-phase bugfixes are frequent; locking them out buys nothing) and not dev-head (breaking changes would flow in uncontrolled). Maps to feasibility report §10.2 option A.

**D8 — Commercial boundary**
No sales, and no commercial services / SaaS either — fully exits SUL-1.0's "Use vs Distribute" gray zone (feasibility report §7.2).

**D9 — Windows / WSL**
Out of current scope — no cross-platform e2e; Windows users are blocked until a later scope expansion. Maps to feasibility report §10.4 option B.

**D10 — Third-party attribution**
Respect original authors, full attribution — hashline (concept originating in `oh-my-pi`) etc. fully credited in `THIRD_PARTY_NOTICES.md` / README acknowledgements (feasibility report §11.6); exact wording to be settled at implementation time.

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
| O8 | Capability scope: MVP vs. follow-up split | Open | §10.8 |

## Decision history

- **2026-08-16**: D1–D6 confirmed.
- **2026-08-19**: D7–D10 and R1–R6 confirmed; all decision records migrated from the feasibility report (former §10.1 / §5.4) into this document. The feasibility report is now purely the research basis (its §10 keeps only the open-dimension options analysis).

---

**中文版**：[`decisions_zh-CN.md`](./decisions_zh-CN.md)

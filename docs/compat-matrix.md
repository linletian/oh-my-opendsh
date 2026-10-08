# Compatibility Matrix

> Machine-rendered from [`.omo/compat.yaml`](../.omo/compat.yaml) — the single source of truth. Do not hand-edit this file: edit the YAML, then run `node scripts/render-compat-matrix.mjs` — the docs-consistency gate and `scripts/release.sh` re-render automatically.

## Three parties

| Party | Role | Version source | How it is probed |
|---|---|---|---|
| **our** — `oh-my-opendsh` | what we ship | git tags `vX.Y.Z` (immutable) + moving alias `vX.Y` (what the installer pins) | every release = one new ✅ row |
| **dsh** — `@deepseek-ai/dsh` | the runtime we run on | npm registry / git tags `dsh-v*` | locally via `scripts/compat-probe.sh` + weekly `compat-probe` workflow opens an issue |
| **omo** — `oh-my-openagent` | architecture blueprint (conductor/explore semantics) | npm registry | awareness only: weekly workflow flags new versions for review (no runtime coupling) |

Status legend: ✅ tested · 🔬 untested · ❌ broken · 🪦 dropped.
**Release gate: the row a release is made on must be ✅.**

## Tested combinations

| our | dsh | omo | date | evidence (local file) |
|---|---|---|---|---|
| unreleased | 0.2.0-rc.2 | 4.19.4 | 2026-10-06 | `CI run 37476903377 — commit 2323658 — 8/8 gates green on dsh 0.2.0-rc.2 (D7-pin install with frozen transitive tree / typecheck / unit tests / mock-LLM e2e / doctor-lite / license / concerto-static / docs-consistency / session-free proofs — per-gate sub-counts live in that run's own log, NOT here: they rot the moment a check is added — docs-consistency gained d10 in PR #12, and this string's 'docs 9-9' went stale the same day; task book 四之二十二); local T13 re-run: .omo/evidence/p45t13/T13-cleanup.md` |
| 0.2.1 | 0.1.5-rc.1 | 4.19.4 | 2026-09-10 | `.omo/evidence/concerto-verify-dsh-0.1.5-rc.1.md` |
| 0.2.0 | 0.1.5-rc.1 | 4.19.4 | 2026-09-10 | `.omo/evidence/concerto-verify-dsh-0.1.5-rc.1.md` |
| 0.1.1 | 0.1.0-rc.6 | 4.19.4 | 2026-09-04 | `.omo/evidence/concerto-current-dsh-verify.md` |
| 0.1.0 | 0.1.0-rc.6 | 4.19.4 (architecture reference) | 2026-09-04 | `.omo/evidence/concerto-current-dsh-verify.md` |

> unreleased — P4.5 cutover combination, tested on the develop line: the register() outlet + declarative installer face replaced the deleted .agent-presets file discovery (the static review docs/dsh-0.2.0-rc.2-review.md is superseded by runtime evidence), ctx.jobs moved to events.subscribe, session-log v4 envelope parsed by the e2e driver. 0.1.x compatibility is DROPPED (ruling D17, commit 2323658) — this row is the non-regression signal of record: green CI on 0.2.0-rc.2 replaces green CI on 0.1.5-rc.1
> 0.2.1 — released v0.2 (release.sh)
> 0.2.0 — released 0.2.0 (v0.2 line; release.sh upgraded the develop row in place) — L2 real-model manual verification (17/17 from raw session logs) + L1 green (104 unit / doctor-lite 4-4 with 16 rows schema-checked / static 10-10 / docs 7-7 / e2e 4-4) — the 2026-09-10 upgrade. Verified on the released installer path (static preset in $DSH_HOME/.agent-presets, no plugin). Note: toolFilter/maxDepth are tool-layer guardrails, not a capability boundary — S3/S4 were bypassed through the explore child's own bash and ACCEPTED under the R5 threat model (mvp-pitfalls §8 P-21)
> 0.1.1 — released v0.1 (release.sh)
> 0.1.0 — current-DSH runtime re-verification: concerto_verify 22/22 PASS

## Untested (registered, awaiting probe)

| dsh | omo | since | note |
|---|---|---|---|
| 0.1.2-rc.1 | 4.19.4 | 2026-09-05 | static review done (docs/archived/dsh-0.1.2-review); runtime probe pending via scripts/compat-probe.sh; gates the D7 CI pin flip (PRD §12) — SUPERSEDED by 0.1.5-rc.1, retained as the historical record |

## How to update

1. Edit `.omo/compat.yaml` (probe passed → add a `tested` row; upstream published a new version → add `untested` rows; the weekly workflow will remind you).
2. Run `node scripts/render-compat-matrix.mjs`.
3. Full process: [release process](./release-process.md) / [发布流程](./release-process_zh-CN.md)

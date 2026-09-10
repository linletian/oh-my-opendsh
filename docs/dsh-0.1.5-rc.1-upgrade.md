# DSH 0.1.5-rc.1 pin upgrade — verification record

> **Hand-written verification record, so it lives in `docs/`** — per the
> `docs/` vs `.omo/` layout rule (`docs/release-process.md` §3, `.omo/README.md`):
> human-readable reports belong here; `.omo/` holds machine artifacts only. The
> machine-checked companion is the per-row evidence file
> `.omo/evidence/concerto-verify-dsh-0.1.5-rc.1.md`, which `check-l2-evidence`
> reads through the compat matrix.

> Date: 2026-09-10 · Runtime: `@deepseek-ai/dsh@0.1.5-rc.1` (installed build, the same
> version CI now pins) · Research basis: [`dsh-0.1.5-rc.1-review.md`](./dsh-0.1.5-rc.1-review.md)
> · Pitfall records: [`mvp-pitfalls.md`](./mvp-pitfalls.md) §7 (P-20)

## What was broken, and what the gate scores are now

Against 0.1.5-rc.1 the unmodified repo scored **104/104 unit, 4/4 doctor-lite, 10/10
concerto-static, 7/7 docs-consistency — and 0/4 e2e** (the persona `text:` → `prefix:`
rename, review §2). After the upgrade:

| Gate | Before | After |
|---|---|---|
| `pnpm vitest run` | 104/104 | **104/104** |
| `node scripts/doctor-lite.mjs` | 4 pass / 0 fail (1 row schema-checked) | **4 pass / 0 fail (16 rows schema-checked)** |
| `node scripts/verify-concerto-static.mjs` | 10/10 | **10/10** |
| `node scripts/check-docs-consistency.mjs` | 7/7 | **7/7** |
| `node tests/e2e/drive.mjs` | 0/4 scenarios | **4/4 scenarios, overall PASS** |
| `scripts/run-proofs.sh` (new) | — | **3/3 PASS** (T12 toolFilter · T13 maxDepth · T15 dual-route logging) |
| `scripts/ci-local.sh` | 7 gates | **8 gates, all green** |

## e2e verdict (the decisive L1 record)

`{"result":"PASS","scenarios":[hello, concerto-delegation-demo, explore-write-denied,
explore-nested-delegation-denied],"realDshUntouched":true}` — raw verdict kept beside this
file as `dsh-0.1.5-rc.1-e2e-verdict.json`.

Deep assertions from `concerto-delegation-demo` (14/14):

- timeline `sisyphus → explore → explore → sisyphus` on the mock, exactly 2 conductor + 2
  child requests;
- **route pair distinct**: parent `deepseek-official/deepseek-v4-pro`, child
  `deepseek/deepseek-v4-flash`;
- `hardBlocksInjectionObserved: true` (FR-6 — `agent/pre-step` + `agent.inject()` still land);
- the child's descriptor was read at its new `version: 3`;
- the child's advertised tools exclude `write`/`edit`/the delegation tool (AC-6b physical
  enforcement), while `present` — the newly added upstream-parity row — is present.

## The gate that would have caught this

`doctor-lite`'s schema pass went from **1 row** to **every config-bearing row** of the
rendered composition, run against the installed plugin's own `Config`. Regression-tested by
reverting only the persona key: the new gate fails with
`persona (@deepseek-ai/dsh-persona): ValidationError: $.prefix missing required value`,
which is precisely the message the old suite scored green through.

## Two scripts had already rotted before this upgrade touched anything

Running the full sweep turned up damage that predates this work: `scripts/concerto-mode-probe.sh`
asserted `deny: [write, edit]` for five days after the 2026-09-05 F1 hardening changed the list to
`[write, edit, explore]`, and `scripts/prove-route-logging.mjs` carried three independent
0.1.5-rc.1 breaks (no `sessionProjections` mount, `agentLoop.create` now `async`, generation-bearing
log filename). Neither could be noticed, because **no chain ran either script** — the probe is named
in the PRD's bump chain but appears in no automated gate. Both are repaired, and
`scripts/run-proofs.sh` now runs the three proofs as **gate 8** of `ci-local.sh` and
`.github/workflows/ci.yml`, so the next rot fails CI instead of waiting for a human to ask.
Full record: `docs/mvp-pitfalls.md` §7 P-20.7.

## Status of this row

**L1 (zero-LLM) is GREEN on 0.1.5-rc.1.** The matrix row stays `untested` until the L2
real-model record exists, because `scripts/check-l2-evidence.mjs` requires the canonical
`**PASS — N passed, 0 failed` marker that only a real-model run writes. The delivered
Concerto preset in `$DSH_HOME/.agent-presets/concerto/` is what produces that record.

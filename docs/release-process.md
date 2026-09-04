# Release Process & Version Management

> Decision **D13** (2026-09-05). Guiding principles: **automation first**,
> **local-first cost** — everything verifiable on a dev machine stays local;
> the cloud runs only zero-cost gates and the free weekly sentinel.
> 中文：[发布流程](./release-process_zh-CN.md)。

## 1. Three parties

| Party | What it is | Compatibility kind | Version source |
|---|---|---|---|
| **our** — `oh-my-opendsh` | what we ship | — | git tags |
| **dsh** — `@deepseek-ai/dsh` | the harness our preset + plugin run on | **RUNTIME** | npm registry / git tags `dsh-v*` |
| **omo** — `oh-my-openagent` | semantic blueprint (conductor/explore design) | **REFERENCE** (no runtime coupling) | npm registry |

## 2. Version & tag conventions

- `package.json` carries the full semver `X.Y.Z`.
- Every release gets **two tags**: an immutable annotated `vX.Y.Z`, and a
  **moving minor alias** `vX.Y` force-moved to the newest patch of the line.
  The installer pins the alias (`TAG="${CONCERTO_TAG:-v0.1}"`), so
  `curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh` always
  installs the newest stable patch; exact pinning uses the raw `vX.Y.Z` URL.
- Semantics: **major** = breaking matrix change / dropping an old dsh range;
  **minor** = new capability or a newly ✅-verified upstream combo;
  **patch** = fixes / docs / installer-only.
- GitHub Pages serves the stable line's branch root (`main`), so `/install` always
  mirrors the newest release commit.

## 3. The compatibility matrix

Single source of truth: [`.omo/compat.yaml`](../.omo/compat.yaml) → rendered to
[`docs/compat-matrix.md`](./compat-matrix.md) / [`中文`](./compat-matrix_zh-CN.md)
by `scripts/render-compat-matrix.mjs`. The docs-consistency gate re-renders and
diffs both files on every CI run — hand edits get caught immediately.

Row statuses: ✅ tested · 🔬 untested · ❌ broken · 🪦 dropped.
**A release may only be made on a ✅ row.** The latest ✅ row of each dsh line
is the LKG (last known good) rollback anchor. The `broken` / `dropped` states
are currently unused — this PR ships no such rows; they exist in the schema
for the rollback/emergency flow (§8).

## 4. Test layers & TDD

| Layer | What | Cost | Where |
|---|---|---|---|
| **L0 static** | typecheck · unit · doctor-lite · license · **concerto static** (c01–c09: the shipped preset + plugin keep the AC-6/P-19 hardening) · **docs consistency** (d01–d06) | zero | CI on every push + locally via `scripts/ci-local.sh` (7 gates) |
| **L1 zero-LLM e2e** | mock-LLM e2e — boots the REAL dsh binary against a mock server, asserts on session JSONL | zero | CI + locally |
| **L2 real-model** | `concerto_verify` 22 checks (AC-1…AC-9: dual routing, AC-6a/6b negative assertions, …) | real keys | **local only** — `scripts/release-check.sh` gate 8 (evidence freshness ≤ `VERIFY_FRESH_DAYS`, default 7 d) |

TDD shape: a new capability or adaptation starts as an AC check — run it red
against the current dsh, implement, run green. Every positive assertion must be
paired with **negative probes** (assert the bad thing is *absent*, not just that
the good thing exists — AC-6a/6b; P-19's lesson).

## 5. Breaking changes upstream

| Class | Definition | Handling |
|---|---|---|
| **A — additive** | backward compatible | sentinel registers 🔬 → next cycle verifies → ✅ |
| **B — hard break** | API renamed/removed — fails loudly | adapt branch → patch/minor → new ✅ row |
| **C — silent change** | behavior drifts without erroring | the worst class (P-19). Negative assertions catch it; treat as B with higher priority |

Cadence: the weekly `compat-probe` workflow (free, no secrets) detects new
upstream versions and opens one issue per new version; verification runs
locally — `scripts/compat-probe.sh` (temp dsh prefix + sandboxed DSH_HOME +
doctor-lite + mock e2e against the NEW dsh) followed by one manual real-model
`concerto_verify`. The final pin flip is the D7-named
`scripts/bump-dsh.sh <version>` — it refuses to run unless the matrix row is ✅
and the local `dsh --version` already reports the new version, then runs the
full zero-cost chain. Options in order of preference: **follow** (new ✅ row) →
**bridge** (shim in the patch layer, row notes it) → **lag** (`/install` stays
on LKG; README status states the max supported dsh).

## 6. Release procedure — `scripts/release.sh`

```bash
scripts/release.sh <patch|minor|major|X.Y.Z> [--dry-run] [--no-push] [--no-gh] [--wait-pages <s>]
```

Steps (all local; first failure aborts before anything is tagged):

1. **preflight** — clean tree, on the release branch (`main`), `scripts/release-check.sh` (8 gates incl. fresh L2 evidence).
2. **bump** — `scripts/release-bump.mjs`: package.json, installer TAG pin, README status tokens, compat.yaml (our block + new ✅ row with the current `dsh --version`, omo version, evidence path), CHANGELOG top entry, matrix re-render.
3. **re-gate** — docs-consistency + concerto-static after the edit.
4. **commit** — `release: vX.Y.Z`.
5. **tags** — `vX.Y.Z` annotated (immutable) + `vX.Y` alias force-moved.
6. **push** — branch + alias + full tag.
7. **verify** — sandboxed install from the NEW tag's raw URL (hard gate); Pages `/install` poll (best effort, `--wait-pages`).
8. **gh release** — notes = CHANGELOG top section + matrix snapshot (falls back to printed instructions without gh auth).

## 7. Doc update rules (who updates what)

**`release.sh` updates automatically (machine-checked afterwards):** package.json,
installer pin, README status *tokens*, compat.yaml + matrix docs, CHANGELOG.

**Humans update in normal commits (before running release.sh):** status *prose*
(e.g. "dsh 0.1.2 review registered"), new AC/evidence text, pitfalls, any
other docs. The consistency checker enforces only the tokens — prose stays
editorial.

## 8. Rollback & emergencies

- **Broken release** → re-release a hotfix patch (the alias moves forward), or
  revert the release commit on the branch (Pages follows the branch).
- **Broken upstream** → mark the row ❌, keep the LKG row ✅, `/install` stays
  on LKG until a follow or bridge lands.
- `vX.Y.Z` tags are never moved; only the `vX.Y` alias is force-moved, on
  purpose.

## 9. Automation inventory

| Artifact | Runs | Cost |
|---|---|---|
| `scripts/ci-local.sh` (7 gates) | local + CI `ci.yml` on every push | zero |
| `scripts/release-check.sh` (8 gates) | local, release preflight | zero gates + your existing L2 evidence |
| `scripts/release.sh` + `scripts/release-bump.mjs` | local, on release | zero |
| `scripts/compat-probe.sh` | local, on 🔬 rows | zero (auto part) + one real-model verify |
| `scripts/bump-dsh.sh` | local, D7 pin flip | zero gates; refuses without a ✅ row |
| `.github/workflows/compat-probe.yml` | weekly cron + manual dispatch | zero (GitHub Actions free tier) |

## 10. Decisions & first exercise

- **D13** (this process) adopted 2026-09-05 under the two principles above; it
  closes open dimensions **O6** (upstream release notification → weekly
  sentinel) and **O7** (upgrade cadence → deliberate bump via probe + matrix).
  **O1** (omo core-package pin strategy) stays open — the matrix tracks the
  omo *reference* version only.
- First exercise: the 🔬 row **dsh 0.1.2-rc.1** (static review already done —
  [`docs/dsh-0.1.2-review.md`](./dsh-0.1.2-review.md)). Passing it allows the
  D7 pin flip via `scripts/bump-dsh.sh 0.1.2-rc.1` (`DSH_VERSION` in
  `.github/workflows/ci.yml`) — tracked in PRD §12.

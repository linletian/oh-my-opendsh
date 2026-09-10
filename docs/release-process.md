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

### What the D7 pin does — and does not — freeze

CI installs `@deepseek-ai/dsh@<exact rc>`, but **dsh's own dependencies use caret
ranges on prereleases** (`^0.1.5-rc.1`), and semver resolves those *upward* to the newest
matching prerelease. The exact pin therefore fixes the top-level package only; the
resolved transitive set floats inside `<major>.<minor>.<patch>-rc.*`.

Two consequences, both observed on 2026-09-10:

1. **CI can go red for a reason entirely outside this repo.** While upstream was
   mid-way through a staged publish, `npm install --global @deepseek-ai/dsh@0.1.5-rc.1`
   failed with `ETARGET … No matching version found for @deepseek-ai/dsh-*@^0.1.5-rc.2`
   — the caret ranges had already moved to `rc.2` while some `rc.2` packages were not
   published yet. The job died in its **`install dsh` step, before any gate in this repo
   ran**, so a red run there is not evidence about our code. The window moves: minutes
   later a different missing package was reported.
2. **The runtime a release was verified against is not bit-frozen.** A compat-matrix row
   names the top-level pin, not the resolved dependency set, so "verified on dsh
   0.1.5-rc.1" means "the resolver's view of rc.1 on that date".

**Recording the resolved set** (`npm ls -g --all` at install time, attached to the
release evidence) is the obvious hardening and is **recorded here as a follow-up, not
implemented** — it changes what a matrix row attests to, so it is a decision rather than
a patch. Until then, treat a red `install dsh` step as an upstream condition: re-run
before investigating this repo.

### Support window, and what version probing actually measures

**Measured 2026-09-10** with `scripts/compat-probe.sh <version>` (~2 min per version, zero LLM
cost). Recorded so the numbers do not have to be re-derived, **not** as a commitment to support
them — see the scope decision below.

**Probing is tuple-granular, not per-version.** `@deepseek-ai/dsh@V` declares its siblings as
`^V`, and the semver prerelease rule means such a range matches prereleases of **V's own
`major.minor.patch` tuple only**. So installing a version never tests that exact build:

| pin | sibling spec | resolved `dsh-persona` |
|---|---|---|
| `0.1.0-rc.6` | `^0.1.0-rc.6` | `0.1.0-rc.8` ← stays in the **0.1.0** tuple |
| `0.1.3-alpha.2` | `^0.1.3-alpha.2` | `0.1.3-alpha.2` |
| `0.1.5-alpha.1` | `^0.1.5-alpha.1` | `0.1.5-rc.2` ← stays in the **0.1.5** tuple |
| `0.1.5-rc.1` | `^0.1.5-rc.1` | `0.1.5-rc.2` |

Two consequences worth keeping straight:

- The effective pin is **"the newest prerelease of the pinned tuple"**, so a probe result is a
  statement about a tuple, not about one published version. That also bounds the earlier worry:
  the resolution does **not** float across `0.1.x`, only within one `x.y.z`.
- The one genuinely unstable moment is an **upstream partial publish**: while a new tuple member
  is being rolled out, its siblings can be unsatisfiable and CI fails in the `install dsh` step
  **before any gate in this repo runs**. That is transient — re-run rather than investigate.

**Measured window for our current concerto layer:**

| dsh tuple | result | cause when it fails |
|---|---|---|
| `0.1.5-*` (alpha.1 → rc.2) | ✅ PASS (16 rows + e2e 4/4) | — |
| `0.1.3-*` | ❌ FAIL | the `present` row: `@deepseek-ai/dsh-tool-present` does not exist yet |
| `0.1.0-*` (rc.6 → rc.8) | ❌ FAIL | `persona` there requires `text:` (the pre-rename schema); `present` also absent |

So the layer works on the **0.1.5 line** and not on earlier ones, because it is derived from the
0.1.5-line shipped preset (upstream's `present` row and the `prefix:` rename both postdate 0.1.3).

**Scope decision (2026-09-10).** Do **not** build a multi-version CI matrix or a formal
support-range apparatus now. dsh is moving fast, this is still an MVP, and the project's direction
is not settled — a support window measured today would be stale before it was useful. Keep the
cheap mechanism (`compat-probe.sh`, ~2 min/version) and re-measure when a concrete need appears
(a user on another version, or a pin bump). What must stay live is the *practice*: probe the
target line before pinning to it, and record the result.

## 2a. Branch model — `develop` integrates, `main` releases

Three long-lived refs, one direction of travel:

```
feature/*, fix/*  --PR-->  develop  --release-->  main  (+ tags vX.Y.Z / vX.Y)
                          (integration)          (released line, Pages root)
```

- **`develop` is the integration branch.** Every `feature/*` / `fix/*` branch PRs
  into it and only into it. CI runs on every branch (`on: push` / `on: pull_request`
  are unfiltered), so `develop` is gated exactly like `main` — there is no
  "CI only on the release branch" asymmetry to remember.
- **`main` carries only released commits.** GitHub Pages serves `main`'s branch
  root, so `/install` mirrors the newest release by construction. Nothing lands on
  `main` except a release.
- **The version number is chosen at release time, not before.** Work on `develop`
  keeps `package.json` at the last released version; `release.sh <patch|minor|major>`
  computes the next one at step 2. Nothing earlier in the flow needs it, and the
  four token holders (`package.json`, `compat.our.latest`, the installer `TAG`, the
  CHANGELOG heading) move together in the one release commit.
- **A develop-line verification row is deliberately unversioned.** The matrix row
  for work in flight carries `our: "unreleased"` — a released version number must
  never claim work that version does not contain (`0.1.1` as released does *not*
  satisfy a row verified against a later dsh). At release, `release-bump.mjs`
  **upgrades that row in place** rather than inserting a second one, so the matrix
  keeps exactly one row per `(our, dsh)` and no stale placeholder survives a release.
- **Release movement.** Merge `develop` into `main`, then run `release.sh` *on
  `main`* — its preflight requires a clean tree on `RELEASE_BRANCH` (default
  `main`, overridable with `RELEASE_BRANCH=<branch>`). Then merge the release
  commit back into `develop` so the two lines do not drift.

## 3. The compatibility matrix

Single source of truth: [`.omo/compat.yaml`](../.omo/compat.yaml) → rendered to
[`docs/compat-matrix.md`](./compat-matrix.md) / [`中文`](./compat-matrix_zh-CN.md)
by `scripts/render-compat-matrix.mjs`. The docs-consistency gate re-renders and
diffs both files on every CI run — hand edits get caught immediately.

**Layout rule (`docs/` vs `.omo/`):** human-readable process documentation
lives in `docs/` (hand-written, bilingual twins, reviewable — this document,
the install guide, the pitfalls ledger, verification reports). `.omo/` holds
machine artifacts ONLY: the matrix data source, per-row verification evidence,
probe logs, transient release notes — machine-written, machine-checked, never
hand-edited docs (see [`.omo/README.md`](../.omo/README.md)).

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

Evidence files are **per-device by design and never synced**: they attest that a
real-model verification ran on THIS machine, and the freshness window means every
releasing device must run `concerto_verify` itself before it may release (a new
device: clone → zero-cost chain → one local `concerto_verify` → release). What
must cross devices — matrix rows, docs, scripts — travels via git, not via `.omo/`.

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

1. **preflight** — clean tree, on the release branch (`main`; see §2a), `scripts/release-check.sh` (8 gates incl. fresh L2 evidence).
2. **bump** — `scripts/release-bump.mjs`: package.json, installer TAG pin, README status tokens, compat.yaml (our block + the ✅ row for this release — the develop line's `unreleased` row upgraded in place when one exists, otherwise a new row — carrying the current `dsh --version`, omo version and evidence path), CHANGELOG top entry, matrix re-render.
3. **re-gate** — docs-consistency + concerto-static after the edit.
4. **commit** — `release: vX.Y.Z`.
5. **tags** — `vX.Y.Z` annotated (immutable) + `vX.Y` alias force-moved.
6. **push** — branch + alias + full tag.
7. **verify** — sandboxed install from the NEW tag's raw URL (hard gate); Pages `/install` poll (best effort, `--wait-pages`).
8. **gh release** — notes = CHANGELOG top section + matrix snapshot (falls back to printed instructions without gh auth).

### The commit step stages everything, and asserts it did

Step 4 runs `git add -A` rather than an enumerated file list, and ends by asserting the
tree is clean before anything is tagged or pushed.

Enumerating was the v0.2.0 defect. `release-bump.mjs` rewrites the Pages `install`
wrapper on every alias move, but the add list omitted it — so **step 3 re-gated the
working tree (wrapper already correct) while step 4 committed a subset that still named
the old alias**. The gate approved one tree and the release shipped another, and only a
fresh clone can see the difference (`check-docs-consistency` compares the wrapper against
compat's `tag_alias`). The published one-liner kept fetching the previous line's
installer — i.e. the pre-upgrade preset.

It was latent for every release before that because the alias had never moved
(`v0.1` → `v0.1`); the first minor bump exposed it. The same audit found the alias quoted
in six further places that `release-bump` does not rewrite (both READMEs' fallback direct
link, both install guides, the installer's own usage header). Both classes are now
gated: `git add -A` plus the clean-tree guard for the commit, and `d08` for every live
raw-URL pointer.

Enumerating was never needed — step 1 requires a clean tree, so after the bump the only
modifications are the bump's own.

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

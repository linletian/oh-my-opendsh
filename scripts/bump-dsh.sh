#!/usr/bin/env bash
# scripts/bump-dsh.sh — the D7 deliberate pin bump, implemented per D13.
# Flips DSH_VERSION (.github/workflows/ci.yml) and the compat-probe workflow's
# parser-provider install to <new-dsh-version>, then runs the full zero-cost
# gate chain locally against the dsh binary on PATH (which must already report
# <new-dsh-version> — probe it first with scripts/compat-probe.sh and get the
# matrix row to `tested`).
#
# Since PR #9 the pin is two tokens, not one: DSH_VERSION plus the
# `--before=<date>` cutoff that freezes the WHOLE resolved tree (transitives
# included — the exact version pin alone does not), carried by the same two
# files.
#
# THE CUTOFF IS A SAFE POINT INSIDE A BAND, NOT A PUBLISH INSTANT. npm-pick-manifest
# applies `--before` PER PACKAGE (`Date.parse(time[ver]) <= before`), and the dsh
# monorepo does NOT publish its family atomically: a family member can land
# seconds AFTER the top-level package. Measured (PR #9 round 2, real registry):
# @deepseek-ai/dsh 0.1.5-rc.1 published 2026-09-10T03:12:53.293Z, but
# @deepseek-ai/dsh-webhook-github 0.1.5-rc.1 only exists from
# 2026-09-10T03:14:25.423Z (92s later) — so a cutoff at the publish instant, at
# 03:12:54Z or at 03:13:00Z all ETARGET, while 03:20:00Z works. A cutoff that
# excludes any family member the tree needs kills `install dsh` before a single
# gate of ours runs.
#
#   family-max publish instant  <  cutoff  <  successor family-min publish instant
#
# (`<` at the bottom because `isBefore` is inclusive; `<` at the top because at
# the successor's first publish instant the NEXT family starts resolving in and
# the tree goes MIXED.) The heuristic is the MIDPOINT between the target's
# publish instant and the earliest-published LATER version's instant — picked by
# TIME from the registry's own time map, never by semver order, because a
# monorepo publishes out of semver order. With no later version at all (the
# target is the newest published) the cutoff is the bump instant, at npm's
# millisecond precision: a second-truncated instant reads a same-second publish
# as "not yet published" and ETARGETs all over again.
#
# A midpoint is a heuristic, not a proof — a straggler family member is
# invisible in `npm view @deepseek-ai/dsh time`, so the bump then VERIFIES the
# candidate for real: `npm install --package-lock-only --before=<cutoff>
# @deepseek-ai/dsh@<version>` in a temp dir, asserted to resolve every
# @deepseek-ai/dsh* entry — at any nesting depth — to exactly <version>. A
# failed verification is retried with the candidate bisected in the direction
# the failure indicates (up to MAX_CUTOFF_ATTEMPTS) and then refuses loudly.
#
# COMPUTE-AND-VERIFY-BEFORE-ANY-WRITE (N2). The cutoff is resolved to completion
# before the first `sed`, so a failure leaves ci.yml and compat-probe.yml
# byte-identical — a half-bumped repo cannot exist, and an idempotent re-run
# cannot mask one. If the registry cannot answer (offline) the cutoff falls back
# to the bump instant and verification is SKIPPED with a loud, non-blocking
# warning stating that the cutoff could NOT be computed from registry data and
# must be re-verified. Re-running for the version already pinned leaves both
# tokens untouched — idempotent, including offline.
#
# Usage: scripts/bump-dsh.sh <new-dsh-version> [--dry-run]
#        scripts/bump-dsh.sh --self-test [--online]
# Gates: matrix row tested → local dsh version matches → ci-local.sh green.
# --self-test is hermetic: it drives the cutoff math and the write seam against
# fixture text only (no network, no repo writes) and exits 0/1. `--online` is an
# OPT-IN extra that additionally runs the REAL resolution verification for the
# pinned version; ci-local runs only the hermetic part.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CI_YML=".github/workflows/ci.yml"
PROBE_YML=".github/workflows/compat-probe.yml"

# How many REAL resolutions one bump may spend on a cutoff. Each attempt is a
# full `npm install --package-lock-only` (seconds to a minute), so the budget is
# deliberately small and a failure past it aborts instead of guessing.
MAX_CUTOFF_ATTEMPTS=3

# --- the --before cutoff (PR #9 P1, round-2 F3) ------------------------------

# cutoff_shape_ok — read a candidate cutoff on stdin; exit 0 iff it is a UTC
# ISO-8601 instant with second precision or finer (`...THH:MM:SS[.fff]Z`). The
# shape gate the writer applies before quoting a value into a workflow.
cutoff_shape_ok() {
  grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$'
}

# safe_point <version> <bump-instant> — read
# `npm view @deepseek-ai/dsh time --json` on stdin and print ONE line with three
# space-separated fields:
#   <cutoff> <target-publish-instant> <successor-publish-instant|none>
# <cutoff> is the midpoint between <version>'s publish instant and the
# earliest-published LATER version's instant, or <bump-instant> when no later
# version exists. Exits non-zero (no output) when the payload is not JSON or has
# no usable `time` entry for <version>.
#
# The successor is chosen by PUBLISH TIME over the whole time map, never by
# semver order and never from a version list: monorepos publish out of semver
# order (the 0.1.5-rc.* line and the 0.1.7-rc.* line interleave in this project's
# own registry history). `created` / `modified` are metadata keys, not versions.
# The instant math runs in node because bash arithmetic has no sub-second terms,
# and a second-truncated boundary is the ETARGET this replaces.
safe_point() {
  node -e '
    const version = process.argv[1]
    const bump = process.argv[2]
    let raw = ""
    process.stdin.on("data", (c) => { raw += c })
    process.stdin.on("end", () => {
      let times
      try { times = JSON.parse(raw) } catch (e) { process.exit(1) }
      if (times === null || typeof times !== "object") process.exit(1)
      const SHAPE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$/
      const stampOf = (key) => {
        if (!Object.prototype.hasOwnProperty.call(times, key)) return undefined
        const stamp = times[key]
        return typeof stamp === "string" && SHAPE.test(stamp) ? stamp : undefined
      }
      const target = stampOf(version)
      if (target === undefined) process.exit(1)
      const targetMs = Date.parse(target)
      let successor
      let successorMs = Infinity
      for (const key of Object.keys(times)) {
        if (key === "created" || key === "modified") continue
        const stamp = stampOf(key)
        if (stamp === undefined) continue
        const stampMs = Date.parse(stamp)
        if (stampMs <= targetMs) continue
        if (stampMs < successorMs) { successorMs = stampMs; successor = stamp }
      }
      if (successor === undefined) {
        process.stdout.write(bump + " " + target + " none")
        return
      }
      const mid = Math.floor((targetMs + successorMs) / 2)
      process.stdout.write(new Date(mid).toISOString() + " " + target + " " + successor)
    })
  ' "$1" "$2"
}

# midpoint <iso-a> <iso-b> — the millisecond midpoint (floored) of two ISO
# instants, for the verification retry's bisection. node again: the whole point
# of this round is that a truncated boundary is a bug.
midpoint() {
  node -e '
    const a = Date.parse(process.argv[1])
    const b = Date.parse(process.argv[2])
    if (!Number.isFinite(a) || !Number.isFinite(b)) process.exit(1)
    process.stdout.write(new Date(Math.floor((a + b) / 2)).toISOString())
  ' "$1" "$2"
}

# fallback_cutoff — the bump instant, shaped like npm's `time` strings: UTC,
# millisecond precision (`...T14:03:09.412Z`). SECONDS ARE NOT ENOUGH here: a
# cutoff truncated to the second is strictly before the publish instant
# `...:09.412`, so a version whose publish time shares that second resolves as
# "not yet published" and `install dsh` ETARGETs — the exact PR #9 failure, one
# boundary narrower. `%3N` is not used directly because a date(1) without it
# (uutils, BSD) either prints nine digits or leaves the `%3N` literal, so ONE
# clock read is taken at full nanoseconds (`%N`) and its fraction is then cut to
# exactly three digits inside that same string — never a second `date` call,
# which could pair one second's fraction with another second's stamp. The `.000`
# padding keeps a fractions-free clock read millisecond-shaped; a literal `%N`
# cannot be rescued, so the shape gate below returns non-zero and the caller
# refuses to write a malformed --before instead of trusting it.
fallback_cutoff() {
  local stamp
  stamp="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ | sed -E 's/\.([0-9]*)Z$/.\1000Z/; s/\.([0-9]{3})[0-9]*Z$/.\1Z/')"
  printf '%s' "$stamp" | cutoff_shape_ok || return 1
  printf '%s' "$stamp"
}

# cutoff_for <version> — the safe point for <version> from registry data, as
# safe_point's single line. Non-zero (no output) when npm cannot answer
# (offline, or the version has no publish time). Never fatal: the caller warns
# and falls back to the bump instant.
cutoff_for() {
  local bump json
  bump="$(fallback_cutoff)" || return 1
  json="$(npm view "@deepseek-ai/dsh@$1" time --json 2>/dev/null)" || return 1
  printf '%s' "$json" | safe_point "$1" "$bump"
}

# family_verdict <package-lock.json> <version> — print `ok` when EVERY
# @deepseek-ai/dsh* entry in the lockfile — at ANY nesting depth — is exactly
# <version>; `leaked` (with the offending entries on stderr) when the tree is
# mixed or a family member sits at another version anywhere; `error` when the
# lockfile cannot be read or the top-level family vanished.
#
# The anchored `(^|/)` pattern is deliberate: it is a SUBSTRING-free test on the
# lock KEY, so the earlier draft's substring matcher (which also matched
# `.../dsh-skill-filesystem/node_modules/chokidar`, i.e. unrelated packages under
# a dsh-* subtree) is gone, while a family member nested under ANY package is
# still recognized. Version-checking those keys at every depth subsumes the old
# literal `node_modules/@deepseek-ai/dsh/node_modules` filter: npm nests a
# dependency precisely when its version differs from the hoisted one, so the
# stray `dsh-base/node_modules/@deepseek-ai/dsh-*` that the old check missed is
# now the same `wrong` comparison as a mixed top level.
family_verdict() {
  node -e '
    const fs = require("node:fs")
    const lockPath = process.argv[1]
    const want = process.argv[2]
    let lock
    try { lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) } catch (e) {
      console.error("cannot read " + lockPath + ": " + e.message)
      process.stdout.write("error")
      process.exit(0)
    }
    const packages = lock && typeof lock.packages === "object" && lock.packages !== null
      ? lock.packages
      : {}
    const keys = Object.keys(packages)
    // The family at any depth: top level, or nested under any parent package.
    const FAMILY = /(^|\/)node_modules\/@deepseek-ai\/dsh(-[^/]+)?$/
    const TOP_LEVEL = /^node_modules\/@deepseek-ai\/dsh(-[^/]+)?$/
    const family = keys.filter((key) => FAMILY.test(key))
    const topLevel = family.filter((key) => TOP_LEVEL.test(key))
    if (topLevel.length === 0) {
      console.error("no top-level @deepseek-ai/dsh* entry in " + lockPath)
      process.stdout.write("error")
      process.exit(0)
    }
    const wrong = family.filter((key) => (packages[key] || {}).version !== want)
    if (wrong.length > 0) {
      console.error("mixed family: " + wrong.map((key) => key + "@" + (packages[key] || {}).version).join(", "))
      process.stdout.write("leaked")
      process.exit(0)
    }
    console.error("family " + family.length + " entries, all " + want + ", any depth")
    process.stdout.write("ok")
  ' "$1" "$2"
}

# verify_cutoff <version> <cutoff> — ONE real resolution at <cutoff>. Prints
# exactly one verdict token on stdout, diagnostics on stderr:
#   ok       every family entry at ANY depth is <version>
#   missing  the resolution needs a version that does not exist at <cutoff>
#            (npm ETARGET) — the candidate is too EARLY
#   leaked   the resolution succeeded but some family entry — top-level or
#            nested under any package — is another version: the candidate is too
#            LATE, the next family is leaking in
#   error    npm failed for a reason that is neither, or the lockfile is
#            unreadable — not a bisectable direction, so bail loudly
#   offline  the registry is unreachable — verification is SKIPPED, never failed
# `--package-lock-only` is what makes this cheap: no tarball is unpacked, only
# the resolution is exercised, which is exactly the decision `--before` changes.
verify_cutoff() {
  local version="$1" cutoff="$2" dir log rc verdict
  # Reachability first: "cannot reach the registry" and "this cutoff is wrong"
  # produce similarly alarming npm text, and only the second is a verdict.
  if ! npm view "@deepseek-ai/dsh@$version" version >/dev/null 2>&1; then
    echo "offline"
    return 0
  fi
  dir="$(mktemp -d "${TMPDIR:-/tmp}/omo-bump-dsh-verify.XXXXXX")"
  log="$dir/npm.log"
  rc=0
  (
    cd "$dir" \
      && npm install --package-lock-only --ignore-scripts --no-audit --no-fund \
        --before="$cutoff" "@deepseek-ai/dsh@$version"
  ) >"$log" 2>&1 || rc=$?
  if [[ "$rc" != "0" ]]; then
    echo "bump-dsh: verify: npm install at --before=$cutoff exited $rc:" >&2
    sed 's/^/  /' "$log" >&2 || true
    if grep -qE 'ETARGET|No matching version found' "$log"; then
      rm -rf "$dir"
      echo "missing"
      return 0
    fi
    if grep -qiE 'ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET|network' "$log"; then
      rm -rf "$dir"
      echo "offline"
      return 0
    fi
    rm -rf "$dir"
    echo "error"
    return 0
  fi
  verdict="$(family_verdict "$dir/package-lock.json" "$version" 2>"$log.verdict" || true)"
  cat "$log.verdict" >&2 || true
  rm -rf "$dir"
  printf '%s' "$verdict"
}

# verified_cutoff <version> <candidate> <target-instant> <successor-instant|none>
# — the verification retry. Prints the ACCEPTED cutoff on stdout. Exit codes:
#   0 = verified (stdout = the accepted cutoff)
#   1 = npm unreachable — the caller warns and keeps its own fallback
#   2 = every attempt failed — the caller must abort
#
# The bisection bounds are <target-instant> (the inclusive lower bound: a cutoff
# must be >= the target's publish instant) and <successor-instant> (the
# exclusive upper bound: at that instant the next family starts leaking in).
# Each failure halves the remaining bracket in the direction that failure
# indicates. NOTE, recorded as a deliberate clarification of the round-2
# instruction: a `missing` verdict means the candidate is TOO EARLY, so it is
# bisected toward the successor — moving it toward the target, as the
# instruction's single direction literally reads, would move it away from the
# fix for exactly the ETARGET class this round exists to kill. `leaked` moves
# toward the target, which is the instruction's direction. The attempt cap and
# the loud non-zero abort are unchanged.
verified_cutoff() {
  local version="$1" candidate="$2" lo="$3" hi="$4"
  local attempt=0 verdict next rc
  while :; do
    attempt=$((attempt + 1))
    verdict="$(verify_cutoff "$version" "$candidate")"
    case "$verdict" in
      ok)
        echo "bump-dsh: verify: attempt $attempt — --before=$candidate resolves" >&2
        echo "  every @deepseek-ai/dsh* entry at any depth to $version." >&2
        printf '%s' "$candidate"
        return 0
        ;;
      offline)
        echo "bump-dsh: WARN — registry unreachable during cutoff verification." >&2
        return 1
        ;;
      missing)
        echo "bump-dsh: verify: attempt $attempt — --before=$candidate is too EARLY" >&2
        echo "  (a family member published after it); moving toward the successor." >&2
        if [[ "$attempt" -ge "$MAX_CUTOFF_ATTEMPTS" || "$hi" == "none" ]]; then
          break
        fi
        lo="$candidate"
        rc=0
        next="$(midpoint "$lo" "$hi")" || rc=$?
        [[ "$rc" == "0" && "$next" != "$candidate" ]] || break
        candidate="$next"
        ;;
      leaked)
        echo "bump-dsh: verify: attempt $attempt — --before=$candidate is too LATE" >&2
        echo "  (the successor family is leaking in); moving toward the target." >&2
        if [[ "$attempt" -ge "$MAX_CUTOFF_ATTEMPTS" ]]; then
          break
        fi
        hi="$candidate"
        rc=0
        next="$(midpoint "$lo" "$hi")" || rc=$?
        [[ "$rc" == "0" && "$next" != "$candidate" ]] || break
        candidate="$next"
        ;;
      *)
        echo "bump-dsh: FAIL — verification returned an unusable verdict ('$verdict')." >&2
        break
        ;;
    esac
  done
  echo "bump-dsh: FAIL — no verified --before cutoff for $version after $attempt attempt(s)." >&2
  echo "  The safe point is ${lo} < cutoff < ${hi} (family-max < cutoff < successor-min);" >&2
  echo "  bisect it by hand against the real registry before pinning $version." >&2
  return 2
}

# resolve_cutoff_for_bump <version> — the ONLINE cutoff the real bump uses.
# Prints the cutoff on stdout; diagnostics on stderr. Non-zero = abort the bump.
#   1. cutoff_for: the registry safe point. Unavailable (offline / no publish
#      time) ⇒ warn and fall back to the bump instant, which is UNVERIFIED.
#   2. verified_cutoff: the real resolution. Unreachable registry ⇒ warn and
#      keep the fallback; failed attempts ⇒ non-zero (abort, no writes).
resolve_cutoff_for_bump() {
  local version="$1" line candidate target successor rc verdict
  rc=0
  line="$(cutoff_for "$version")" || rc=$?
  if [[ "$rc" != "0" || -z "$line" ]]; then
    if ! candidate="$(fallback_cutoff)"; then
      echo "bump-dsh: FAIL — this date(1) cannot render the bump instant as" >&2
      echo "  millisecond UTC (want YYYY-MM-DDTHH:MM:SS.mmmZ). Refusing to write" >&2
      echo "  a malformed --before." >&2
      return 4
    fi
    echo "bump-dsh: WARN — the --before cutoff could NOT be computed from registry" >&2
    echo "  data (offline, or no publish time recorded for $version). Falling back" >&2
    echo "  to the bump instant ($candidate), which is UNVERIFIED: RE-VERIFY it" >&2
    echo "  with a real --package-lock-only resolution before trusting the pin — a" >&2
    echo "  cutoff that excludes a family member's publish instant ETARGETs the CI" >&2
    echo "  \`install dsh\` step (PR #9)." >&2
    printf '%s' "$candidate"
    return 0
  fi
  read -r candidate target successor <<<"$line"
  echo "bump-dsh: safe point --before=$candidate (target $target, successor $successor)" >&2
  rc=0
  verdict="$(verified_cutoff "$version" "$candidate" "$target" "$successor")" || rc=$?
  if [[ "$rc" == "0" ]]; then
    printf '%s' "$verdict"
    return 0
  fi
  if [[ "$rc" == "1" ]]; then
    echo "bump-dsh: WARN — verification SKIPPED (registry unreachable). Keeping the" >&2
    echo "  computed --before=$candidate, which was NOT verified against the real" >&2
    echo "  registry: RE-VERIFY it before trusting the pin." >&2
    printf '%s' "$candidate"
    return 0
  fi
  return 1
}

# --- the writer (compute FIRST, write second) --------------------------------

# apply_bump <ci-yml> <probe-yml> <old> <new> <compute-fn>
# The ONE writer, and the seam N2 is about: <compute-fn> <new> must print a
# verified cutoff (or return non-zero), and it runs to COMPLETION before the
# first `sed`. A failure therefore leaves both files byte-identical. On success
# the version token and both install-line cutoffs are rewritten and the
# post-write shape is checked; the accepted cutoff is printed on stdout, so
# every diagnostic inside must go to stderr. Non-zero = nothing was written
# (except a post-write shape failure, which is reported loudly).
apply_bump() {
  local ci="$1" probe="$2" old="$3" new="$4" compute="$5"
  local cutoff rc
  rc=0
  cutoff="$("$compute" "$new")" || rc=$?
  if [[ "$rc" != "0" || -z "$cutoff" ]]; then
    echo "bump-dsh: FAIL — no verified --before cutoff for $new (exit $rc);" >&2
    echo "  $ci and $probe are left byte-identical (compute precedes every write)." >&2
    return 1
  fi
  if ! printf '%s' "$cutoff" | cutoff_shape_ok; then
    echo "bump-dsh: FAIL — computed cutoff '$cutoff' is not a UTC ISO-8601 instant;" >&2
    echo "  refusing to write it into either workflow." >&2
    return 4
  fi
  sed -i "s/^  DSH_VERSION: .*/  DSH_VERSION: $new/" "$ci"
  sed -i "s|\"@deepseek-ai/dsh@$old\"|\"@deepseek-ai/dsh@$new\"|" "$probe"
  rewrite_cutoff "$ci" "$cutoff"
  rewrite_cutoff "$probe" "$cutoff"
  for f in "$ci" "$probe"; do
    local got
    got="$(grep -c -- "--before=$cutoff" "$f" || true)"
    if [[ "$got" != "1" ]]; then
      echo "bump-dsh: FAIL — $f now has ${got} --before=${cutoff} install cutoff(s), want 1." >&2
      echo "  The install line's shape drifted; fix rewrite_cutoff + its self-test fixture." >&2
      return 3
    fi
  done
  printf '%s' "$cutoff"
}

# rewrite_cutoff <file> <cutoff> — rewrite --before= on the dsh `npm install`
# line(s) only. Prose that quotes an older cutoff (ci.yml's D7 header) is left
# alone on purpose: it records what was verified when, it is not configuration.
rewrite_cutoff() {
  local file="$1" cutoff="$2"
  sed -i -E "/npm install .*--before=/ s|--before=[^[:space:]]+|--before=${cutoff}|" "$file"
}

# --- the hermetic self-test --------------------------------------------------

# self_test — hermetic proof of what the bump relies on, against fixture text
# that mirrors the real targets' shape (no network, no repo writes):
#   (1) the safe-point math, on a fixture time map whose SEMVER order and
#       PUBLISH order disagree, and which carries the straggler lesson: the
#       midpoint for the real rc.1 pair lands ~5h50m AFTER the 92s straggler
#       (dsh-webhook-github rc.1) that `npm view @deepseek-ai/dsh time` cannot
#       even see — which is WHY the online verification below exists;
#   (2) the no-successor case falls back to the bump instant, with target = the
#       only publish instant;
#   (3) failure atomicity: drive the REAL write seam (apply_bump) with a compute
#       step that fails and assert both fixture workflows are byte-identical,
#       then with one that succeeds and assert the rewrite really happened (a
#       control, so the case cannot pass vacuously);
#   (4) the lockfile family assertion: mixed / nested-at-any-depth / vanished
#       families are `leaked`/`error`, a clean rc.1 tree is `ok`;
#   (5) BOTH workflow shapes (${DSH_VERSION} indirection and a literal quoted
#       version) get their install-line cutoff rewritten, prose quoting the old
#       cutoff is untouched, and an identical second pass is byte-identical;
#   (6) the offline fallback instant is millisecond-shaped, and the seconds-only
#       shape it replaces sorts before it — the same-second ETARGET boundary
#       this pairs with.
self_test() {
  local tmp fail=0 f new line out fb fb_payload ok
  tmp="$(mktemp -d)"
  new="2026-09-22T14:03:09.412Z"

  mkdir -p "$tmp/fixtures" "$tmp/atomic" "$tmp/rewrite"
  cat > "$tmp/fixtures/ci.yml" <<'YAML'
env:
  DSH_VERSION: 0.1.5-rc.1
# D7 history: CI installs with `--before=2026-09-19T00:00:00Z` (not config)
steps:
  - run: |
      npm install --global "@deepseek-ai/dsh@${DSH_VERSION}" --before=2026-09-19T00:00:00Z
      dsh --version
YAML
  cat > "$tmp/fixtures/compat-probe.yml" <<'YAML'
      # `--before` freezes the resolved tree; REVISIT on every dsh bump.
      - name: install dsh (parser provider)
        run: npm install --global "@deepseek-ai/dsh@0.1.5-rc.1" --before=2026-09-19T00:00:00Z
YAML
  # Two copies: the atomicity case must observe files a FAILED compute left
  # alone, and the rewrite-scope case below must start from the OLD cutoff.
  for f in ci.yml compat-probe.yml; do
    cp "$tmp/fixtures/$f" "$tmp/atomic/$f"
    cp "$tmp/fixtures/$f" "$tmp/rewrite/$f"
  done

  # (1) the safe point, on a map whose semver order is NOT its publish order:
  #     0.1.9-rc.9 is the highest semver but was published BEFORE the target, so
  #     the successor must be picked by time (0.1.5-rc.0, 14:57:10.790Z).
  local times
  times='{"created":"2026-01-01T00:00:00.000Z","modified":"2026-12-31T00:00:00.000Z","0.1.5-rc.1":"2026-09-10T03:12:53.293Z","0.1.9-rc.9":"2026-09-09T00:00:00.000Z","0.1.5-rc.0":"2026-09-10T14:57:10.790Z","0.1.5-rc.2":"2026-09-22T05:55:20.869Z"}'
  line="$(printf '%s' "$times" | safe_point 0.1.5-rc.1 2026-09-30T12:00:00.000Z)"
  if [[ "$line" != "2026-09-10T09:05:02.041Z 2026-09-10T03:12:53.293Z 2026-09-10T14:57:10.790Z" ]]; then
    echo "self-test: FAIL — safe_point gave '${line}'" >&2
    fail=1
  fi
  # The straggler lesson, encoded: @deepseek-ai/dsh-webhook-github 0.1.5-rc.1
  # published 2026-09-10T03:14:25.423Z — 92s after the top-level instant the
  # midpoint is computed from, and INVISIBLE in this package's time map. The
  # midpoint clears it here; a tighter successor would not, which is the whole
  # reason verify_cutoff exists. The left side is the FIRST FIELD of the line the
  # check above pinned, i.e. the COMPUTED safe point — never a literal, so the
  # comparison really exercises safe_point's output. Asserted, not assumed.
  local safe="${line%% *}"
  if [[ "$safe" > "2026-09-10T03:14:25.423Z" ]]; then
    echo "self-test: PASS — the computed safe point ($safe) clears the rc.1 straggler (03:14:25.423Z) by ~5h50m; the ONLINE verification is still the safety net" >&2
  else
    echo "self-test: FAIL — the safe point does not clear the rc.1 straggler instant" >&2
    fail=1
  fi
  if out="$(printf '%s' '{"0.1.5-rc.1":"2026-09-10T03:12:53.293Z"}' | safe_point 0.1.6-rc.1 2026-09-30T12:00:00.000Z)"; then
    echo "self-test: FAIL — safe_point accepted a version missing from \`time\`" >&2
    fail=1
  fi
  if out="$(printf '%s' 'not json' | safe_point 0.1.5-rc.1 2026-09-30T12:00:00.000Z)"; then
    echo "self-test: FAIL — safe_point accepted a non-JSON payload" >&2
    fail=1
  fi

  # (2) no successor ⇒ the bump instant, verbatim, with target recorded.
  line="$(printf '%s' '{"0.1.5-rc.1":"2026-09-10T03:12:53.293Z","0.1.5-rc.0":"2026-09-01T00:00:00.000Z"}' \
    | safe_point 0.1.5-rc.1 2026-09-30T12:00:00.000Z)"
  if [[ "$line" != "2026-09-30T12:00:00.000Z 2026-09-10T03:12:53.293Z none" ]]; then
    echo "self-test: FAIL — no-successor safe_point gave '${line}'" >&2
    fail=1
  fi

  # (3) failure atomicity, driven through the REAL writer. `compute_broken`
  #     stands in for "the registry cut us off mid-bump" (or any non-zero
  #     compute): the write seam must not have run. `compute_fixed` is the
  #     non-vacuous control — same seam, same fixtures, a cutoff in hand.
  local fixver="0.1.6-rc.1" fixcut="$new"
  compute_broken() { return 1; }
  compute_fixed() { printf '%s' "$fixcut"; }

  cp "$tmp/atomic/ci.yml" "$tmp/atomic/ci.yml.prewrite"
  cp "$tmp/atomic/compat-probe.yml" "$tmp/atomic/compat-probe.yml.prewrite"
  if apply_bump "$tmp/atomic/ci.yml" "$tmp/atomic/compat-probe.yml" 0.1.5-rc.1 "$fixver" compute_broken >/dev/null 2>&1; then
    echo "self-test: FAIL — apply_bump reported success with a failing compute step" >&2
    fail=1
  fi
  for f in "$tmp/atomic/ci.yml" "$tmp/atomic/compat-probe.yml"; do
    if ! cmp -s "$f" "$f.prewrite"; then
      echo "self-test: FAIL — ${f##*/} was modified by a FAILED compute (not atomic)" >&2
      fail=1
    fi
  done
  out="$(apply_bump "$tmp/atomic/ci.yml" "$tmp/atomic/compat-probe.yml" 0.1.5-rc.1 "$fixver" compute_fixed 2>/dev/null)"
  if [[ "$out" != "$new" ]]; then
    echo "self-test: FAIL — apply_bump returned '${out}', want ${new} (atomicity control is vacuous)" >&2
    fail=1
  fi
  if ! grep -q "^  DSH_VERSION: $fixver$" "$tmp/atomic/ci.yml"; then
    echo "self-test: FAIL — the control write did not flip DSH_VERSION" >&2
    fail=1
  fi
  if ! grep -q "\"@deepseek-ai/dsh@$fixver\" --before=$new" "$tmp/atomic/compat-probe.yml"; then
    echo "self-test: FAIL — the control write did not flip the compat-probe pin + cutoff" >&2
    fail=1
  fi

  # (4) the lockfile family assertion (the shape verify_cutoff relies on). The
  #     `lock-ok` fixture carries the chokidar/readdirp case that a SUBSTRING
  #     matcher misreads as a nested dsh path. Family entries are version-checked
  #     at ANY depth now, and npm nests a dependency only when its version
  #     differs from the hoisted one — which is why the version check alone
  #     subsumes the old literal `node_modules/@deepseek-ai/dsh/node_modules`
  #     filter. `lock-nested-other` is the case that filter MISSED: an
  #     other-version family member nested under a NON-dsh parent. On the old
  #     anchored-only code it resolves to `ok`, so this case is red pre-fix.
  mkdir -p "$tmp/lock-ok" "$tmp/lock-nested" "$tmp/lock-nested-other" "$tmp/lock-mixed" "$tmp/lock-empty"
  printf '%s' '{"packages":{"node_modules/@deepseek-ai/dsh":{"version":"0.1.5-rc.1"},"node_modules/@deepseek-ai/dsh-base":{"version":"0.1.5-rc.1"},"node_modules/@deepseek-ai/dsh-skill-filesystem/node_modules/chokidar":{"version":"5.0.0"},"node_modules/@deepseek-ai/dsh-skill-filesystem/node_modules/readdirp":{"version":"5.1.1"}}}' > "$tmp/lock-ok/package-lock.json"
  printf '%s' '{"packages":{"node_modules/@deepseek-ai/dsh":{"version":"0.1.5-rc.1"},"node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-sandbox-local":{"version":"0.1.5-rc.2"}}}' > "$tmp/lock-nested/package-lock.json"
  printf '%s' '{"packages":{"node_modules/@deepseek-ai/dsh":{"version":"0.1.5-rc.1"},"node_modules/dsh-base/node_modules/@deepseek-ai/dsh-base":{"version":"0.1.5-rc.2"}}}' > "$tmp/lock-nested-other/package-lock.json"
  printf '%s' '{"packages":{"node_modules/@deepseek-ai/dsh":{"version":"0.1.5-rc.1"},"node_modules/@deepseek-ai/dsh-base":{"version":"0.1.5-rc.2"}}}' > "$tmp/lock-mixed/package-lock.json"
  printf '%s' '{"packages":{"node_modules/undici":{"version":"8.10.2"}}}' > "$tmp/lock-empty/package-lock.json"
  for pair in "lock-ok ok" "lock-nested leaked" "lock-nested-other leaked" "lock-mixed leaked" "lock-empty error"; do
    local name want
    read -r name want <<<"$pair"
    out="$(family_verdict "$tmp/$name/package-lock.json" 0.1.5-rc.1 2>/dev/null || true)"
    if [[ "$out" != "$want" ]]; then
      echo "self-test: FAIL — family_verdict($name) gave '${out}', want '$want'" >&2
      fail=1
    fi
  done

  # (5) both install-line shapes are rewritten, prose is not, and a second pass
  #     is byte-identical. Driven on its OWN copy, still carrying the OLD cutoff,
  #     so the rewrite is genuinely exercised rather than re-applied.
  for f in "$tmp/rewrite/ci.yml" "$tmp/rewrite/compat-probe.yml"; do
    rewrite_cutoff "$f" "$new"
  done
  if [[ "$(grep 'npm install' "$tmp/rewrite/ci.yml")" != *"--before=$new"* ]]; then
    echo "self-test: FAIL — ci.yml install line not rewritten" >&2
    fail=1
  fi
  if [[ "$(grep 'npm install' "$tmp/rewrite/compat-probe.yml")" != *"--before=$new"* ]]; then
    echo "self-test: FAIL — compat-probe.yml install line not rewritten" >&2
    fail=1
  fi
  if ! grep -q -- '`--before=2026-09-19T00:00:00Z`' "$tmp/rewrite/ci.yml"; then
    echo "self-test: FAIL — ci.yml prose was rewritten (scope must stay on the install line)" >&2
    fail=1
  fi
  for f in "$tmp/rewrite/ci.yml" "$tmp/rewrite/compat-probe.yml"; do
    cp "$f" "$f.pass1"
    rewrite_cutoff "$f" "$new"
    if ! cmp -s "$f.pass1" "$f"; then
      echo "self-test: FAIL — ${f##*/} changed on an identical second pass (not idempotent)" >&2
      fail=1
    fi
  done

  # (6) the offline fallback instant is millisecond-shaped, so it survives BOTH
  #     consumers of a cutoff: the shape gate the writer applies (the shape the
  #     pin must have) and npm's inclusive `Date.parse(time[ver]) <= before`. A
  #     second-truncated instant sorts BEFORE a publish time later in that same
  #     second, so npm reads "not yet published" → ETARGET. The seconds-only
  #     shape is the regression this pairs with: it must collide, and the
  #     fallback must not. Checked on the shape, never the wall-clock value.
  if ! fb="$(fallback_cutoff)"; then
    echo "self-test: FAIL — fallback_cutoff refused to render the bump instant" >&2
    fail=1
  else
    # The fallback IS the safe point for a no-successor version: round-trip it
    # through safe_point with a payload in which it is the only (and therefore
    # newest) publish instant.
    fb_payload="{\"0.1.5-rc.3\":\"$fb\"}"
    ok=0
    if out="$(printf '%s' "$fb_payload" | safe_point 0.1.5-rc.3 "$fb")"; then
      [[ "$out" == "$fb $fb none" ]] && ok=1
    fi
    if [[ "$ok" != "1" ]]; then
      echo "self-test: FAIL — fallback instant '${fb}' is not round-tripped as the no-successor safe point" >&2
      fail=1
    fi
    if ! printf '%s' "$fb" | cutoff_shape_ok; then
      echo "self-test: FAIL — fallback instant '${fb}' fails the cutoff shape gate" >&2
      fail=1
    fi
    second_trunc="${fb%%.*}Z"
    if [[ "${second_trunc%Z}" < "${fb%Z}" ]]; then
      echo "self-test: PASS — seconds-only '$second_trunc' sorts before '$fb' (the same-second ETARGET); the millisecond fallback does not collide with its own instant" >&2
    else
      echo "self-test: FAIL — '$second_trunc' does not sort before '$fb': the same-second boundary case is not being exercised" >&2
      fail=1
    fi
  fi

  rm -rf "$tmp"
  if [[ "$fail" != "0" ]]; then
    echo "bump-dsh: FAIL — self-test (hermetic, no network) reported failures above." >&2
    exit 1
  fi
  echo "bump-dsh: self-test PASS — safe point (midpoint of target ↔ earliest-later"
  echo "  publish instant, time-ordered not semver-ordered; bump instant when there"
  echo "  is no successor), atomicity of the write seam (a failed compute leaves both"
  echo "  workflows byte-identical), the lockfile family assertion, both install-line"
  echo "  rewrites (prose untouched, second pass byte-identical), and the"
  echo "  millisecond-shaped offline fallback. No network used."
  echo "  The REAL resolution check is the opt-in '--self-test --online'; ci-local"
  echo "  runs this hermetic half only."
}

# online_self_test — the OPT-IN real-resolution smoke the reviewer demanded: take
# the version currently pinned in ci.yml (0.1.5-rc.1 at the time of writing),
# compute its safe point from the live registry, and run the REAL
# `--package-lock-only` verification against it. Network required; NOT part of
# ci-local. Prints PASS/FAIL and exits non-zero on FAIL.
online_self_test() {
  local version line candidate target successor rc verdict
  version="$(sed -n 's/^  DSH_VERSION: //p' "$CI_YML" | head -1)"
  if [[ -z "$version" ]]; then
    echo "bump-dsh: online self-test FAIL — no DSH_VERSION in $CI_YML" >&2
    exit 1
  fi
  echo "bump-dsh: online self-test — target $version (pinned in $CI_YML) against the real registry"
  rc=0
  line="$(cutoff_for "$version")" || rc=$?
  if [[ "$rc" != "0" || -z "$line" ]]; then
    echo "bump-dsh: online self-test FAIL — the registry could not answer for $version" >&2
    exit 1
  fi
  read -r candidate target successor <<<"$line"
  echo "bump-dsh: online self-test — safe point --before=$candidate (target $target, successor $successor)"
  rc=0
  verdict="$(verified_cutoff "$version" "$candidate" "$target" "$successor")" || rc=$?
  if [[ "$rc" != "0" ]]; then
    echo "bump-dsh: online self-test FAIL — no verified cutoff for $version (exit $rc)" >&2
    exit 1
  fi
  echo "bump-dsh: online self-test PASS — $version resolves cleanly under --before=$verdict"
}

case "${1:-}" in
  --self-test)
    self_test
    if [[ "${2:-}" == "--online" ]]; then
      online_self_test
    fi
    exit 0
    ;;
esac

NEW="${1:-}"
if [[ -z "$NEW" ]]; then
  echo "usage: scripts/bump-dsh.sh <new-dsh-version> [--dry-run]" >&2
  echo "       scripts/bump-dsh.sh --self-test [--online]" >&2
  exit 64
fi
DRY=0
[[ "${2:-}" == "--dry-run" ]] && DRY=1

# Gate 1: the matrix row for NEW must be `tested` (never bump onto 🔬).
if ! sed -n '/^tested:/,/^untested:/p' .omo/compat.yaml | grep -q "dsh: \"$NEW\""; then
  echo "bump-dsh: FAIL — no tested matrix row for dsh $NEW (.omo/compat.yaml)." >&2
  echo "  Probe it first: scripts/compat-probe.sh $NEW, run concerto_verify," >&2
  echo "  move the row to tested, commit — then re-run this bump." >&2
  exit 1
fi

# Gate 2: the LOCAL dsh on PATH is exactly NEW (the chain below tests it).
LOCAL="$(dsh --version 2>/dev/null || true)"
if [[ "$LOCAL" != "$NEW" ]]; then
  echo "bump-dsh: FAIL — dsh on PATH reports ${LOCAL:-<none>}, want $NEW." >&2
  echo "  npm install --global @deepseek-ai/dsh@$NEW (or reuse the probe sandbox prefix)." >&2
  exit 2
fi

OLD="$(sed -n 's/^  DSH_VERSION: //p' "$CI_YML" | head -1)"
echo "bump-dsh: dsh pin $OLD -> $NEW"
if [[ "$DRY" == "1" ]]; then
  echo "bump-dsh: DRY RUN — no files changed"
  exit 0
fi

# PR #9 P1 / round-2 F3: the --before cutoff is part of the pin. Compute AND
# verify it first; the writer below runs only once it is in hand.
if [[ "$OLD" == "$NEW" ]]; then
  echo "bump-dsh: dsh pin already at $NEW — version token and --before cutoffs left as-is (idempotent re-run)"
else
  rc=0
  CUTOFF="$(apply_bump "$CI_YML" "$PROBE_YML" "$OLD" "$NEW" resolve_cutoff_for_bump)" || rc=$?
  if [[ "$rc" != "0" ]]; then
    echo "bump-dsh: FAIL — bump aborted (exit $rc); $CI_YML and $PROBE_YML are" >&2
    echo "  byte-identical (the cutoff is computed and verified BEFORE any write)." >&2
    exit "$rc"
  fi
  echo "bump-dsh: --before cutoff -> $CUTOFF ($CI_YML + $PROBE_YML)"
fi

# D7: the bump enters via an explicit full typecheck + test gate run.
scripts/ci-local.sh

echo ""
echo "bump-dsh: DONE — ci.yml + compat-probe.yml now pin dsh $NEW; all 8 gates green."
echo "  Commit: git commit -am 'chore: bump dsh pin to $NEW (D7, matrix row tested)'"

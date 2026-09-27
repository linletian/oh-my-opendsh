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
# files. A cutoff that predates NEW makes npm resolve the exact pin as of a date
# on which it did not exist yet → `ETARGET` in the `install dsh` step, before
# any gate of ours runs. So the bump rewrites both cutoffs together with the
# version, to NEW's own npm publish timestamp: the earliest instant at which the
# pin exists (`--before` is inclusive — npm-pick-manifest compares
# `Date.parse(time[ver]) <= before`) and nothing upstream published later can
# leak into the resolved tree. If the registry cannot answer, the cutoff falls
# back to the bump instant, at the SAME millisecond precision as npm's `time`
# strings: a second-truncated instant is strictly before the publish instant it
# rounds down, so under `Date.parse(time[ver]) <= before` a version published
# inside that same second reads as not yet published — ETARGET all over again.
# The bump then continues with a loud, non-blocking warning. Re-running for the
# version already pinned leaves the cutoffs untouched — idempotent, including
# offline.
#
# Usage: scripts/bump-dsh.sh <new-dsh-version> [--dry-run]
#        scripts/bump-dsh.sh --self-test
# Gates: matrix row tested → local dsh version matches → ci-local.sh green.
# --self-test is hermetic: it drives the cutoff rewrite against fixture text
# only (no network, no repo writes) and exits 0/1.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CI_YML=".github/workflows/ci.yml"
PROBE_YML=".github/workflows/compat-probe.yml"

# --- the --before cutoff (PR #9 P1) -----------------------------------------

# extract_cutoff <version> — read `npm view @deepseek-ai/dsh@<version> time
# --json` on stdin and print <version>'s publish timestamp. Exits non-zero (with
# no output) when the payload is not JSON or has no `time` entry for the version.
# The publish time is used as-is, deliberately: truncating to the publish DAY
# (T00:00:00Z) would put the cutoff BEFORE a version published later that day,
# excluding the very pin being installed — the same ETARGET this fixes.
extract_cutoff() {
  node -e '
    let raw = ""
    process.stdin.on("data", (c) => { raw += c })
    process.stdin.on("end", () => {
      let times
      try { times = JSON.parse(raw) } catch (e) { process.exit(1) }
      const v = process.argv[1]
      const stamp = times && Object.prototype.hasOwnProperty.call(times, v) ? times[v] : ""
      if (typeof stamp !== "string" ||
          !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$/.test(stamp)) {
        process.exit(1)
      }
      process.stdout.write(stamp)
    })
  ' "$1"
}

# cutoff_for <version> — print the cutoff for <version>, or return 1 when npm
# cannot answer (offline, or the version has no publish time). Never fatal: the
# caller warns and falls back to the bump instant.
cutoff_for() {
  local json
  json="$(npm view "@deepseek-ai/dsh@$1" time --json 2>/dev/null)" || return 1
  printf '%s' "$json" | extract_cutoff "$1"
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
  printf '%s' "$stamp" | grep -qE '^[0-9-]{10}T[0-9:]{8}\.[0-9]{3}Z$' || return 1
  printf '%s' "$stamp"
}

# rewrite_cutoff <file> <cutoff> — rewrite --before= on the dsh `npm install`
# line(s) only. Prose that quotes an older cutoff (ci.yml's D7 header) is left
# alone on purpose: it records what was verified when, it is not configuration.
rewrite_cutoff() {
  local file="$1" cutoff="$2"
  sed -i -E "/npm install .*--before=/ s|--before=[^[:space:]]+|--before=${cutoff}|" "$file"
}

# self_test — hermetic proof of what the bump relies on, against fixture text
# that mirrors the real targets' shape (no network, no repo writes):
#   (1) BOTH workflow shapes (${DSH_VERSION} indirection and a literal quoted
#       version) get their install-line cutoff rewritten;
#   (2) prose quoting the old cutoff is untouched, and an identical second pass
#       is byte-identical (idempotent);
#   (3) the `npm view … time --json` payload is parsed, and a version missing
#       from `time` (the ETARGET case) is rejected;
#   (4) the offline fallback instant is millisecond-shaped (survives
#       extract_cutoff verbatim), and the seconds-only shape it replaces does
#       sort before it — the same-second ETARGET boundary this pairs with.
self_test() {
  local tmp fail=0 f new ci_install probe_install times out fb fb_payload
  tmp="$(mktemp -d)"
  new="2026-09-22T14:03:09.412Z"

  cat > "$tmp/ci.yml" <<'YAML'
env:
  DSH_VERSION: 0.1.5-rc.1
# D7 history: CI installs with `--before=2026-09-19T00:00:00Z` (not config)
steps:
  - run: |
      npm install --global "@deepseek-ai/dsh@${DSH_VERSION}" --before=2026-09-19T00:00:00Z
      dsh --version
YAML
  cat > "$tmp/compat-probe.yml" <<'YAML'
      # `--before` freezes the resolved tree; REVISIT on every dsh bump.
      - name: install dsh (parser provider)
        run: npm install --global "@deepseek-ai/dsh@0.1.5-rc.1" --before=2026-09-19T00:00:00Z
YAML

  for f in "$tmp/ci.yml" "$tmp/compat-probe.yml"; do
    rewrite_cutoff "$f" "$new"
  done

  # (1) both install lines carry the new cutoff ...
  ci_install="$(grep 'npm install' "$tmp/ci.yml")"
  probe_install="$(grep 'npm install' "$tmp/compat-probe.yml")"
  if [[ "$ci_install" != *"--before=$new"* ]]; then
    echo "self-test: FAIL — ci.yml install line not rewritten: $ci_install" >&2
    fail=1
  fi
  if [[ "$probe_install" != *"--before=$new"* ]]; then
    echo "self-test: FAIL — compat-probe.yml install line not rewritten: $probe_install" >&2
    fail=1
  fi
  # (2) ... and the prose that quotes the OLD cutoff deliberately is not, so the
  #     rewrite stays on the install lines and never edits history.
  if ! grep -q -- '`--before=2026-09-19T00:00:00Z`' "$tmp/ci.yml"; then
    echo "self-test: FAIL — ci.yml prose was rewritten (scope must stay on the install line)" >&2
    fail=1
  fi
  for f in "$tmp/ci.yml" "$tmp/compat-probe.yml"; do
    cp "$f" "$f.pass1"
    rewrite_cutoff "$f" "$new"
    if ! cmp -s "$f.pass1" "$f"; then
      echo "self-test: FAIL — ${f##*/} changed on an identical second pass (not idempotent)" >&2
      fail=1
    fi
  done

  # (3) extraction on the real payload shape, and on the unpublished-version case.
  times='{"created":"2026-09-10T00:00:00.000Z","modified":"2026-09-24T06:00:00.000Z","0.1.5-rc.1":"2026-09-10T09:12:00.000Z","0.1.5-rc.3":"2026-09-22T14:03:09.412Z"}'
  out="$(printf '%s' "$times" | extract_cutoff 0.1.5-rc.3)"
  if [[ "$out" != "$new" ]]; then
    echo "self-test: FAIL — extract_cutoff gave '${out}', want ${new}" >&2
    fail=1
  fi
  if out="$(printf '%s' "$times" | extract_cutoff 0.1.6-rc.1)"; then
    echo "self-test: FAIL — extract_cutoff accepted a version missing from \`time\`" >&2
    fail=1
  fi

  # (4) the offline fallback instant is millisecond-shaped, so it survives BOTH
  #     consumers of a cutoff: extract_cutoff's own pattern (the shape the pin
  #     must have) and npm's inclusive `Date.parse(time[ver]) <= before`. A
  #     second-truncated instant sorts BEFORE a publish time later in that same
  #     second, so npm reads "not yet published" → ETARGET. The seconds-only
  #     shape is the regression this pairs with: it must collide, and the
  #     fallback must not. Checked on the shape, never the wall-clock value.
  if ! fb="$(fallback_cutoff)"; then
    echo "self-test: FAIL — fallback_cutoff refused to render the bump instant" >&2
    fail=1
  else
    fb_payload="{\"0.1.5-rc.3\":\"$fb\"}"
    if ! out="$(printf '%s' "$fb_payload" | extract_cutoff 0.1.5-rc.3)" || [[ "$out" != "$fb" ]]; then
      echo "self-test: FAIL — fallback instant '${fb}' is not extracted verbatim (not millisecond-shaped)" >&2
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
  echo "bump-dsh: self-test PASS — --before rewritten on both install lines (ci.yml +"
  echo "  compat-probe.yml), prose untouched, second pass byte-identical, npm"
  echo "  \`time --json\` payload parsed (unpublished version rejected), and the offline"
  echo "  fallback instant is millisecond-shaped (same-second ETARGET boundary covered)."
  echo "  No network used."
}

case "${1:-}" in
  --self-test)
    self_test
    exit 0
    ;;
esac

NEW="${1:-}"
if [[ -z "$NEW" ]]; then
  echo "usage: scripts/bump-dsh.sh <new-dsh-version> [--dry-run]" >&2
  echo "       scripts/bump-dsh.sh --self-test" >&2
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

sed -i "s/^  DSH_VERSION: .*/  DSH_VERSION: $NEW/" "$CI_YML"
sed -i "s|\"@deepseek-ai/dsh@$OLD\"|\"@deepseek-ai/dsh@$NEW\"|" "$PROBE_YML"

# PR #9 P1: the --before cutoff is part of the pin, so it flips with the version.
CUTOFF=""
if [[ "$OLD" == "$NEW" ]]; then
  echo "bump-dsh: dsh pin already at $NEW — --before cutoffs left as-is (idempotent re-run)"
else
  if ! CUTOFF="$(cutoff_for "$NEW")" || [[ -z "$CUTOFF" ]]; then
    if ! CUTOFF="$(fallback_cutoff)"; then
      echo "bump-dsh: FAIL — npm view @deepseek-ai/dsh@$NEW time unavailable AND this" >&2
      echo "  date(1) cannot render the bump instant as millisecond UTC (want" >&2
      echo "  YYYY-MM-DDTHH:MM:SS.mmmZ). Refusing to write a malformed --before." >&2
      exit 4
    fi
    echo "bump-dsh: WARN — npm view @deepseek-ai/dsh@$NEW time unavailable (offline, or no" >&2
    echo "  publish time recorded). Falling back to the bump instant ($CUTOFF)." >&2
    echo "  NOT fatal, but re-verify it: the cutoff must be >= $NEW's publish time, or the" >&2
    echo "  CI \`install dsh\` step ETARGETs (PR #9)." >&2
  fi
  rewrite_cutoff "$CI_YML" "$CUTOFF"
  rewrite_cutoff "$PROBE_YML" "$CUTOFF"
  for f in "$CI_YML" "$PROBE_YML"; do
    got="$(grep -c -- "--before=$CUTOFF" "$f" || true)"
    if [[ "$got" != "1" ]]; then
      echo "bump-dsh: FAIL — $f now has ${got} --before=${CUTOFF} install cutoff(s), want 1." >&2
      echo "  The install line's shape drifted; fix rewrite_cutoff + its self-test fixture." >&2
      exit 3
    fi
  done
  echo "bump-dsh: --before cutoff -> $CUTOFF ($CI_YML + $PROBE_YML)"
fi

# D7: the bump enters via an explicit full typecheck + test gate run.
scripts/ci-local.sh

echo ""
echo "bump-dsh: DONE — ci.yml + compat-probe.yml now pin dsh $NEW; all 7 gates green."
echo "  Commit: git commit -am 'chore: bump dsh pin to $NEW (D7, matrix row tested)'"

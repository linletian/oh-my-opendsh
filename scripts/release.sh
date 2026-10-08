#!/usr/bin/env bash
# scripts/release.sh — the six-step release automation (docs/release-process
# §6). One script, local-first: every gate runs on THIS machine (the cloud
# only mirrors the zero-cost gates), and the real-model L2 acceptance is
# enforced by scripts/release-check.sh before anything is tagged.
#
# Usage:
#   scripts/release.sh <patch|minor|major|X.Y.Z> [--dry-run] [--no-push]
#                      [--no-gh] [--wait-pages <seconds>]
#
# Steps:
#   1. preflight  — clean tree, release branch, scripts/release-check.sh (8 gates)
#   2. bump       — scripts/release-bump.mjs (version tokens, matrix row,
#                   CHANGELOG, re-render matrix docs)
#   3. re-gate    — check-docs-consistency + verify-concerto-static after the edit
#   4. commit     — release: vX.Y.Z
#   5. tags       — vX.Y.Z (immutable, annotated) + vX.Y alias (force-moved)
#   6. push       — branch + alias + full tag
#   7. verify     — sandboxed install from the NEW tag's raw URL; ALIAS content
#                   gate (ls-remote peel == release commit + declaration-face
#                   markers on the alias's own installer copy; the ONLY honest
#                   point for it — pre-tag it deadlocks, PR #12 round 2);
#                   best-effort alias-URL install smoke + Pages /install poll
#   8. gh release — GitHub Release with changelog + matrix snapshot (if gh auth)
#
# Exit: 0 on a completed release (or a complete dry-run plan); non-zero at the
# first failing step. Nothing is written until every preflight gate is green.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
REMOTE="${RELEASE_REMOTE:-origin}"
GH_REPO="${RELEASE_GH_REPO:-$(git config --get remote."$REMOTE".url | sed 's|.*github.com[:/]||; s|\.git$||')}"

BUMP="${1:-}"
DRY_RUN=0
NO_PUSH=0
NO_GH=0
WAIT_PAGES="${WAIT_PAGES:-180}"
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-push) NO_PUSH=1 ;;
    --no-gh) NO_GH=1 ;;
    --wait-pages) WAIT_PAGES="$2"; shift ;;
    *) echo "release.sh: unknown option $1" >&2; exit 64 ;;
  esac
  shift
done

usage() {
  echo "usage: scripts/release.sh <patch|minor|major|X.Y.Z> [--dry-run] [--no-push] [--no-gh] [--wait-pages <s>]" >&2
  exit 64
}
[[ -z "$BUMP" ]] && usage

OLD="$(node -p "require('./package.json').version")"
if [[ "$BUMP" == "patch" || "$BUMP" == "minor" || "$BUMP" == "major" ]]; then
  NEW="$(node -e "
    const v = process.argv[1].split('.').map(Number)
    if (process.argv[2] === 'major') { v[0]++; v[1] = 0; v[2] = 0 }
    else if (process.argv[2] === 'minor') { v[1]++; v[2] = 0 }
    else v[2]++
    console.log(v.join('.'))
  " "$OLD" "$BUMP")"
else
  NEW="$BUMP"
fi
if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "release.sh: invalid version $NEW (want X.Y.Z or patch|minor|major)" >&2
  exit 64
fi
node -e "
  const a = '$OLD'.split('.').map(Number), b = '$NEW'.split('.').map(Number)
  const cmp = (a[0]-b[0]) || (a[1]-b[1]) || (a[2]-b[2])
  if (cmp >= 0) { console.error('release.sh: new version $NEW must be greater than current $OLD'); process.exit(64) }
"
NEW_ALIAS="v${NEW%%.*}.$(echo "$NEW" | cut -d. -f2)"

echo "release.sh: $OLD -> $NEW  (alias $NEW_ALIAS)  branch=$RELEASE_BRANCH remote=$REMOTE"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "release.sh: DRY RUN — no file or git mutation will happen."
  node scripts/release-bump.mjs "$NEW" "$NEW_ALIAS" --dry-run
  echo "release.sh: (dry-run stops here — gates, commit, tags, push, verify, gh release skipped)"
  exit 0
fi

# 1. preflight
if [[ -n "$(git status --porcelain)" ]]; then
  echo "release.sh: FAIL — working tree not clean. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi
if [[ "$(git rev-parse --abbrev-ref HEAD)" != "$RELEASE_BRANCH" ]]; then
  echo "release.sh: FAIL — on branch $(git rev-parse --abbrev-ref HEAD), want $RELEASE_BRANCH" >&2
  exit 1
fi
echo "release.sh: step 1/8 — preflight gates (release-check.sh)"
scripts/release-check.sh

# 2. bump
echo "release.sh: step 2/8 — bump files ($NEW, alias $NEW_ALIAS)"
node scripts/release-bump.mjs "$NEW" "$NEW_ALIAS"

# 3. re-gate after the edit
#
# NOTE: this validates the WORKING TREE, which is not yet what gets committed.
# Step 4 therefore ends with a guard that the commit captured everything this
# gate just approved — see there.
echo "release.sh: step 3/8 — post-bump consistency"
node scripts/check-docs-consistency.mjs
node scripts/verify-concerto-static.mjs

# 4. commit
#
# Stage EVERYTHING rather than an enumerated list. The list used to omit the
# Pages `install` wrapper, which release-bump rewrites on every alias move:
# step 3 then verified the WORKING TREE (wrapper already correct) while step 4
# committed a subset that still pointed at the OLD alias — so the re-gate
# approved something other than what shipped, and only a fresh clone could see
# it (d07 compares the wrapper against compat's tag_alias). v0.2.0 shipped that
# way: the published one-liner kept routing at `v0.1` and therefore installed
# the pre-upgrade preset.
#
# Enumerating was never needed: step 1 requires a clean tree, so after the bump
# the only modifications are the bump's own (transient artifacts such as
# `.omo/release-notes-*.md` are gitignored).
echo "release.sh: step 4/8 — commit"
git add -A
git commit -m "release: v$NEW"

# The guard that makes the class impossible: after committing, the tree must be
# clean. A dirty tree here means the bump wrote something the commit missed, so
# abort BEFORE the tags and the push — nothing has left this machine yet.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "release.sh: FAIL — working tree still dirty after the release commit:" >&2
  git status --short >&2
  echo "release.sh: a bumped file was not committed; step 3 approved the working" >&2
  echo "release.sh: tree while step 4 shipped something else. Nothing was tagged" >&2
  echo "release.sh: or pushed. Inspect, then either amend the release commit or" >&2
  echo "release.sh: reset it with 'git reset --soft HEAD~1' and re-run." >&2
  exit 1
fi

# 5. tags
echo "release.sh: step 5/8 — tags (v$NEW immutable + $NEW_ALIAS alias)"
git tag -a "v$NEW" -m "release v$NEW ($NEW_ALIAS line)"
git tag -f "$NEW_ALIAS" -m "release v$NEW — moving alias for the ${NEW_ALIAS#v} line" >/dev/null

# 6. push
if [[ "$NO_PUSH" == "1" ]]; then
  echo "release.sh: step 6/8 — push SKIPPED (--no-push)"
else
  echo "release.sh: step 6/8 — push"
  git push "$REMOTE" HEAD
  git push --force "$REMOTE" "$NEW_ALIAS"
  git push "$REMOTE" "v$NEW"
fi

# 7. verify — sandboxed install from the NEW tag's raw URL (deterministic),
#    then the ALIAS verification, then best-effort Pages /install poll (Pages
#    builds async). All REMOTE legs require step 6's push to have happened:
#    under --no-push the tags exist only locally, the raw URL 404s and
#    ls-remote answers empty (PR #12 round 3, measured) — so the remote legs
#    skip by name and the WORKING TREE's installer gets the sandboxed install
#    instead (it is exactly what a later pushing release would ship).
echo "release.sh: step 7/8 — install verification"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; git update-ref -d refs/omo-release-verify/alias 2>/dev/null || true' EXIT
if [[ "$NO_PUSH" == "1" ]]; then
  echo "release.sh: step 7 — remote verification SKIPPED (--no-push); verifying the WORKING TREE installer instead"
  DSH_HOME="$TMP/dsh-home" NO_PIAI=1 EXPLORE_PROVIDER=deepseek-official \
    EXPLORE_MODEL=deepseek-flash sh scripts/install-concerto.sh
  grep -q 'preset-concerto' "$TMP/dsh-home/profiles/web/cordis.patch.yml" \
    && echo "release.sh: working-tree install OK (declared row landed, DSH_HOME=$TMP/dsh-home)" \
    || { echo "release.sh: FAIL — working-tree install did not land the declared row" >&2; exit 1; }
else
curl -fsSL "https://raw.githubusercontent.com/${GH_REPO}/v${NEW}/scripts/install-concerto.sh" -o "$TMP/install.sh"
# T12b cutover: deepseek-flash is the id the pinned 0.2.x official route
# actually lists (installed dsh-llm-deepseek/lib/index.js:42-56 DEFAULT_MODELS).
DSH_HOME="$TMP/dsh-home" NO_PIAI=1 EXPLORE_PROVIDER=deepseek-official \
  EXPLORE_MODEL=deepseek-flash sh "$TMP/install.sh"
echo "release.sh: raw-tag install OK (DSH_HOME=$TMP/dsh-home)"

# 7b. ALIAS verification (PR #12 review, round 2) — the alias URL is what the
#    docs and the Pages wrapper actually publish, so IT is what must serve the
#    declaration-face installer. This assertion can only live HERE: the alias
#    moves at step 5/6, so any PRE-tag gate asserting its content deadlocks
#    the release that would move it (the round-1 d10 placement did exactly
#    that — release-check runs check-docs-consistency at steps 1/3, before the
#    tags exist at step 5; measured). Two hard legs (git protocol, no CDN
#    cache) + one smoke leg:
#    1. the REMOTE alias peels to the release commit just pushed;
#    2. the alias's own copy of the installer carries DECL_PATCH and not the
#       deleted .agent-presets write target;
#    3. a sandboxed install THROUGH the alias raw URL lands the declared row
#       (best-effort: raw CDN may serve the pre-move cache for a few minutes —
#       a mismatch there is a WARN, the git legs are the authority).
ALIAS_SHA="$(git ls-remote "$REMOTE" "refs/tags/$NEW_ALIAS^{}" | cut -f1)"
HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$ALIAS_SHA" != "$HEAD_SHA" ]]; then
  echo "release.sh: FAIL — remote alias $NEW_ALIAS peels to ${ALIAS_SHA:-<missing>}, not the release commit $HEAD_SHA (push the alias first)" >&2
  exit 1
fi
if ! git fetch --depth 1 --force "$REMOTE" "refs/tags/$NEW_ALIAS:refs/omo-release-verify/alias" >/dev/null 2>&1; then
  echo "release.sh: FAIL — cannot fetch the pushed alias $NEW_ALIAS back from $REMOTE for content verification" >&2
  exit 1
fi
ALIAS_INSTALLER="$(git show refs/omo-release-verify/alias:scripts/install-concerto.sh)" \
  || { git update-ref -d refs/omo-release-verify/alias; echo "release.sh: FAIL — alias $NEW_ALIAS has no scripts/install-concerto.sh" >&2; exit 1; }
git update-ref -d refs/omo-release-verify/alias
# (bash [[ == ]] with patterns, not printf|grep -q: under pipefail a grep -q
# early-exit SIGPIPEs the printf and the pipeline reads 141 even on a match.)
[[ "$ALIAS_INSTALLER" == *'DECL_PATCH='* ]] \
  || { echo "release.sh: FAIL — alias $NEW_ALIAS serves an installer without the declaration face (DECL_PATCH missing)" >&2; exit 1; }
if [[ "$ALIAS_INSTALLER" == *'DEST="${D}/.agent-presets'* ]]; then
  echo "release.sh: FAIL — alias $NEW_ALIAS still serves the deleted .agent-presets face" >&2
  exit 1
fi
echo "release.sh: alias $NEW_ALIAS content OK (peels to the release commit, declaration face)"
if curl -fsSL "https://raw.githubusercontent.com/${GH_REPO}/${NEW_ALIAS}/scripts/install-concerto.sh" -o "$TMP/install-alias.sh" \
    && grep -q 'DECL_PATCH=' "$TMP/install-alias.sh"; then
  DSH_HOME="$TMP/dsh-home-alias" NO_PIAI=1 EXPLORE_PROVIDER=deepseek-official \
    EXPLORE_MODEL=deepseek-flash sh "$TMP/install-alias.sh"
  grep -q 'preset-concerto' "$TMP/dsh-home-alias/profiles/web/cordis.patch.yml" \
    && echo "release.sh: alias-URL install OK (declared row landed)" \
    || { echo "release.sh: FAIL — alias-URL install did not land the declared row" >&2; exit 1; }
else
  echo "release.sh: WARN — the alias raw URL still serves the pre-move installer (CDN cache); the git legs above are the authority. Re-run the alias-URL install manually in a few minutes if you want the smoke."
fi
if [[ "$WAIT_PAGES" -gt 0 ]]; then
  echo "release.sh: polling Pages /install (up to ${WAIT_PAGES}s, best effort)"
  DEADLINE=$((SECONDS + WAIT_PAGES))
  PAGES_OK=0
  while [[ $SECONDS -lt $DEADLINE ]]; do
    if curl -fsSL "https://linletian.github.io/oh-my-opendsh/install" 2>/dev/null | grep -q 'install-concerto'; then
      PAGES_OK=1
      break
    fi
    sleep 15
  done
  if [[ "$PAGES_OK" == "1" ]]; then
    echo "release.sh: Pages /install live"
  else
    echo "release.sh: WARN — Pages /install not live within ${WAIT_PAGES}s (check the Pages build; raw tag URL already verified)"
  fi
fi
fi  # NO_PUSH: remote legs skipped above

# 8. gh release
if [[ "$NO_GH" == "1" ]]; then
  echo "release.sh: step 8/8 — gh release SKIPPED (--no-gh)"
elif command -v gh >/dev/null 2>&1; then
  echo "release.sh: step 8/8 — GitHub Release"
  NOTES="$TMP/notes.md"
  # F5 (PR #1 review): the notes are generated in release-bump.mjs right after
  # the matrix render (single place, no sed section-slicing here). The sed
  # path below is a best-effort fallback only.
  if [ -f ".omo/release-notes-${NEW}.md" ]; then
    cp ".omo/release-notes-${NEW}.md" "$NOTES"
  else
    {
      sed -n '/^## v'"$NEW"' /,/^## /p' CHANGELOG.md | sed '$d'
      echo ""
      echo "---"
      echo ""
      echo "Compatibility snapshot:"
      sed -n '/^## Tested combinations/,/^## Untested/p' docs/compat-matrix.md | sed '$d'
    } > "$NOTES"
  fi
  gh release create "v$NEW" --repo "$GH_REPO" --title "v$NEW" --notes-file "$NOTES" || {
    echo "release.sh: WARN — gh release create failed; create it manually with the notes in $NOTES" >&2
  }
else
  echo "release.sh: step 8/8 — gh CLI not found; create the GitHub Release manually (notes = CHANGELOG top section + matrix snapshot)"
fi

echo ""
echo "release.sh: DONE — v$NEW tagged, pushed, install verified (alias $NEW_ALIAS moved)."
echo "  one-liner to hand out: curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh"
echo "  matrix: .omo/compat.yaml + docs/compat-matrix.md; next: follow-ups in docs/release-process §9"

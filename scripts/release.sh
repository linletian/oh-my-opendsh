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
#   7. verify     — sandboxed install from the NEW tag's raw URL; best-effort
#                   Pages /install poll
#   8. gh release — GitHub Release with changelog + matrix snapshot (if gh auth)
#
# Exit: 0 on a completed release (or a complete dry-run plan); non-zero at the
# first failing step. Nothing is written until every preflight gate is green.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RELEASE_BRANCH="${RELEASE_BRANCH:-feature/dsh-omo-mvp}"
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
echo "release.sh: step 3/8 — post-bump consistency"
node scripts/check-docs-consistency.mjs
node scripts/verify-concerto-static.mjs

# 4. commit
echo "release.sh: step 4/8 — commit"
git add package.json scripts/install-concerto.sh README.md README_zh-CN.md \
  .omo/compat.yaml docs/compat-matrix.md docs/compat-matrix_zh-CN.md CHANGELOG.md
git commit -m "release: v$NEW"

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
#    then best-effort Pages /install poll (Pages builds async).
echo "release.sh: step 7/8 — install verification (sandboxed, new tag)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://raw.githubusercontent.com/${GH_REPO}/v${NEW}/scripts/install-concerto.sh" -o "$TMP/install.sh"
DSH_HOME="$TMP/dsh-home" NO_PIAI=1 EXPLORE_PROVIDER=deepseek-official \
  EXPLORE_MODEL=deepseek-v4-flash sh "$TMP/install.sh"
echo "release.sh: raw-tag install OK (DSH_HOME=$TMP/dsh-home)"
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

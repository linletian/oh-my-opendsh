#!/usr/bin/env bash
# tests/e2e/fixtures/fake-sg.sh — P6-T6 MAJOR-1 the COMMITTED hermetic `sg`
# pre-seed (FORKS.md §5.1 「sg fixture：预置假 sg 二进制（OMO_AST_GREP_SG_PATH 指入）」).
#
# WHY THIS FILE EXISTS. The `ast-grep-sg-provision` listener fires on every
# `session/created` and, when the resolver's three gates are ALL empty, schedules
# a REAL GitHub download of the pinned 0.43.0 release (8.1 MB). Before this fixture
# the e2e driver exported nothing, so EVERY scenario boot did exactly that:
# arbitration ARBITRATION-r1.md B-MAJOR-1 reproduced it twice and left the proof
# on disk — `<sandbox>/home/.omo/runtime/ast-grep/linux-x64/.sg-<uuid>.partial`,
# which sg-provisioner.ts:220-224 can only produce AFTER fetch + sha256 verify +
# extract have all completed. 43 scenarios × 8.1 MB ≈ 350 MB per gate run, plus
# network egress the harness is not allowed to have.
#
# HOW IT SEALS THAT. `findSgBinarySync` gate ① is
# `OMO_AST_GREP_SG_PATH` → existsSync/isFile/size>0 (sg-resolver.ts:179-180,
# upstream verbatim). drive.mjs's `scenarioEnv` exports this file's absolute path
# for EVERY scenario, so gate ① short-circuits and the provisioner is never
# reached — no fetch, no `.partial`, no egress. The resolver was not modified to
# achieve it: the override is upstream's own first gate.
#
# WHY A SCRIPT AND NOT AN EMPTY FILE. Gate ① requires isFile && **size > 0**
# (defaultFileExists, sg-resolver.ts:65-74, the predicate at :69) — so a ZERO-BYTE
# file does NOT seal anything: gate ① rejects it, the resolver falls through to ②
# and ③, and the real GitHub download OPENS AGAIN. (This sentence used to claim the
# opposite — "a zero-byte file would seal the download too" — which was false and
# contradicted the self-test leg written in the same round, drive.mjs:24325 (the
# `stats.size === 0` predicate itself; :24323 is its statSync line), whose case
# exists precisely to refuse this. ARBITRATION-r2 B-R2-MINOR-2.)
# A file that is non-empty but NOT executable does seal the download — gate ① asks
# no X_OK — while handing T7's real scenario (`ast-grep-sg-via-bash`) an unrunnable
# blob that fails for a reason unrelated to what that scenario tests. So this is a
# non-empty EXECUTABLE script, and it answers `--version` with the string the
# resolver's own probe looks for (`isAstGrepVersionOutput`: output must contain
# `ast-grep`, sg-resolver.ts:92-94).
#
# NEVER SILENT. Any OTHER invocation means something tried to actually USE sg
# through the pre-seed. That is not this fixture's job, and a fixture that quietly
# exits 0 on work it did not do is how a fake starts passing for real: so every
# other argv prints a NAMED line on stderr and exits 2.
#
# THE VERSION STRING IS NOT DECORATIVE. `ast-grep 0.43.0` must match
# SG_PINNED_VERSION in patches/omo-dsh/omo-hooks/src/ast-grep/sg-manifest.ts —
# drive.mjs's self-test leg reads that pin and compares it against what this
# script actually prints, so bumping the pin without touching this file goes red
# at gate 3 before any boot.
#
# Shell, not Node: a fake `sg` must not need the repo's runtime, node_modules, or
# any import resolution to answer. Zero dependencies, zero reads, zero writes.
set -uo pipefail

if [[ "${1:-}" == "--version" ]]; then
  echo "ast-grep 0.43.0"
  exit 0
fi

echo "[fake-sg] not implemented: $*" >&2
exit 2

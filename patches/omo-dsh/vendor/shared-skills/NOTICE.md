# NOTICE

This copy of `@oh-my-opencode/shared-skills` was vendored from
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) at tag
`v4.19.4`, commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`, from two upstream
paths:

- `packages/shared-skills/skills/` — 17 skills, 286 files
- `packages/omo-senpi/skills/{ultrawork,hyperplan}/` — 2 skills, 1 file each
  (the senpi command-instruction content, vendored as content for the
  keyword-mode and `/hyperplan` command surfaces)

**This copy has been MODIFIED.**

The complete list of modifications is recorded in the sibling file
`VENDOR-MANIFEST.json` (`deviations[]`), per file with a sha256 of the copy on
disk. Two kinds of change exist, and only these two:

1. **`package.json`** gained `"license": "SUL-1.0"` (decision D15 ¶1). No other
   field was touched.
2. **The `start-work` skill was renamed to `ulw-execute`** (11 files, 40
   token-level renames) to follow this project's v5 naming anchor. Nothing else
   in any skill body was rewritten: no carrier-narrowing note, no harness
   adaptation, no semantic edit. The pre-rename upstream sha256 of every
   renamed file is kept in the manifest as the second half of the two-way
   anchor (R-8), so the upstream text stays byte-addressable for a targeted
   intake.

Two literals named after the old skill were deliberately **kept verbatim**,
because they are OMO runtime carrier paths, not references to the skill's
name — renaming them would have silently repointed an instruction at a path
this project never creates: `.omo/start-work/ledger.jsonl` and
`components/start-work-continuation`. Both are recorded in the manifest's
rename deviation and are already tracked as carrier-narrowing differences by
the `omo-hooks` H-32 port (phase 3).

Copyright remains with the original author, **code-yeongyu**. This copy is
distributed under the Sustainable Use License 1.0 (SUL-1.0); the license text
is kept at the repository root in `LICENSES/oh-my-openagent.LICENSE.md`. This
project claims only that it has modified the copy — it does not re-attribute
the work to itself and makes no implication of any commercial license or
commercial-use right.

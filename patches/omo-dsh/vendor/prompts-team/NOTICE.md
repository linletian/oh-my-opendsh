# NOTICE

This copy of the OMO **team-mode prompt surfaces** was vendored from
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) at tag
`v4.19.4`, commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`:

| vendored file | upstream path | bytes |
|---|---|---|
| `prompts/mode/team.md` | `packages/prompts-core/prompts/mode/team.md` | 615 B / 2 lines |
| `src/features/builtin-skills/skills/team-mode.ts` | `packages/skills-loader-core/src/features/builtin-skills/skills/team-mode.ts` | 9450 B / 204 lines |

Both content files are **byte-for-byte verbatim** at the frozen tag (the
sha256 anchors are in `VENDOR-MANIFEST.json`; `team.md` is additionally
cross-pinned by the P5-T1 evidence `.omo/evidence/p5t1/Q1b-teamcore-teammd.md`
§5). The package as a whole is a **project-new package identity**
(`@oh-my-opencode/prompts-team`) spanning those two upstream packages —
the T1 arbitration (Q1b N5) widened the vendor list from one item to two
because the keyword-detector's `TEAM_MESSAGE` carrier (`team.md`) is only
the keyword-hit lead instruction, while the real lead run protocol
(Closure Contract / tool gating / bounds) lives in the `team-mode` skill
template.

**This copy has NOT been modified in its content files** — the two content
rows above are `verbatim`. The known upstream text contradictions are NOT
silently rewritten here; they are registered as `deviations[]` notes in
`VENDOR-MANIFEST.json`:

- **N1 — `status:"failed"` is a hollow instruction.** The `team-mode`
  template's Closure Contract teaches "Every task is in a terminal state:
  `completed` or `failed`", and `team.md` teaches re-checking after every
  `team_task_update` that "completes or fails" a task — but the vendored
  `@oh-my-opencode/team-core` tasklist schema (and this repo's
  `TEAM_TASK_STATUSES`, `omo-team/src/tools/team-task.ts`) has **no
  `failed` state** (`pending|claimed|in_progress|completed|deleted`). The
  bodies stay verbatim; the adaptation authority is the vendored tasklist
  schema (Q1b N1 ruling).
- **N9 — delegation-tool name drift.** `team.md` names `delegate_task`
  (underscore) and the `team-mode` template names `delegate-task`
  (hyphen); **neither exists on DSH** — the delegation tool surface here
  is the roster's ten delegation toolNames (`omo-agents/src/roster.ts`).
  Bodies verbatim; the drift is registered, not fixed (Q1b N9 ruling).
- **Dangling import (playbook M-3).** `team-mode.ts:1` imports the
  `BuiltinSkill` type from `../types`, which is NOT part of this vendored
  subset. Dangling specifiers are recorded, not rewritten. The file is
  archive content in this repo: nothing imports it; its two consumers are
  the drift detector and the registration-time readers
  (`omo-team/src/team/team-prompts-vendor.ts`).
- **Upstream carrier references.** The bodies mention `~/.omo/teams/`,
  worktree mode, tmux layout and "restart opencode" — upstream carrier
  prose kept verbatim by the P5-T12 narrowing ("载体引用段正文保真");
  DSH-side adaptation is carried by the tool-layer text, not by edits here.

**Consumption.** `prompts/mode/team.md` is the live injection body of the
keyword-detector's `team` slot: `omo-hooks` reads it from this path at
apply time (`keyword-detector/messages.ts`, the same disk-read shape as
the ultrawork/hyperplan SKILL.md bodies) and injects it verbatim on a
`TEAM_PATTERN` hit, stamped `source.kind = 'omo-team-keyword'` (Q-8 A1).
`src/features/builtin-skills/skills/team-mode.ts` is the archived lead
run protocol (docs-only upstream; the T13 upgrade surface reads it from
this path).

License: SUL-1.0 (the OMO repository-root `LICENSE.md`; neither upstream
package manifest carries a `license` field — the same fact recorded for the
hashline-core/team-core vendored packages, decisions D15/D16). The full
per-file enumeration and the deviation register are in
`VENDOR-MANIFEST.json`.

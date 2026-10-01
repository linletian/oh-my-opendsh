// P4-T2 — the Phase 4 command manifest single source of truth (plan §4.1;
// coverage baseline docs/plans/phase4-dev/phase4-commands.md §1.1 移植组).
//
// WHY EVERY EXPECTATION BELOW IS HARD-CODED. 同 tests/omo-hooks/manifest.test.ts
// 的纪律（那边是 Phase 3 的同款先例）：本套件的价值在于**变异敏感度**——从
// manifest.ts 派生期望值的测试会同意 manifest.ts 的任何漂移，因而毫无价值。所以
// 期望 id 集合、逐行抽查的字段、以及 6 条计数，都是从覆盖基线 §1.1 **手抄**的。
// 若某行变更，本文件必须同 commit 修改——那份刻意的摩擦正是计划书 §4.1 单一事实源
// 规则 + 门 2 一致性单测要的阻力。
//
// 骨架阶段（P4-T2）的事实前提：**6 行全部 status='pending'**，因为本任务只交付包
// 骨架与声明式事实，尚无任何命令实现、单测或 e2e 场景。这些断言是硬编码的事实而
// 非长度，所以「行偷偷翻转成 ported」无法蒙混过关——翻转须与 handler + 单测 +
// 该行点名的 e2e 场景同 commit 落地（manifest.ts 头部的行翻转条件）。
//
// The `.ts` extension in the import path is load-bearing: Node 24
// type-stripping does no specifier resolution and this workspace has no
// bundler (the P-8.6 rationale is recorded in
// patches/omo-dsh/omo-commands/tsconfig.host.json's header, lines 6-8).
import { describe, expect, it } from 'vitest'
import {
  COMMAND_IDS,
  COMMAND_MANIFEST,
  COMMAND_MANIFEST_STATUSES,
  EXPECTED_COMMAND_COUNT,
  commandStatusSet,
  commandsByStatus,
  countsByStatus,
  validateManifest,
  type CommandManifestEntry,
} from '../../patches/omo-dsh/omo-commands/src/manifest.ts'
import { COMMAND_REGISTRARS } from '../../patches/omo-dsh/omo-commands/src/index.ts'

/**
 * phase4-commands.md §1.1 移植组 ids, in baseline order (C-02…C-07 → their
 * v5-named command ids), transcribed by hand. C-01 (`/goal`) is deliberately
 * ABSENT — it is the DSH-native skip row (`dsh-command-goal` 原生覆盖), and the
 * manifest covers the PORT group only; C-08 (ultrawork 关键词模式) is absent for
 * a different reason: it is not a command at all (H-33, an omo-hooks pre-step
 * listener), so it lands in the hooks roster, not here.
 *
 * ⚠️ THREE-PLACE HARD-CODING DISCIPLINE. This list is transcription #1 of 3;
 * the other two are the row table in `src/manifest.ts` and the coverage
 * baseline's §1.1 port group. Adding / removing / renaming a command must edit
 * all three in the same commit (and a port landing additionally flips the
 * `status` of its row here and in manifest.ts, baseline doc FIRST). The
 * intentional friction is the point — see the file header.
 */
const EXPECTED_IDS: readonly string[] = [
  'ulw-execute',
  'ulw-plan',
  'hyperplan',
  'stop-continuation',
  'handoff',
  'remove-ai-slops',
]

/**
 * A status value that is deliberately OUTSIDE the 'pending' | 'ported'
 * vocabulary, used by the countsByStatus defensive-tail test. It is the
 * coverage-baseline phrasing 「已移植（场景 xxx）」 (phase3-plan.md §4.8 style:
 * a flipped row named with its e2e scenario) precisely because that is the
 * shape a future author is most likely to paste into a row — the manifest's
 * closed union must still count it visibly instead of dropping it.
 */
const OUT_OF_VOCABULARY_STATUS = '已移植（场景 xxx）'

/**
 * The harness's own row shape, WIDENED on purpose — 同 tests/omo-hooks/
 * manifest.test.ts 的理由：validateManifest exists to reject malformed INPUT, so
 * the negative tests must be able to build rows that the manifest.ts literal
 * types would refuse at compile time (an illegal status 'ported-ish', a
 * non-tag-relative upstream path). Deriving this from the real module's narrowed
 * `CommandManifestEntry` would make every malformed fixture a type error — i.e.
 * the rejection tests could not be written at all.
 */
interface RowFixture {
  id: string
  upstreamSources: readonly string[]
  argumentHint: string | null
  agentBinding: string | null
  effectSummary: string
  e2eScenario: string
  status: string
}

/** One legal baseline row, so each negative test changes exactly ONE field. */
function legalRow(overrides: Partial<RowFixture> = {}): RowFixture {
  return {
    id: 'fixture-command',
    upstreamSources: ['packages/omo-opencode/src/features/builtin-commands/templates/fixture.ts'],
    argumentHint: '[fixture-arg]',
    agentBinding: null,
    effectSummary: 'fixture summary',
    e2eScenario: 'fixture-scenario',
    status: 'pending',
    ...overrides,
  }
}

/**
 * `n` distinct legal rows — validateManifest also pins the row COUNT
 * (EXPECTED_COMMAND_COUNT), so any negative case must supply a full-length roster
 * or the count check would fire first and mask the check under test.
 */
function legalRows(count: number): RowFixture[] {
  return Array.from({ length: count }, (_unused, index) => legalRow({
    id: `fixture-command-${index}`,
  }))
}

/** Calls validateManifest with widened fixtures and returns the thrown message. */
function rejectionMessage(rows: readonly RowFixture[]): string {
  try {
    validateManifest(rows as readonly CommandManifestEntry[])
    throw new Error('validateManifest accepted an invalid roster')
  } catch (err) {
    if (err instanceof Error) return err.message
    throw err
  }
}

describe('P4-T2 COMMAND_MANIFEST — shape and content', () => {
  it('① accepts the real COMMAND_MANIFEST as currently authored', () => {
    // Non-vacuous by construction, not by this line: validateManifest's first
    // statement is the EXPECTED_COMMAND_COUNT equality (manifest.ts check 0 —
    // the guard BEFORE the per-row loop), so an empty table throws
    // "expected 6 command entries, got 0" rather than passing a bare call.
    // The explicit length assertion documents that intent.
    expect(COMMAND_MANIFEST.length).toBeGreaterThan(0)
    expect(() => validateManifest(COMMAND_MANIFEST)).not.toThrow()
  })

  it('② declares exactly 6 entries — the P4-T1 measured port group (C-02…C-07)', () => {
    // Pins phase4-commands.md §6: 命令移植组 = 6（C-01 原生跳过、C-08 非命令）。
    expect(COMMAND_MANIFEST.length).toBe(6)
    expect(COMMAND_MANIFEST.length).toBe(EXPECTED_COMMAND_COUNT)
  })

  it('③ ids equal the hard-coded 6-id list, in coverage-baseline order', () => {
    expect(COMMAND_IDS).toEqual([...EXPECTED_IDS])
    expect([...new Set(COMMAND_IDS)].length).toBe(EXPECTED_IDS.length)
  })

  it('③ the raw entry ids match too — COMMAND_IDS cannot disagree with the table', () => {
    expect(COMMAND_MANIFEST.map((entry) => entry.id)).toEqual([...EXPECTED_IDS])
  })

  it('declares exactly the two-value status vocabulary, as array and as set', () => {
    // Both halves are asserted against EXTERNAL literals on purpose: the array
    // assertion pins the declared order, and the set assertion pins the set's
    // CONTENTS (sorted, since Set iteration order is not a contract). Asserting
    // the set against the array instead — `toEqual([...COMMAND_MANIFEST_STATUSES])`
    // — is a construction equation: it holds for ANY array the module exports
    // and would keep passing if both were widened to a third value.
    expect([...COMMAND_MANIFEST_STATUSES]).toEqual(['pending', 'ported'])
    expect([...commandStatusSet].sort()).toEqual(['pending', 'ported'])
  })

  it('splits the roster by status as of P4-T10 (four ported, two pending)', () => {
    // The hard-coded facts, not lengths: a row silently flipping to 'ported'
    // would let a command with no handler look shipped, and a row silently
    // REVERTING to 'pending' after its handler landed would make the boot stop
    // registering a command that exists. Both directions are named here.
    // P4-T10 flipped `ulw-execute` (handler + unit tests landed; its e2e is T11,
    // the same deliberate exception the other ported rows carry). The two still
    // pending are the ones with NO handler at all — `ulw-plan` must stay
    // unregistered (registering it would shadow the skill gesture bridge, see
    // that row's comment) and `hyperplan` is not started.
    expect(commandsByStatus(COMMAND_MANIFEST, 'pending').map((row) => row.id)).toEqual([
      'ulw-plan',
      'hyperplan',
    ])
    expect(commandsByStatus(COMMAND_MANIFEST, 'ported').map((row) => row.id)).toEqual([
      'ulw-execute',
      'stop-continuation',
      'handoff',
      'remove-ai-slops',
    ])
  })

  it('every ported row HAS a registrar, and every registrar names a ported row', () => {
    // The manifest says ported ⇔ code exists. Asserted in BOTH directions, because
    // the T3 loop's failure mode is one-sided silence: a ported row with no
    // registrar quietly under-counts the summary, and a registrar with no ported
    // row is dead code that looks live.
    expect(Object.keys(COMMAND_REGISTRARS).sort())
      .toEqual(commandsByStatus(COMMAND_MANIFEST, 'ported').map((row) => row.id).sort())
  })
})

describe('P4-T2 COMMAND_MANIFEST — spot checks (hard-coded against phase4-commands.md §1.1)', () => {
  it('④ the C-01 /goal skip row really is absent (DSH-native coverage owns it)', () => {
    // C-01 处置 = 跳过（DSH 原生）：`dsh-goal` + `dsh-command-goal` 原生覆盖。
    // 它不得作为移植组行悄悄出现，除非覆盖基线先改判。
    expect(COMMAND_MANIFEST.some((row) => row.id === 'goal')).toBe(false)
    expect(COMMAND_IDS).not.toContain('goal')
    expect(COMMAND_MANIFEST.some(
      (row) => row.upstreamSources.some((file) => file.includes('templates/goal.ts')),
    )).toBe(false)
  })

  it('④ no row carries the deferred/排除 surfaces (refactor 模板 / auto-slash 胶水)', () => {
    // D-01 `/refactor` 命令面 deferred → Phase 6；D-06 `disabled_commands` 配置与
    // claude-code-command-loader 胶水排除（opencode 平台耦合）。二者都不得进移植组。
    expect(COMMAND_MANIFEST.some(
      (row) => row.upstreamSources.some((file) => file.includes('refactor')),
    )).toBe(false)
    expect(COMMAND_MANIFEST.some(
      (row) => row.upstreamSources.some((file) => file.includes('claude-code-command-loader')),
    )).toBe(false)
    // D-05 senpi 排除项：give-me-tips / ulw-loop / senpi 版 ulw-research。
    expect(COMMAND_MANIFEST.some(
      (row) => row.upstreamSources.some((file) => (
        file.includes('give-me-tips') || file.includes('ulw-loop')
      )),
    )).toBe(false)
  })

  it('④ ulw-execute is the v5-named C-02 row: 2 sources, atlas binding, verbatim flags', () => {
    const entry = COMMAND_MANIFEST.find((row) => row.id === 'ulw-execute')
    expect(entry).toBeDefined()
    // v5 naming anchor on the id, v4.19.4 paths in the source attribution
    // (ROADMAP §2 规则 6) — the 改名 never moves the 署名 anchor.
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/builtin-commands/templates/start-work.ts',
      'packages/omo-opencode/src/features/builtin-commands/commands.ts',
    ])
    // argumentHint 逐字取 commands.ts:75.
    expect(entry?.argumentHint).toBe('[plan-name] [--worktree <path>] [--make-pr] [--ship]')
    // DSH 命令 API 无 per-command agent 字段（计划书 §4.2）→ 本列记模板文本绑定.
    expect(entry?.agentBinding).toBe('atlas')
    expect(entry?.e2eScenario).toBe('ulw-execute-command-activates-atlas')
    expect(entry?.status).toBe('ported')
    expect(COMMAND_IDS[0]).toBe('ulw-execute')
  })

  it('④ ulw-execute records BOTH halves of the R-10 marker (template + wrapper)', () => {
    // P4-T1 实测更正：`<session-context>` 段在 commands.ts:67-70 的 wrapper，
    // `You are starting an Atlas work session.` 在 start-work.ts:1。H-32 的激活
    // 检测认这两个 marker，所以缺任一半就是残缺的对接面——摘要必须同时点名两处。
    const entry = COMMAND_MANIFEST.find((row) => row.id === 'ulw-execute')
    expect(entry?.effectSummary).toContain('<session-context>')
    expect(entry?.effectSummary).toContain('You are starting an Atlas work session.')
  })

  it('④ ulw-plan is the skill-as-command row: 6 upstream files, no builtin-command source', () => {
    const entry = COMMAND_MANIFEST.find((row) => row.id === 'ulw-plan')
    expect(entry).toBeDefined()
    // 6 文件 = SKILL.md + agents/openai.yaml + references/×3 + scripts/scaffold-plan.mjs
    // （实测，覆盖基线 §2 S4-15 相符）。上游**不是内建命令**：无 commands.ts 条目。
    expect(entry?.upstreamSources).toEqual([
      'packages/shared-skills/skills/ulw-plan/SKILL.md',
      'packages/shared-skills/skills/ulw-plan/agents/openai.yaml',
      'packages/shared-skills/skills/ulw-plan/references/full-workflow.md',
      'packages/shared-skills/skills/ulw-plan/references/intent-clear.md',
      'packages/shared-skills/skills/ulw-plan/references/intent-unclear.md',
      'packages/shared-skills/skills/ulw-plan/scripts/scaffold-plan.mjs',
    ])
    expect(entry?.upstreamSources.some(
      (file) => file.includes('features/builtin-commands'),
    )).toBe(false)
    // prometheus 人格经 skill 正文生效 → 无 agent 绑定。
    expect(entry?.agentBinding).toBeNull()
    expect(entry?.e2eScenario).toBe('ulw-plan-loads-prometheus-skill')
    // 零代码落地是本行的关键否决点：omo-commands 不得注册同名命令，否则抢先于
    // dsh-tool-skill 的手势桥（commands admission miss 才落回普通 prompt）。
    expect(entry?.effectSummary).toContain('手势桥')
    expect(entry?.effectSummary).toContain('不注册同名命令')
  })

  it('④ hyperplan is the degraded C-04 row: template + senpi skill, 2 sources', () => {
    const entry = COMMAND_MANIFEST.find((row) => row.id === 'hyperplan')
    expect(entry).toBeDefined()
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/builtin-commands/templates/hyperplan.ts',
      'packages/omo-senpi/skills/hyperplan/SKILL.md',
    ])
    // argumentHint 逐字取 commands.ts:114。
    expect(entry?.argumentHint).toBe('[planning-request]')
    expect(entry?.agentBinding).toBeNull()
    // 降级形态的成因（team_create 无等价面）必须留在摘要里，否则实施期会把
    // 完整对抗评审环误当成本阶段的承诺。
    expect(entry?.effectSummary).toContain('team_create')
    expect(entry?.effectSummary).toContain('降级')
    expect(entry?.e2eScenario).toBe('hyperplan-degraded-noted')
  })

  it('④ stop-continuation is the C-05 row: template + the 3-file guard tree, no args', () => {
    const entry = COMMAND_MANIFEST.find((row) => row.id === 'stop-continuation')
    expect(entry).toBeDefined()
    // guard 目录模块实测恰 3 文件（含 index.test.ts——本表按整棵上游树记账，
    // 不分 upstreamTestFiles 列，理由见 manifest.ts 头部）。
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/builtin-commands/templates/stop-continuation.ts',
      'packages/omo-opencode/src/hooks/stop-continuation-guard/hook.ts',
      'packages/omo-opencode/src/hooks/stop-continuation-guard/index.ts',
      'packages/omo-opencode/src/hooks/stop-continuation-guard/index.test.ts',
    ])
    // 上游 commands.ts 该条目无 argumentHint → null（不是空串）。
    expect(entry?.argumentHint).toBeNull()
    expect(entry?.agentBinding).toBeNull()
    // 跨插件停止标记 + 两个 DSH 停止面都必须点名。
    expect(entry?.effectSummary).toContain('H-03')
    expect(entry?.effectSummary).toContain('goal pause')
    expect(entry?.effectSummary).toContain('ctx.jobs')
    expect(entry?.e2eScenario).toBe('stop-continuation-halts-todo')
  })

  it('④ handoff is the single-template C-06 row with the verbatim [goal] hint', () => {
    const entry = COMMAND_MANIFEST.find((row) => row.id === 'handoff')
    expect(entry).toBeDefined()
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/builtin-commands/templates/handoff.ts',
    ])
    // argumentHint 逐字取 commands.ts:107。
    expect(entry?.argumentHint).toBe('[goal]')
    expect(entry?.agentBinding).toBeNull()
    // session_read 载体收窄必须可见（DSH 无现成模型工具）。
    expect(entry?.effectSummary).toContain('session_read')
    expect(entry?.e2eScenario).toBe('handoff-summary-driven')
  })

  it('④ remove-ai-slops is the C-07 dual-carrier row: template + 1-file skill', () => {
    const entry = COMMAND_MANIFEST.find((row) => row.id === 'remove-ai-slops')
    expect(entry).toBeDefined()
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts',
      'packages/shared-skills/skills/remove-ai-slops/SKILL.md',
    ])
    // 上游 commands.ts 该条目无 argumentHint → null。
    expect(entry?.argumentHint).toBeNull()
    expect(entry?.agentBinding).toBeNull()
    // D-03：team-mode addendum 段不移植（Phase 5）——摘要须保留这条边界。
    expect(entry?.effectSummary).toContain('team-mode addendum')
    expect(entry?.e2eScenario).toBe('remove-ai-slops-driven')
  })

  it('④ every row declares exactly one non-empty effectSummary and one e2e scenario', () => {
    // The cross-row invariants the per-row spot checks above do not cover: no row
    // may smuggle an empty string past its own check by living in a field the
    // spot checks never read.
    for (const entry of COMMAND_MANIFEST) {
      expect(entry.effectSummary.length, entry.id).toBeGreaterThan(0)
      expect(entry.e2eScenario.length, entry.id).toBeGreaterThan(0)
      expect(entry.upstreamSources.length, entry.id).toBeGreaterThan(0)
      // e2e 场景名是 kebab-case 且以字母开头（e2e 套件按名索引 drive.mjs 场景表）。
      expect(entry.e2eScenario, entry.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    }
  })

  it('④ the six e2e scenario names are distinct', () => {
    // A duplicate scenario name would make the e2e gate's SCENARIOS table
    // ambiguous (one name, two commands).
    const scenarios = COMMAND_MANIFEST.map((row) => row.e2eScenario)
    expect(new Set(scenarios).size).toBe(scenarios.length)
  })

  it('④ every upstream path is tag-relative, namespaced, and AGENTS.md-free', () => {
    // N-03 + provenance: a row citing an absolute path or a file outside
    // `packages/` has lost its 署名 anchor to the frozen v4.19.4 tag.
    //
    // THE REGEX BELOW IS DELIBERATELY ONE NOTCH STRICTER THAN THE IMPLEMENTATION.
    // The implementation only requires the `packages/` prefix (validateManifest
    // check 8); this test additionally pins the lowercase-kebab second segment
    // and the absence of whitespace, because the roster is hand-authored and
    // those are exactly the ways it drifts (`Packages/`, `omo_opencode`,
    // a stray space from a copy-paste). THE IMPLEMENTATION-SIDE CONTRACT IS
    // validateManifest, not this regex — do not "fix" a row by loosening it.
    for (const entry of COMMAND_MANIFEST) {
      for (const file of entry.upstreamSources) {
        expect(file, `${entry.id} ${file}`).toMatch(/^packages\/[a-z0-9-]+\//)
        expect(file.split('/').at(-1), `${entry.id} ${file}`).not.toBe('AGENTS.md')
        expect(file, `${entry.id} ${file}`).not.toMatch(/\s/)
      }
    }
  })
})

describe('P4-T2 validateManifest — rejection branches', () => {
  it('② throws on an empty id', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ id: '' })
    expect(rejectionMessage(rows)).toContain('empty id')
  })

  it('② throws on a duplicate id', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[1] = legalRow({ id: rows[0]?.id ?? '' })
    expect(rejectionMessage(rows)).toContain('duplicate command id')
  })

  it('② throws on an empty upstreamSources array', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ upstreamSources: [] })
    expect(rejectionMessage(rows)).toContain('declares no upstreamSources')
  })

  it('② throws on an empty effectSummary', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ effectSummary: '' })
    expect(rejectionMessage(rows)).toContain('empty effectSummary')
  })

  it('② throws on an empty e2eScenario', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ e2eScenario: '' })
    expect(rejectionMessage(rows)).toContain('empty e2eScenario')
  })

  it('② throws on an empty argumentHint ("no argument syntax" must be null)', () => {
    // The distinction the two optional columns exist to carry: an empty string
    // says "the author wrote something and it vanished", null says "upstream
    // declares none" (stop-continuation / remove-ai-slops). Collapsing them
    // would make the real manifest unable to distinguish its own two cases.
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ argumentHint: '' })
    // FULL message, not a fragment: the branch has to name the offending row
    // (its declared id — `legalRow` without an id override declares
    // 'fixture-command'), the field, AND the null-vs-empty-string rule it is
    // enforcing. A substring match would survive dropping the row id or the
    // trailing rule — the two parts a T8+ reader needs when a boot line fails.
    expect(rejectionMessage(rows)).toBe(
      `manifest: command 'fixture-command' declares an empty argumentHint`
      + ' — "no argument syntax" is null, not the empty string',
    )
  })

  it('② throws on an empty agentBinding ("no binding" must be null)', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ agentBinding: '' })
    expect(rejectionMessage(rows)).toBe(
      `manifest: command 'fixture-command' declares an empty agentBinding`
      + ' — "no agent binding" is null, not the empty string',
    )
  })

  it('② throws on an illegal status (outside the two-value vocabulary)', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ status: 'ported-ish' })
    expect(rejectionMessage(rows)).toContain("illegal status 'ported-ish'")
  })

  it('② throws on an empty status (the empty string is not a vocabulary value)', () => {
    // The unset-variable case reaching the status branch rather than being
    // silently accepted: `commandStatusSet.has('')` is false, so an empty
    // status must be REJECTED, not treated as "unspecified".
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ status: '' })
    expect(rejectionMessage(rows)).toContain("illegal status ''")
  })

  it('② throws on a non-tag-relative upstream path', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ upstreamSources: ['/abs/path/templates/fixture.ts'] })
    // FULL message, same rationale as the argumentHint/agentBinding cases: this
    // branch's tail clause ("upstream paths are v4.19.4 tag-relative…") is what
    // tells a T8+ reader WHY a path was refused, and it is invisible to a
    // substring match.
    expect(rejectionMessage(rows)).toBe(
      `manifest: command 'fixture-command' lists non-tag-relative source`
      + ` '/abs/path/templates/fixture.ts'`
      + ' — upstream paths are v4.19.4 tag-relative, e.g. packages/omo-opencode/…',
    )
  })

  it('② throws on an upstream path outside the packages/ namespace', () => {
    // Same branch as the case above (the implementation has ONE `packages/`
    // prefix check that subsumes absolute paths and in-repo relative paths), so
    // this sibling only has to prove the second input reaches the branch; the
    // message text is pinned there.
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ upstreamSources: ['scripts/local-scratch.ts'] })
    expect(rejectionMessage(rows)).toContain('non-tag-relative source')
  })

  it('② throws when AGENTS.md leaks into upstreamSources', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({
      upstreamSources: ['packages/omo-opencode/src/features/builtin-commands/AGENTS.md'],
    })
    // FULL message: the N-03 clause is the *reason* this branch exists, and it
    // is the part a future author needs when a legitimately-added doc file gets
    // rejected by the gate.
    expect(rejectionMessage(rows)).toBe(
      `manifest: command 'fixture-command' lists AGENTS.md in upstreamSources`
      + ' — upstream documentation is not a semantic source (N-03)',
    )
  })

  // SCOPE OF THE FULL-MESSAGE vs SUBSTRING SPLIT (read before adding a case).
  // `toBe` on the whole message is applied to the FOUR branches whose tail
  // clause carries a RULE a reader needs at a boot failure: null-vs-empty-string
  // (×2, the distinction the two optional columns exist for), tag-relative
  // prefixing, and the N-03 doc exclusion. The remaining branches keep
  // `toContain` on purpose: their messages are already fully identified by
  // row id + field name, so pinning the `manifest: command '…' declares …`
  // prefix would re-assert boilerplate without adding排障 information, and it
  // would make every future rewording of the prefix a false red.

  it('② accepts a full-length roster that changes nothing', () => {
    // The positive control for every negative case above: the fixture shape
    // itself is legal, so a rejection proves the field under test, not the
    // fixture.
    expect(() => validateManifest(legalRows(EXPECTED_COMMAND_COUNT) as readonly CommandManifestEntry[]))
      .not.toThrow()
  })

  it('② accepts null argumentHint / agentBinding (the "upstream declares none" form)', () => {
    // The other positive control: null must survive, since 4 of the 6 real rows
    // declare agentBinding null and 2 declare argumentHint null.
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ argumentHint: null, agentBinding: null })
    expect(() => validateManifest(rows as readonly CommandManifestEntry[])).not.toThrow()
  })

  it('⑤ throws when the roster is short (a dropped row is not a valid roster)', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows.pop()
    expect(rejectionMessage(rows)).toContain('expected 6 command entries, got 5')
  })

  it('⑤ throws when the roster is LONG (an extra row is not a valid roster either)', () => {
    // The count guard is an EQUALITY, not a floor. A table that grew a seventh
    // row — a command added without its coverage-baseline line, or a copy-paste
    // duplicate — must fail at apply() time (the loud-but-non-fatal boot line),
    // not quietly validate and mount a command the docs never authorised.
    const rows = legalRows(EXPECTED_COMMAND_COUNT + 1)
    expect(rejectionMessage(rows)).toContain('expected 6 command entries, got 7')
  })

  it('⑤ the count guard fires BEFORE any per-row check (a 1-row roster with a bad id is still a count error)', () => {
    // Proves the guard is check 0 and not a per-row check that a later fix could
    // reorder: the roster is both wrong-length AND malformed, and the reported
    // message must be the count one.
    const rows = [legalRow({ id: '' })]
    expect(rejectionMessage(rows)).toContain('expected 6 command entries, got 1')
  })
})

describe('P4-T2 derived helpers', () => {
  it('⑤ commandsByStatus filters by status and matches nothing for an empty status', () => {
    // P4-T6 起两条已移植，故这里断言「两个集合互补且并集为全体」，而不是某一侧
    // 为空 —— 后者在第一条命令落地时就失去意义，等于没有判据。
    const pending = commandsByStatus(COMMAND_MANIFEST, 'pending').map((row) => row.id)
    const ported = commandsByStatus(COMMAND_MANIFEST, 'ported').map((row) => row.id)
    expect(ported).toEqual(['ulw-execute', 'stop-continuation', 'handoff', 'remove-ai-slops'])
    expect([...pending, ...ported].sort()).toEqual([...COMMAND_IDS].sort())
    expect(pending.length + ported.length).toBe(COMMAND_MANIFEST.length)
    // An empty status matches nothing rather than everything: a caller passing
    // an unset variable must not be told the whole roster is in that state.
    expect(commandsByStatus(COMMAND_MANIFEST, '' as never)).toEqual([])
    expect(commandsByStatus([], 'pending')).toEqual([])
  })

  it('⑤ commandsByStatus preserves roster order in its result', () => {
    // Not `toEqual([...COMMAND_IDS])` any more: COMMAND_IDS is the full roster, so
    // that identity only held while every row was pending. The invariant is
    // "roster order preserved inside each filtered subset", asserted as the
    // filtered id list appearing in COMMAND_IDS order.
    // An arrow, not a detached `COMMAND_IDS.indexOf`: the bare method reference
    // loses its receiver (Array.prototype.indexOf called on undefined).
    const positions = (id: string): number => COMMAND_IDS.indexOf(id)
    const pending = commandsByStatus(COMMAND_MANIFEST, 'pending').map((row) => positions(row.id))
    const ported = commandsByStatus(COMMAND_MANIFEST, 'ported').map((row) => positions(row.id))
    expect(pending).toEqual([...pending].sort((a, b) => a - b))
    expect(ported).toEqual([...ported].sort((a, b) => a - b))
    expect([...pending, ...ported].sort((a, b) => a - b)).toEqual(COMMAND_IDS.map((_, index) => index))
  })

  it('⑤ countsByStatus derives both status counts for the boot-marker summary', () => {
    // The T3 summary line's fields come from here, never from a hard-coded
    // string — so this test pins the DERIVATION, not the rendered text.
    const counts = countsByStatus(COMMAND_MANIFEST)
    // P4-T10: 四条已移植。逐个数字手打，与 boot-markers.test.ts 的手打汇总行
    // （pending=2, ported=4, 4/6 registered）互为对账。
    expect(counts.get('pending')).toBe(2)
    expect(counts.get('ported')).toBe(4)
    // Both keys are present even at 0, so two boots stay line-comparable.
    expect([...counts.keys()]).toEqual([...COMMAND_MANIFEST_STATUSES])
    let total = 0
    for (const value of counts.values()) total += value
    expect(total).toBe(COMMAND_MANIFEST.length)
  })

  it('⑤ countsByStatus reports zeros for an empty roster, not an empty map', () => {
    const counts = countsByStatus([])
    expect([...counts.entries()]).toEqual([['pending', 0], ['ported', 0]])
  })

  it('⑤ countsByStatus adds an out-of-vocabulary status as its own key, never dropping it', () => {
    // Defensive tail (同 omo-hooks boot-markers 的 `other=` 纪律): a widened
    // fixture carrying a status outside the union must stay visible in the
    // counts — a silent drop would make "sum < row count" invisible.
    //
    // The sentinel literal is a LOCAL CONSTANT, not two inline copies: the
    // fixture and the expectation must be provably the same string (a
    // hand-typed mismatch would otherwise make this test pass for the wrong
    // reason — or fail for a typo nobody can see).
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ status: OUT_OF_VOCABULARY_STATUS })
    const counts = countsByStatus(rows as readonly CommandManifestEntry[])
    expect(counts.get('pending')).toBe(5)
    expect(counts.get('ported')).toBe(0)
    expect(counts.get(OUT_OF_VOCABULARY_STATUS as never)).toBe(1)
    expect([...counts.keys()].length).toBe(3)
  })

  it('⑤ countsByStatus counts a mixed roster correctly', () => {
    const rows = legalRows(EXPECTED_COMMAND_COUNT)
    rows[0] = legalRow({ status: 'ported' })
    rows[3] = legalRow({ status: 'ported' })
    const counts = countsByStatus(rows as readonly CommandManifestEntry[])
    expect(counts.get('pending')).toBe(4)
    expect(counts.get('ported')).toBe(2)
  })
})

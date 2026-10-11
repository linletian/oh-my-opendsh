// P5-T2 — the Phase 5 team manifest single source of truth (plan §4.2;
// coverage baseline docs/plans/phase5-dev/phase5-team.md §1/§3 + fork 裁定书
// .omo/evidence/p5t1/FORK.md §3.3).
//
// WHY EVERY EXPECTATION BELOW IS HARD-CODED. 同 tests/omo-hooks/manifest.test.ts
// 与 tests/omo-commands/manifest.test.ts 的纪律：本套件的价值在于**变异敏感度**
// ——从 manifest.ts 派生期望值的测试会同意 manifest.ts 的任何漂移，因而毫无
// 价值。所以期望 id 集合（逐字转抄 24 个）、行数钉死（24 = 13 §1 工具面 +
// 4 §3 接盘 + 7 vendor 子集）、抽查行的完整字段逐字对、处置/状态词表，全部
// 是从覆盖基线与裁定书**手抄**的。若某行变更，本文件必须同 commit 修改——
// 那份刻意的摩擦正是计划书 §4.2 单一事实源规则 + 门 6 一致性门要的阻力。
//
// 骨架阶段（P5-T2）的事实前提曾是 **22 行 status='pending'、2 行 status=
// 'recorded'**——recorded 是 team_list / team_wait 两条 recorded-difference
// 行的诚实终态（差异本身就是交付面，已成文于覆盖基线 §1 行 11/12）；其余行
// 的任何实现、单测或 e2e 场景都属 T3+。P5-T5 落了第一行 ported（team_create，
// 交付面见 manifest.ts 该行行注），现状 census 是 **21 pending / 1 ported /
// 2 recorded**（下方逐行 split 测试逐字钉死）。这些断言是硬编码的事实而非
// 长度，所以「行偷偷翻转」无法蒙混过关——翻转须与交付面同 commit 落地
// （manifest.ts 头部的 STATUS 段）。
//
// The `.ts` extension in the import path is load-bearing: Node 24
// type-stripping does no specifier resolution and this workspace has no
// bundler (the P-8.6 rationale is recorded in
// patches/omo-dsh/omo-team/tsconfig.host.json's header, lines 6-8).
import { describe, expect, it } from 'vitest'
import {
  EXPECTED_TEAM_MANIFEST_COUNT,
  TEAM_IDS,
  TEAM_MANIFEST,
  TEAM_MANIFEST_DISPOSITIONS,
  TEAM_MANIFEST_STATUSES,
  countsByDisposition,
  countsByStatus,
  formatLoadedSummaryLine,
  teamDispositionSet,
  teamStatusSet,
  teamsByDisposition,
  teamsByStatus,
  validateManifest,
  type TeamManifestEntry,
} from '../../patches/omo-dsh/omo-team/src/manifest.ts'

/**
 * 覆盖基线 §1（13 行，`team_task_list / team_task_get` 合行已拆）+ §3（4 行）
 * + FORK.md §3.3 子集（7 行）的 ids，按表顺序手抄。
 *
 * ⚠️ THREE-PLACE HARD-CODING DISCIPLINE. 本列表是转抄 #1 of 3；另两处是
 * `src/manifest.ts` 的行表与覆盖基线 §1/§3 + 裁定书 §3.3。增删改名一行必须
 * 同 commit 改三处（落地另加 status 翻转，**文档先行**）。刻意的摩擦是
 * 重点——见文件头。
 */
const EXPECTED_IDS: readonly string[] = [
  'team_create',
  'team_delete',
  'team_shutdown_request',
  'team_approve_shutdown',
  'team_reject_shutdown',
  'team_send_message',
  'team_task_create',
  'team_task_list',
  'team_task_update',
  'team_task_get',
  'team_status',
  'team_list',
  'team_wait',
  'team-keyword-injection',
  'hyperplan-upgrade',
  'remove-ai-slops-team-addendum',
  'stop-continuation-team',
  'vendor-team-core-types',
  'vendor-team-core-member-parser',
  'vendor-team-core-team-registry',
  'vendor-team-core-team-tasklist',
  'vendor-team-core-team-state-store',
  'vendor-team-core-closure',
  'vendor-team-prompts',
]

/**
 * canonical e2e 场景七名（**canonical 七名 = T1 仲裁定名，任务书 P5-T2 条已
 * 登记全集、T7（team-shutdown-handshake）/T8（team-task-claim）/T14 同注册**；
 * 手抄）。每行的
 * `e2eScenario` 必须落在这七枚字面量里；多行共享一名是有意的（24 行对
 * 7 名，omo-commands 先例：无自有场景的行指最相关者）。
 */
const CANONICAL_SCENARIOS: readonly string[] = [
  'team-create-and-message',
  'team-nested-create-denied',
  'team-teardown-no-orphans',
  'team-shutdown-handshake',
  'team-task-claim',
  'team-keyword-mode',
  'stop-continuation-team',
]

/**
 * The harness's own row shape, WIDENED on purpose — 同两包 manifest 单测的
 * 理由：validateManifest exists to reject malformed INPUT, so the negative
 * tests must be able to build rows that the manifest.ts literal types would
 * refuse at compile time (an illegal disposition 'native-invent', an illegal
 * status 'shipped'). Deriving this from the real module's narrowed
 * `TeamManifestEntry` would make every malformed fixture a type error — i.e.
 * the rejection tests could not be written at all.
 */
interface RowFixture {
  id: string
  upstreamSources: readonly string[]
  nativeFace: string
  disposition: string
  e2eScenario: string
  status: string
  summary: string
}

/** One legal baseline row, so each negative test changes exactly ONE field. */
function legalRow(overrides: Partial<RowFixture> = {}): RowFixture {
  return {
    id: 'fixture-team',
    upstreamSources: ['packages/team-core/src/types.ts'],
    nativeFace: 'fixture native face',
    disposition: 'ported',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary: 'fixture summary',
    ...overrides,
  }
}

/**
 * `n` distinct legal rows — validateManifest also pins the row COUNT
 * (EXPECTED_TEAM_MANIFEST_COUNT), so any negative case must supply a
 * full-length roster or the count check would fire first and mask the check
 * under test.
 */
function legalRows(count: number): RowFixture[] {
  return Array.from({ length: count }, (_unused, index) => legalRow({
    id: `fixture-team-${index}`,
  }))
}

/** Calls validateManifest with widened fixtures and returns the thrown message. */
function rejectionMessage(rows: readonly RowFixture[]): string {
  try {
    validateManifest(rows as readonly TeamManifestEntry[])
    throw new Error('validateManifest accepted an invalid roster')
  } catch (err) {
    if (err instanceof Error) return err.message
    throw err
  }
}

describe('P5-T2 TEAM_MANIFEST — shape and content', async () => {
  it('① accepts the real TEAM_MANIFEST as currently authored', async () => {
    // Non-vacuous by construction, not by this line: validateManifest's first
    // statement is the EXPECTED_TEAM_MANIFEST_COUNT equality (manifest.ts
    // check 0 — the guard BEFORE the per-row loop), so an empty table throws
    // "expected 24 team entries, got 0" rather than passing a bare call.
    expect(TEAM_MANIFEST.length).toBeGreaterThan(0)
    expect(() => validateManifest(TEAM_MANIFEST)).not.toThrow()
  })

  it('② declares exactly 24 entries — 13 §1 tool rows + 4 §3 handoff + 7 vendor subset', async () => {
    // Pins phase5-team.md §1（12 工具 + team_wait）+ §3 表四行 + FORK.md §3.3
    // 子集七行。Without the non-empty assertion a dropped collection (suite
    // never ran) would look like a green.
    expect(TEAM_MANIFEST.length).toBe(24)
    expect(TEAM_MANIFEST.length).toBe(EXPECTED_TEAM_MANIFEST_COUNT)
  })

  it('③ ids equal the hard-coded 24-id list, in coverage-baseline order', async () => {
    expect(TEAM_IDS).toEqual([...EXPECTED_IDS])
    expect([...new Set(TEAM_IDS)].length).toBe(EXPECTED_IDS.length)
  })

  it('③ the raw entry ids match too — TEAM_IDS cannot disagree with the table', async () => {
    expect(TEAM_MANIFEST.map((entry) => entry.id)).toEqual([...EXPECTED_IDS])
  })

  it('declares exactly the four-value disposition vocabulary (T1 更正后), as array and as set', async () => {
    // Both halves are asserted against EXTERNAL literals on purpose: the array
    // pins the declared order, the set pins the CONTENTS. Asserting the set
    // against the array instead is a construction equation that any widening
    // would keep passing (omo-commands 同款论证).
    expect([...TEAM_MANIFEST_DISPOSITIONS]).toEqual([
      'native-adopt',
      'ported',
      'content-vendor',
      'recorded-difference',
    ])
    expect([...teamDispositionSet].sort()).toEqual([
      'content-vendor',
      'native-adopt',
      'ported',
      'recorded-difference',
    ])
  })

  it('declares exactly the three-value status vocabulary (omo-commands discipline + recorded terminal), as array and as set', async () => {
    expect([...TEAM_MANIFEST_STATUSES]).toEqual(['pending', 'ported', 'recorded'])
    expect([...teamStatusSet].sort()).toEqual(['pending', 'ported', 'recorded'])
  })

  it('splits the roster by status as of P5-T12 (8 pending, FOURTEEN ported, 2 recorded)', async () => {
    // The hard-coded facts, not lengths. ZERO ported was the load-bearing half
    // at P5-T2; P5-T5 flips team_create to 'ported' (the delivery surface —
    // src/tools/team-create.ts + team-state.ts + roster-seats.ts — landed);
    // P5-T6 flips team_send_message (src/tools/team-message.ts + the
    // team-state.ts dedup ledger + the full-segment e2e scenario); **P5-T7
    // flips five** — team_delete / team_shutdown_request / team_approve_shutdown
    // / team_reject_shutdown / team_status (src/tools/{team-shutdown,
    // team-delete,team-status}.ts + the team-state.ts handshake ledger + the
    // handshake unit suites + the `team-shutdown-handshake` e2e scenario);
    // P5-T8b flips the task quartet; P5-T9 flips `stop-continuation-team`
    // (the guard's team branch in omo-hooks + the read-only member query
    // surface here + the `stop-continuation-team` / `team-teardown-no-orphans`
    // e2e pair); **P5-T12 flips two** — `team-keyword-injection` (the wired
    // team slot in omo-hooks: kind `omo-team-keyword`, member-side non-release
    // per Q-8, + the boot-time integrity/contract face here + the
    // `team-keyword-mode` e2e scenario) and `vendor-team-prompts` (the two
    // verbatim files under vendor/prompts-team/ + the integrity gate registrar
    // + the same e2e scenario). A
    // row silently flipping to 'ported' without a delivery surface would claim
    // a port that does not exist (T8 owns the next flip). The two recorded
    // rows are the honest terminal for recorded-difference rows — their
    // deliverable IS the recorded difference (§1 行 11/12).
    expect(teamsByStatus(TEAM_MANIFEST, 'pending').map((row) => row.id)).toEqual([
      'hyperplan-upgrade',
      'remove-ai-slops-team-addendum',
      'vendor-team-core-types',
      'vendor-team-core-member-parser',
      'vendor-team-core-team-registry',
      'vendor-team-core-team-tasklist',
      'vendor-team-core-team-state-store',
      'vendor-team-core-closure',
    ])
    expect(teamsByStatus(TEAM_MANIFEST, 'ported').map((row) => row.id)).toEqual([
      'team_create',
      'team_delete',
      'team_shutdown_request',
      'team_approve_shutdown',
      'team_reject_shutdown',
      'team_send_message',
      'team_task_create',
      'team_task_list',
      'team_task_update',
      'team_task_get',
      'team_status',
      'team-keyword-injection',
      'stop-continuation-team',
      'vendor-team-prompts',
    ])
    expect(teamsByStatus(TEAM_MANIFEST, 'recorded').map((row) => row.id)).toEqual([
      'team_list',
      'team_wait',
    ])
  })

  it('splits the roster by disposition (0 native-adopt / 11 ported / 11 content-vendor / 2 recorded-difference)', async () => {
    // Zero native-adopt rows is a hard-coded INTENTIONAL fact (manifest.ts
    // header: fork (B) 下 §1 无「零移植原生覆盖」的工具行；原生覆盖的事实
    // 住在覆盖基线 §2). A row flipping INTO native-adopt without a baseline
    // reversal is exactly what this pin catches.
    expect(teamsByDisposition(TEAM_MANIFEST, 'native-adopt')).toEqual([])
    expect(teamsByDisposition(TEAM_MANIFEST, 'ported').map((row) => row.id)).toEqual([
      'team_create',
      'team_delete',
      'team_shutdown_request',
      'team_approve_shutdown',
      'team_reject_shutdown',
      'team_send_message',
      'team_status',
      'team-keyword-injection',
      'hyperplan-upgrade',
      'remove-ai-slops-team-addendum',
      'stop-continuation-team',
    ])
    expect(teamsByDisposition(TEAM_MANIFEST, 'content-vendor').map((row) => row.id)).toEqual([
      'team_task_create',
      'team_task_list',
      'team_task_update',
      'team_task_get',
      'vendor-team-core-types',
      'vendor-team-core-member-parser',
      'vendor-team-core-team-registry',
      'vendor-team-core-team-tasklist',
      'vendor-team-core-team-state-store',
      'vendor-team-core-closure',
      'vendor-team-prompts',
    ])
    expect(teamsByDisposition(TEAM_MANIFEST, 'recorded-difference').map((row) => row.id)).toEqual([
      'team_list',
      'team_wait',
    ])
  })

  it('every row names exactly one canonical e2e scenario (七名封闭集)', async () => {
    for (const entry of TEAM_MANIFEST) {
      expect(CANONICAL_SCENARIOS, `${entry.id} ${entry.e2eScenario}`)
        .toContain(entry.e2eScenario)
    }
    // 唯一未被任何行指用的 canonical 名 = team-nested-create-denied（它证明
    // team_create 的嵌套拒绝半边，主场景字段归 team-create-and-message——
    // manifest.ts 头部成文的例外，不是漏指）。
    const used = new Set(TEAM_MANIFEST.map((row) => row.e2eScenario))
    // 手打的已用六名（sorted）：六名齐、第七名缺席——缺席名单即上面的注。
    expect([...used].sort()).toEqual([
      'stop-continuation-team',
      'team-create-and-message',
      'team-keyword-mode',
      'team-shutdown-handshake',
      'team-task-claim',
      'team-teardown-no-orphans',
    ])
    expect(used.has('team-nested-create-denied')).toBe(false)
  })
})

describe('P5-T2 TEAM_MANIFEST — spot checks (hard-coded against phase5-team.md / FORK.md)', async () => {
  it('④ team_create is the first §1 row: 2 sources incl. hooks/ gating, startContinuable face', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'team_create')
    expect(entry).toBeDefined()
    // gating 源实测住在 packages/omo-opencode/src/hooks/team-tool-gating/（不在
    // features/team-mode/ 下）——§1 简写的补全，路径错位即红。
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/team-mode/tools/lifecycle-create-tool.ts',
      'packages/omo-opencode/src/hooks/team-tool-gating/hook.ts',
    ])
    expect(entry?.nativeFace).toContain('startContinuable')
    expect(entry?.disposition).toBe('ported')
    expect(entry?.e2eScenario).toBe('team-create-and-message')
    // P5-T5 翻行：status 'pending'→'ported'（交付面见 manifest.ts 行注与
    // boot-markers.test.ts 的同 commit 翻针）——本 pin 随翻行同步。
    expect(entry?.status).toBe('ported')
    // 嵌套拒绝与两项记差异必须留在摘要里（T5 的判据面）。
    expect(entry?.summary).toContain('嵌套拒绝')
    expect(entry?.summary).toContain('记差异')
    expect(TEAM_IDS[0]).toBe('team_create')
  })

  it('④ team_send_message carries the lead-relay difference and the kind discipline', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'team_send_message')
    expect(entry).toBeDefined()
    // mailbox 本体不 vendor（FORK.md §3.3）但错误族语义源必须点名 team-core。
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/team-mode/tools/messaging.ts',
      'packages/team-core/src/team-mailbox/send.ts',
    ])
    expect(entry?.nativeFace).toContain('ctx.subagents.sendMessage')
    expect(entry?.nativeFace).toContain('lead 中转')
    expect(entry?.disposition).toBe('ported')
    // P5-T6 翻行：status 'pending'→'ported'（交付面见 manifest.ts 行注与
    // boot-markers.test.ts 的同 commit 翻针；refined 翻动规则授权点位）。
    expect(entry?.status).toBe('ported')
    expect(entry?.summary).toContain('.delivering-')
    // Q-8 kind 裁定：原生帧承 'agent-message'，omo 自有帧才 omo-team-*。
    expect(entry?.summary).toContain('agent-message')
    expect(entry?.e2eScenario).toBe('team-create-and-message')
  })

  it('④ team_task_update is the claim-routing row: 4 sources incl. claim/dependencies', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'team_task_update')
    expect(entry).toBeDefined()
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/team-mode/tools/tasks.ts',
      'packages/team-core/src/team-tasklist/claim.ts',
      'packages/team-core/src/team-tasklist/update.ts',
      'packages/team-core/src/team-tasklist/dependencies.ts',
    ])
    expect(entry?.disposition).toBe('content-vendor')
    expect(entry?.e2eScenario).toBe('team-task-claim')
    expect(entry?.status).toBe('ported')
    expect(entry?.summary).toContain('claimTask')
    expect(entry?.summary).toContain('BlockedByError')
  })

  it('④ team_wait is the empty-upstream recorded row (the explicit exemption)', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'team_wait')
    expect(entry).toBeDefined()
    // v4.19.4 的 12 工具名单**无 team_wait**（Q-1 复核）——空 upstreamSources
    // 是事实；若有人"补"了一个假想路径，这里即红。
    expect(entry?.upstreamSources).toEqual([])
    expect(entry?.disposition).toBe('recorded-difference')
    expect(entry?.status).toBe('recorded')
    expect(entry?.nativeFace).toContain('steer')
  })

  it('④ team_list is the spec-registry difference row, inherited via team_status', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'team_list')
    expect(entry).toBeDefined()
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/features/team-mode/tools/query.ts',
    ])
    expect(entry?.disposition).toBe('recorded-difference')
    expect(entry?.status).toBe('recorded')
    expect(entry?.nativeFace).toContain('team_status')
    expect(entry?.summary).toContain('ephemeral-per-lead-session')
  })

  it('④ vendor-team-core-closure names the closure four-piece set and BOTH external deps (T2 双评审终态)', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'vendor-team-core-closure')
    expect(entry).toBeDefined()
    // 闭包四件逐字（FORK.md §3.3 T2 双评审后终态——session-client.ts 补入：
    // 纯类型零 import 15 行，state-store 族 **3 文件** type-only import 它
    // （active-resume.ts:3 / resume.ts:3 / session-liveness.ts:1；第 4 个消费者
    // reservation-reconciliation.ts:4 随排除件出局）；原
    // Q1b N6 三件闭包不完整是评审钉死的缺口）。外部依赖不是 packages/ 路径、
    // 不进 upstreamSources，只在 nativeFace/summary 里点名。
    expect(entry?.upstreamSources).toEqual([
      'packages/team-core/src/config.ts',
      'packages/team-core/src/logger.ts',
      'packages/team-core/src/session-client.ts',
      'packages/team-core/src/tolerant-fsync.ts',
    ])
    // 变异敏感双钉：两个外部依赖名 zod 与 @oh-my-opencode/utils 任一处缺席
    // 即红——闭包行少登记一个外部依赖正是 T2 评审抓出的断链面。
    expect(entry?.nativeFace).toContain('zod')
    expect(entry?.nativeFace).toContain('@oh-my-opencode/utils')
    expect(entry?.summary).toContain('zod')
    expect(entry?.summary).toContain('@oh-my-opencode/utils')
    expect(entry?.nativeFace).toContain('session-client')
    expect(entry?.disposition).toBe('content-vendor')
    expect(entry?.e2eScenario).toBe('team-task-claim')
    expect(entry?.status).toBe('pending')
  })

  it('④ vendor-team-core-team-state-store is 12 files + 1 deviation + 1 excluded (T2 双评审终态)', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'vendor-team-core-team-state-store')
    expect(entry).toBeDefined()
    // 13 → 12 文件手抄钉死：reservation-reconciliation.ts 已排除（唯一带
    // team-mailbox 运行时依赖 ../team-mailbox/{ack,reservation}，语义 =
    // .delivering- 预约回收 = T1 已裁不移植，原生 inbox 无预约族）。
    expect(entry?.upstreamSources).toEqual([
      'packages/team-core/src/team-state-store/active-resume.ts',
      'packages/team-core/src/team-state-store/creating-resume.ts',
      'packages/team-core/src/team-state-store/deleting-resume.ts',
      'packages/team-core/src/team-state-store/error-normalization.ts',
      'packages/team-core/src/team-state-store/index.ts',
      'packages/team-core/src/team-state-store/locks.ts',
      'packages/team-core/src/team-state-store/resume-report.ts',
      'packages/team-core/src/team-state-store/resume.ts',
      'packages/team-core/src/team-state-store/runtime-cleanup.ts',
      'packages/team-core/src/team-state-store/session-liveness.ts',
      'packages/team-core/src/team-state-store/store.ts',
      'packages/team-core/src/team-state-store/worker-resume-status.ts',
    ])
    expect(entry?.upstreamSources.length).toBe(12)
    expect(entry?.upstreamSources.some((file) => file.includes('reservation-reconciliation'))).toBe(false)
    // deviation 与 excluded 两个终态事实必须成文在 summary（终态列的机读浓缩），
    // 且 nativeFace 同步点名——T8 落法与复核点的锚。
    expect(entry?.summary).toContain('active-resume.ts')
    expect(entry?.summary).toContain('reconcileStaleReservationsForMember')
    expect(entry?.summary).toContain('reconcileMemberReservations')
    expect(entry?.summary).toContain('reservation-reconciliation.ts')
    expect(entry?.summary).toContain('team-mailbox')
    expect(entry?.nativeFace).toContain('deviation')
    expect(entry?.nativeFace).toContain('reservation-reconciliation.ts')
    expect(entry?.disposition).toBe('content-vendor')
    expect(entry?.e2eScenario).toBe('team-shutdown-handshake')
    expect(entry?.status).toBe('pending')
  })

  it('④ vendor-team-prompts is the two-item prompt vendor row (Q1b N5 扩清单)', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'vendor-team-prompts')
    expect(entry).toBeDefined()
    expect(entry?.upstreamSources).toEqual([
      'packages/prompts-core/prompts/mode/team.md',
      'packages/skills-loader-core/src/features/builtin-skills/skills/team-mode.ts',
    ])
    expect(entry?.disposition).toBe('content-vendor')
    expect(entry?.e2eScenario).toBe('team-keyword-mode')
    // P5-T12 翻行：两项已落 vendor/prompts-team/（sha 见其 VENDOR-MANIFEST）。
    expect(entry?.status).toBe('ported')
  })

  it('④ team-keyword-injection is the §3 handoff row on the H-33 slot', async () => {
    const entry = TEAM_MANIFEST.find((row) => row.id === 'team-keyword-injection')
    expect(entry).toBeDefined()
    expect(entry?.upstreamSources).toEqual([
      'packages/omo-opencode/src/hooks/keyword-detector/constants.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/team/default.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/team/index.ts',
    ])
    expect(entry?.nativeFace).toContain('TEAM_PATTERN')
    expect(entry?.nativeFace).toContain('omo-team-keyword')
    expect(entry?.disposition).toBe('ported')
    expect(entry?.e2eScenario).toBe('team-keyword-mode')
    // P5-T12 翻行：team 槽已接线（kind omo-team-keyword，成员侧不放行）。
    expect(entry?.status).toBe('ported')
  })

  it('④ no row cites AGENTS.md and every cited path is tag-relative', async () => {
    // N-03 + provenance, cross-row: a row that lost its 署名 anchor to the
    // frozen v4.19.4 tag (`Packages/`, an absolute path, a stray space) is
    // caught here before any gate runs.
    for (const entry of TEAM_MANIFEST) {
      for (const file of entry.upstreamSources) {
        expect(file, `${entry.id} ${file}`).toMatch(/^packages\/[a-z0-9-]+\//)
        expect(file.split('/').at(-1), `${entry.id} ${file}`).not.toBe('AGENTS.md')
        expect(file, `${entry.id} ${file}`).not.toMatch(/\s/)
      }
    }
  })

  it('④ negative pin: NO row cites a test file or test fixture in upstreamSources', async () => {
    // 轮检不变量（把 manifest.ts vendor 组头 :453-456 的排除措辞从注释升级为
    // 机器钉）：`*.test.ts` 与 `test-support` 等测试夹具不进 upstreamSources
    // ——测试种子的登记处是覆盖基线与 NOTICES playbook，不是逐文件列。
    // 对 24 行全量扫、断言写成独立的否定式：任何路径命中 `.test.ts` 后缀或
    // 含 `test-support` 段即红。非空洞性由上游事实保证（v4.19.4 的
    // team-tasklist/ 真有 test-support.ts、team-state-store/ 真有 *.test.ts
    // ——排除规则不是对着空集立的法）。
    let checkedPaths = 0
    for (const entry of TEAM_MANIFEST) {
      expect(entry.id, 'row must be scanned').toBeTruthy()
      for (const file of entry.upstreamSources) {
        expect(file, `${entry.id} ${file}`).not.toMatch(/\.test\.ts$/)
        expect(file, `${entry.id} ${file}`).not.toContain('test-support')
        checkedPaths += 1
      }
    }
    // 扫描是真的全量：24 行全进循环、路径总数非零——「空扫」不算绿。
    expect(TEAM_MANIFEST.length).toBe(EXPECTED_TEAM_MANIFEST_COUNT)
    expect(checkedPaths).toBeGreaterThan(0)
  })

  it('④ no row cites the two NOT-vendored trees (team-mailbox body / team-layout-tmux)', async () => {
    // FORK.md §3.3 显式不 vendor：team-mailbox（原生 inbox 替代）与
    // team-layout-tmux（D4）。team_send_message 行引 send.ts 是**错误族语义
    // 参照**，不是 vendor 范围；vendor 组的任何行都不得把这两棵树纳入。
    const vendorRows = TEAM_MANIFEST.filter((row) => row.id.startsWith('vendor-'))
    expect(vendorRows.some(
      (row) => row.upstreamSources.some((file) => file.includes('team-mailbox')),
    )).toBe(false)
    expect(vendorRows.some(
      (row) => row.upstreamSources.some((file) => file.includes('team-layout-tmux')),
    )).toBe(false)
    // 且 vendor 组恰 7 行（§3.3 子集序），不多不少。
    expect(vendorRows.map((row) => row.id)).toEqual([
      'vendor-team-core-types',
      'vendor-team-core-member-parser',
      'vendor-team-core-team-registry',
      'vendor-team-core-team-tasklist',
      'vendor-team-core-team-state-store',
      'vendor-team-core-closure',
      'vendor-team-prompts',
    ])
  })
})

describe('P5-T2 validateManifest — rejection branches', async () => {
  it('② throws on an empty id', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ id: '' })
    expect(rejectionMessage(rows)).toContain('empty id')
  })

  it('② throws on a duplicate id', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[1] = legalRow({ id: rows[0]?.id ?? '' })
    expect(rejectionMessage(rows)).toContain('duplicate team id')
  })

  it('② throws on an empty upstreamSources for a NON-exempt disposition', async () => {
    // The exemption is recorded-difference-ONLY. FULL message: the tail names
    // the exemption rule and its exemplar (team_wait) — the two things a
    // future author needs when a legitimately-empty row gets rejected.
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ upstreamSources: [] })
    expect(rejectionMessage(rows)).toBe(
      `manifest: team 'fixture-team' declares no upstreamSources`
      + " — only recorded-difference rows may declare none (e.g. team_wait does not exist at v4.19.4)",
    )
  })

  it('② ACCEPTS an empty upstreamSources on a recorded-difference row (the exemption is real)', async () => {
    // Positive control for the exemption above: the difference row must be
    // constructible with no upstream file to cite, or team_wait's honest
    // emptiness would be unrepresentable.
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ disposition: 'recorded-difference', upstreamSources: [] })
    expect(() => validateManifest(rows as readonly TeamManifestEntry[])).not.toThrow()
  })

  it('② throws on an empty nativeFace', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ nativeFace: '' })
    expect(rejectionMessage(rows)).toContain('empty nativeFace')
  })

  it('② throws on an empty summary', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ summary: '' })
    expect(rejectionMessage(rows)).toContain('empty summary')
  })

  it('② throws on an empty e2eScenario', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ e2eScenario: '' })
    expect(rejectionMessage(rows)).toContain('empty e2eScenario')
  })

  it('② throws on an illegal disposition (outside the four-value vocabulary)', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ disposition: 'native-invent' })
    expect(rejectionMessage(rows)).toContain("illegal disposition 'native-invent'")
  })

  it('② throws on an illegal status (outside the three-value vocabulary)', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ status: 'shipped' })
    expect(rejectionMessage(rows)).toContain("illegal status 'shipped'")
  })

  it('② throws on an empty status (the empty string is not a vocabulary value)', async () => {
    // The unset-variable case reaching the status branch rather than being
    // silently accepted: `teamStatusSet.has('')` is false.
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ status: '' })
    expect(rejectionMessage(rows)).toContain("illegal status ''")
  })

  it("② throws on status 'recorded' for a row whose disposition carries code", async () => {
    // The disposition↔status coupling (manifest.ts check 9): a ported row may
    // not claim the difference-terminal to skip its delivery surface.
    // FULL message: it names the offending row, the illegal pair, AND the
    // rule — the three parts a T3+ reader needs at a boot failure.
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ status: 'recorded' })
    expect(rejectionMessage(rows)).toBe(
      `manifest: team 'fixture-team' declares status 'recorded' on a 'ported' row`
      + " — 'recorded' is the terminal state of recorded-difference rows only",
    )
  })

  it('② throws on a non-tag-relative upstream path', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ upstreamSources: ['/abs/path/team-core/types.ts'] })
    // FULL message — same rationale as the exemption case above.
    expect(rejectionMessage(rows)).toBe(
      `manifest: team 'fixture-team' lists non-tag-relative source`
      + ` '/abs/path/team-core/types.ts'`
      + ' — upstream paths are v4.19.4 tag-relative, e.g. packages/team-core/…',
    )
  })

  it('② throws when AGENTS.md leaks into upstreamSources', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({
      upstreamSources: ['packages/team-core/AGENTS.md'],
    })
    // FULL message: the N-03 clause is the *reason* this branch exists.
    expect(rejectionMessage(rows)).toBe(
      `manifest: team 'fixture-team' lists AGENTS.md in upstreamSources`
      + ' — upstream documentation is not a semantic source (N-03)',
    )
  })

  it('② accepts a full-length roster that changes nothing', async () => {
    // The positive control for every negative case above: the fixture shape
    // itself is legal, so a rejection proves the field under test, not the
    // fixture.
    expect(() => validateManifest(legalRows(EXPECTED_TEAM_MANIFEST_COUNT) as readonly TeamManifestEntry[]))
      .not.toThrow()
  })

  it('⑤ throws when the roster is short (a dropped row is not a valid roster)', async () => {
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows.pop()
    expect(rejectionMessage(rows)).toContain('expected 24 team entries, got 23')
  })

  it('⑤ throws when the roster is LONG (an extra row is not a valid roster either)', async () => {
    // The count guard is an EQUALITY, not a floor: a 25th row — added without
    // its coverage-baseline line — must fail loudly, not quietly validate.
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT + 1)
    expect(rejectionMessage(rows)).toContain('expected 24 team entries, got 25')
  })

  it('⑤ the count guard fires BEFORE any per-row check (a 1-row roster with a bad id is still a count error)', async () => {
    // Proves the guard is check 0 and not a per-row check a later fix could
    // reorder: the roster is both wrong-length AND malformed, and the reported
    // message must be the count one.
    const rows = [legalRow({ id: '' })]
    expect(rejectionMessage(rows)).toContain('expected 24 team entries, got 1')
  })
})

describe('P5-T2 derived helpers', async () => {
  it('teamsByStatus / teamsByDisposition match nothing for an empty value, preserve roster order', async () => {
    // An empty filter value matches nothing rather than everything: a caller
    // passing an unset variable must not be told the whole roster is in that
    // state (two-package precedent). `as never` mirrors the widened-fixture
    // cast in tests/omo-commands/manifest.test.ts — the closed unions refuse
    // `''` at compile time, and that refusal is exactly what we probe here.
    expect(teamsByStatus(TEAM_MANIFEST, '' as never)).toEqual([])
    expect(teamsByStatus([], 'pending')).toEqual([])
    expect(teamsByDisposition(TEAM_MANIFEST, '' as never)).toEqual([])
    // Order preservation: filtered positions are strictly increasing inside the
    // full roster index.
    const positions = (id: string): number => TEAM_IDS.indexOf(id)
    const recorded = teamsByStatus(TEAM_MANIFEST, 'recorded').map((row) => positions(row.id))
    expect(recorded).toEqual([...recorded].sort((a, b) => a - b))
    expect(recorded).toEqual([11, 12])
    // The status buckets partition the roster (no row dropped, none twice).
    const pending = teamsByStatus(TEAM_MANIFEST, 'pending').length
    const ported = teamsByStatus(TEAM_MANIFEST, 'ported').length
    expect(pending + ported + recorded.length).toBe(TEAM_MANIFEST.length)
    // Same partition for dispositions.
    let total = 0
    for (const disposition of TEAM_MANIFEST_DISPOSITIONS) {
      total += teamsByDisposition(TEAM_MANIFEST, disposition).length
    }
    expect(total).toBe(TEAM_MANIFEST.length)
  })

  it('countsByStatus derives the summary counts (20/2/2) with every key present at all times', async () => {
    // The T3 summary line's fields come from here, never from a hard-coded
    // string — so this test pins the DERIVATION against hand-typed numbers.
    // P5-T5 flipped team_create to ported: 21/1/2 (was 22/0/2 at P5-T2);
    // P5-T6 flipped team_send_message: 20/2/2; P5-T7 five more: 15/7/2;
    // P5-T8b flipped the task quartet: 11/11/2; P5-T9 flipped
    // stop-continuation-team: 10/12/2; T12 adds team-keyword-injection +
    // vendor-team-prompts to the ported side: 8/14/2.
    const counts = countsByStatus(TEAM_MANIFEST)
    expect(counts.get('pending')).toBe(8)
    expect(counts.get('ported')).toBe(14)
    expect(counts.get('recorded')).toBe(2)
    // Every vocabulary key exists even at 0, so two boots stay line-comparable.
    expect([...counts.keys()]).toEqual([...TEAM_MANIFEST_STATUSES])
    let total = 0
    for (const value of counts.values()) total += value
    expect(total).toBe(TEAM_MANIFEST.length)
  })

  it('countsByStatus reports zeros for an empty roster, not an empty map', async () => {
    const counts = countsByStatus([])
    expect([...counts.entries()]).toEqual([['pending', 0], ['ported', 0], ['recorded', 0]])
  })

  it('countsByStatus adds an out-of-vocabulary status as its own key, never dropping it', async () => {
    // Defensive tail (两包 boot-markers 的 `other=` 纪律): a widened fixture
    // carrying a status outside the union must stay visible in the counts — a
    // silent drop would make "sum < row count" invisible.
    const sentinel = '已移植（场景 xxx）'
    const rows = legalRows(EXPECTED_TEAM_MANIFEST_COUNT)
    rows[0] = legalRow({ status: sentinel })
    const counts = countsByStatus(rows as readonly TeamManifestEntry[])
    expect(counts.get('pending')).toBe(23)
    expect(counts.get('ported')).toBe(0)
    expect(counts.get('recorded')).toBe(0)
    expect(counts.get(sentinel as never)).toBe(1)
    expect([...counts.keys()].length).toBe(4)
  })

  it('countsByDisposition derives the group counts (0/11/11/2) for the consistency gate', async () => {
    const counts = countsByDisposition(TEAM_MANIFEST)
    expect(counts.get('native-adopt')).toBe(0)
    expect(counts.get('ported')).toBe(11)
    expect(counts.get('content-vendor')).toBe(11)
    expect(counts.get('recorded-difference')).toBe(2)
    expect([...counts.keys()]).toEqual([...TEAM_MANIFEST_DISPOSITIONS])
    expect([...countsByDisposition([]).entries()]).toEqual([
      ['native-adopt', 0],
      ['ported', 0],
      ['content-vendor', 0],
      ['recorded-difference', 0],
    ])
  })

  it('formatLoadedSummaryLine renders the exact P5-T2 census line from the real roster', async () => {
    // 手打的整行——与上面 countsByStatus 的手打数字（22/0/2）互为对账；
    // T3 的 boot marker 若并入注册计数，格式扩展归 probe 侧（manifest.ts 注）。
    // P5-T12 census: pending=8, ported=14 (T7's seven + the task quartet +
    // the stop-continuation-team query surface flipped at T9 + the team-keyword
    // slot and the prompts-team vendor pair flipped at T12), recorded=2。
    expect(formatLoadedSummaryLine(TEAM_MANIFEST)).toBe(
      '[omo-team] loaded: manifest 24 entries (pending=8, ported=14, recorded=2)',
    )
  })

  it('formatLoadedSummaryLine derives from ANY roster, not from the shipped census', async () => {
    // Synthetic roster: the derivation must follow the input, so a hand-copied
    // census inside the formatter would fail here.
    const rows = legalRows(3)
    rows[1] = legalRow({ id: 'fixture-team-1', status: 'ported' })
    rows[2] = legalRow({
      id: 'fixture-team-2',
      disposition: 'recorded-difference',
      upstreamSources: [],
      status: 'recorded',
    })
    expect(formatLoadedSummaryLine(rows as readonly TeamManifestEntry[])).toBe(
      '[omo-team] loaded: manifest 3 entries (pending=1, ported=1, recorded=1)',
    )
    expect(formatLoadedSummaryLine([])).toBe(
      '[omo-team] loaded: manifest 0 entries (pending=0, ported=0, recorded=0)',
    )
  })
})

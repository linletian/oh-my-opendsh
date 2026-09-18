// P2-T17 (C-ii) — the Q-3 MECHANISM pin: `dsh-tool-subagent`'s `toolFilter`
// semantics are `allow ∧ ¬deny`, proven through the INSTALLED dsh's real
// restriction path rather than by reading the composition text.
//
// WHY THIS SUITE EXISTS. phase2-roster.md §3 closed Q-3 on 2026-09-12 by
// reading the installed `dsh-tools` `admits()` implementation (allow not in set
// → reject; deny in set → reject), concluding that multimodal-looker's
// `allow: [read, read_image]` needs NO extra deny: the delegation names are not
// in the allow set, so they are already physically invisible, and adding a deny
// would only widen the R-9 name-drift surface. tests/omo-agents/
// roster-composition.test.ts pins the SHAPE (the rendered row carries allow and
// no deny key). This suite pins the MECHANISM on the same installed runtime the
// plugin boots on, session-free:
//
//   @deepseek-ai/cordis Context + dsh-system-prompt + dsh-tools  → a real registry;
//   @deepseek-ai/dsh-scope createScope                            → a parent agent-plane
//     scope holding the concerto tool roster + a CHILD scope bound under it (the
//     ancestor layering composeFrom() produces for a real child);
//   @deepseek-ai/dsh-subagent applyChildComposition               → the REAL function
//     every in-process child runs in its creation window; it applies a row's
//     toolFilter through childCtx.tools.restrict().
//
// The technique is the one scripts/prove-explore-toolfilter.mjs uses (that
// proof is the gate-8 analogue for the read-only deny list); this test is its
// gate-2 sibling for the Q-3 composite rule. It is hermetic (no boot, no model,
// no network) and mounts only the installed runtime's own modules — the same
// zero-dep move scripts/doctor-lite.mjs makes, through its
// `resolveDshNodeModules()` rather than a second copy of the lookup.
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DELEGATION_ENTRIES,
  DELEGATION_TOOL_NAMES,
  allowToolNamesFor,
} from '../../patches/omo-dsh/omo-agents/src/roster'
import { resolveDshNodeModules } from '../../scripts/doctor-lite.mjs'

/** The platform-gated shell name (the concerto row is disabled on win32). */
const SHELL = process.platform === 'win32' ? 'pwsh' : 'bash'

/**
 * The model-facing tool roster of the rendered concerto composition. Mirrors
 * scripts/prove-explore-toolfilter.mjs's CONCERTO_TOOLS: restriction semantics
 * live in the registry, so the tool bodies are inert stubs and only the NAMES
 * matter. The delegation names come from roster.ts (single source).
 */
const CONCERTO_TOOLS = [
  'read', 'write', 'edit', 'read_image', // tool-fs
  'glob', 'grep', // tool-fs-search
  SHELL, // tool-bash / tool-pwsh
  'job_list', 'job_output', 'job_kill', // tool-jobs
  'skill', // tool-skill
  'create_goal', 'get_goal', 'update_goal', // tool-goal
  ...DELEGATION_TOOL_NAMES, // the 10 named roster delegation rows
  'ask_user_question', // tool-ask-user
  'todo_write', // tool-todo
  'web_search', // tool-web
]

/** The Q-3 allow+deny combination under test (allow ∧ ¬deny). */
const ALLOW_AND_DENY_FILTER = {
  allow: ['read', 'read_image'],
  deny: ['write', 'read_image'],
} as const

const DEFAULT_TIMEOUT = 30_000

let ctx: any
let parentKey: { id: string }
let parentScope: any
let applyChildComposition: (childCtx: any, parent: { id: string; ctx: any }, composition: any) => void
let createScope: any
let callIdCtor: (id: string) => any

beforeAll(async () => {
  const nm = await resolveDshNodeModules()
  if (nm === null) {
    throw new Error(
      'the installed dsh was not found — this suite mounts the INSTALLED runtime\'s own '
      + 'plugins (the scripts/run-proofs.sh technique); gate 2 requires the pinned dsh install',
    )
  }
  const imp = (specifier: string) => import(pathToFileURL(join(nm, specifier)).href)
  const { Context } = await imp('@deepseek-ai/cordis/lib/index.js')
  const SystemPrompt = (await imp('@deepseek-ai/dsh-system-prompt/lib/index.js')).default
  const ToolRuntime = (await imp('@deepseek-ai/dsh-tools/lib/index.js')).default
  const { createScope: scopeFactory } = await imp('@deepseek-ai/dsh-scope/lib/index.js')
  createScope = scopeFactory
  applyChildComposition = (await imp('@deepseek-ai/dsh-subagent/lib/index.js')).applyChildComposition
  const llm = await imp('@deepseek-ai/dsh-llm/lib/index.js')
  // 0.1.2 renamed the tool-call-id constructor CallId → ToolCallId; rc.6/rc.7
  // export CallId. Same fallback as the prove scripts.
  callIdCtor = llm.ToolCallId ?? llm.CallId

  // Plain ToolDefinition shells (the shape dsh's own scoped.spec.ts registers).
  const stubTool = (name: string) => ({
    name,
    description: `q3 probe stub for ${name}`,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    execute: () => Promise.resolve(`ran:${name}`),
  })

  ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  parentKey = { id: 'q3-parent-stub' }
  await ctx.plugin(Object.assign(
    (inner: any) => { parentScope = createScope(inner, parentKey) },
    { inject: ['tools', 'systemPrompt'] },
  ))
  for (const name of CONCERTO_TOOLS) parentScope.ctx.tools.register(stubTool(name))
}, DEFAULT_TIMEOUT)

/** Mints a fresh child scope under the parent (the composeFrom layering). */
async function newChild(childId: string): Promise<{ childKey: { id: string }; childScope: any }> {
  const childKey = { id: childId }
  let childScope: any
  await ctx.plugin(Object.assign(
    (inner: any) => { childScope = createScope(inner, childKey, { parent: parentKey }) },
    { inject: ['tools', 'systemPrompt'] },
  ))
  return { childKey, childScope }
}

/** The child's model-facing tool list (what its presenter would render). */
function visibleNames(childKey: { id: string }): string[] {
  return ctx.tools.schemas(childKey).map((tool: any) => tool.name).sort()
}

/** Executes one tool AS the child; an invisible tool surfaces UNKNOWN_TOOL. */
async function execAsChild(childKey: { id: string }, name: string): Promise<string> {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: callIdCtor(`q3-probe-${childKey.id}-${name}`),
    name,
    arguments: {},
    agent: childKey,
  })
  const first = result.content[0]
  return first?.type === 'text' ? first.text : JSON.stringify(result.content)
}

describe('Q-3 mechanism — dsh tools.restrict() is allow ∧ ¬deny (P2-T17 · C-ii)', () => {
  it('non-vacuity control: an unrestricted child sees and runs the whole roster surface', async () => {
    const { childKey } = await newChild('q3-control-child')
    const visible = visibleNames(childKey)
    // Everything the filters below remove is present without a filter, so the
    // invisibility assertions are sensitive rather than vacuous.
    for (const name of ['read', 'read_image', 'write', 'edit', SHELL, ...DELEGATION_TOOL_NAMES]) {
      expect(visible, name).toContain(name)
    }
    expect(await execAsChild(childKey, 'read')).toBe('ran:read')
    expect(await execAsChild(childKey, 'explore')).toBe('ran:explore')
  }, DEFAULT_TIMEOUT)

  it('with allow+deny BOTH given: read visible, write invisible (not allowed), read_image invisible (denied despite being allowed)', async () => {
    const { childKey, childScope } = await newChild('q3-allow-and-deny-child')
    applyChildComposition(
      childScope.ctx,
      { id: parentKey.id, ctx: parentScope.ctx },
      { toolFilter: { allow: [...ALLOW_AND_DENY_FILTER.allow], deny: [...ALLOW_AND_DENY_FILTER.deny] } },
    )
    const visible = visibleNames(childKey)
    // allow keeps read; ¬deny also holds for read (deny names write/read_image only).
    expect(visible).toContain('read')
    // write is NOT in allow — the allowlist alone already hides it.
    expect(visible).not.toContain('write')
    // read_image IS in allow but IS denied — the ¬deny half is what removes it.
    // Both halves are therefore load-bearing in one filter.
    expect(visible).not.toContain('read_image')
    // Not in allow → invisible, denied or not.
    expect(visible).not.toContain('edit')
    expect(visible).not.toContain('explore')

    // Execution agrees with the model-facing list: an invisible tool is
    // indistinguishable from one that does not exist (UNKNOWN_TOOL).
    expect(await execAsChild(childKey, 'read')).toBe('ran:read')
    expect(await execAsChild(childKey, 'write')).toMatch(/unknown tool "write"/)
    expect(await execAsChild(childKey, 'read_image')).toMatch(/unknown tool "read_image"/)
  }, DEFAULT_TIMEOUT)

  it('the looker row\'s real filter { allow: [read, read_image] } hides ALL ten delegation tools with NO deny', async () => {
    // The REAL filter, from the single source (never restated): roster.ts's
    // allowlist computation for the multimodal-looker row. The literal check
    // keeps this test honest if the roster row is edited to something else.
    const looker = DELEGATION_ENTRIES.find((entry) => entry.id === 'multimodal-looker')!
    const realAllow = allowToolNamesFor(looker)
    expect(realAllow).toEqual(['read', 'read_image'])
    const realFilter = { allow: [...realAllow!] }
    // "WITHOUT any deny": the filter this test applies carries no deny key at
    // all — the invisibility below comes from the allowlist alone.
    expect('deny' in realFilter).toBe(false)

    const { childKey, childScope } = await newChild('q3-looker-child')
    applyChildComposition(
      childScope.ctx,
      { id: parentKey.id, ctx: parentScope.ctx },
      { toolFilter: realFilter },
    )
    const visible = visibleNames(childKey)
    // The vision entry point survives (plan §4.4 H-1): read + read_image.
    expect(visible).toContain('read')
    expect(visible).toContain('read_image')
    // Every delegation tool is physically absent — the Q-3 conclusion at the
    // mechanism level: allow ∧ ¬deny already hides them, so no deny is needed.
    for (const name of DELEGATION_TOOL_NAMES) {
      expect(visible, name).not.toContain(name)
    }
    // The rest of the inherited surface is outside the allowlist too.
    for (const name of ['write', 'edit', 'glob', 'grep', SHELL, 'web_search']) {
      expect(visible, name).not.toContain(name)
    }
    expect(await execAsChild(childKey, 'read')).toBe('ran:read')
    expect(await execAsChild(childKey, 'read_image')).toBe('ran:read_image')
    expect(await execAsChild(childKey, 'explore')).toMatch(/unknown tool "explore"/)
    expect(await execAsChild(childKey, 'multimodal-looker')).toMatch(/unknown tool "multimodal-looker"/)
  }, DEFAULT_TIMEOUT)

  it('the parent scope is unaffected by a child restriction (child-scoped layers)', async () => {
    const { childKey, childScope } = await newChild('q3-parent-isolation-child')
    applyChildComposition(
      childScope.ctx,
      { id: parentKey.id, ctx: parentScope.ctx },
      { toolFilter: { allow: [...ALLOW_AND_DENY_FILTER.allow], deny: [...ALLOW_AND_DENY_FILTER.deny] } },
    )
    expect(visibleNames(childKey)).not.toContain('write')
    // The parent (the conductor's plane) still resolves every global tool.
    expect(ctx.tools.get('write', parentKey)).toBeDefined()
    expect(ctx.tools.get('explore', parentKey)).toBeDefined()
    expect(ctx.tools.get('read_image', parentKey)).toBeDefined()
  }, DEFAULT_TIMEOUT)
})

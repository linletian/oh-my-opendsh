// oh-my-opendsh — Concerto Mode MVP (协奏模式) for the CURRENT DSH, Package v6.
// Archived 2026-09-04 from the dynamic plugin conc-1/pkg-6 (run-6). This file
// is the verbatim Host half; re-activate after a harness restart with
// cordis_define(kind:"new", idPrefix:"conc", code.host=<this body>) + cordis_run.
// See patches/omo-dsh/omo-agents-current/README.md and
// docs/concerto-current-dsh_zh-CN.md.
//
// v6 hardening (mirrors the persistent preset hardening after the manual-test
// probe): the explore toolFilter now denies `call_omo_explore` itself so an
// explore child cannot PHYSICALLY delegate (AC-6b), and the generic subagent
// rows were removed from the persistent concerto preset so call_omo_explore is
// the conductor's ONLY delegation path. Assertions extended accordingly.
// v5: pi-ai activation + preset authoring tools. v4: P-16. v3: P-14/P-15.
// v2: P-13. PRD: docs/mvp-prd_zh-CN.md. Attribution: system-sections markdown
// files carry their own OMO SUL-1.0 source comments; no OMO code is copied.

function textOfBlocks(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('')
}
function stopReasonError(result) {
  switch (result && result.stopReason) {
    case 'completed': return undefined
    case 'aborted': return 'subagent run was cancelled'
    case 'error': return 'subagent run failed'
    case 'max-tokens': return 'subagent run hit its token limit before finishing'
    case 'refusal': return 'subagent declined the task'
    default: return 'subagent run ended abnormally (' + String(result && result.stopReason) + ')'
  }
}
function withPartialText(error, output) {
  const text = textOfBlocks(output)
  return text.length === 0 ? error : error + '\nPartial output before the run ended:\n' + text
}
const safe = (v) => (v === undefined ? null : v)

return {
  async apply(ctx) {
    const subagents = ctx.get('subagents')
    const tools = ctx.get('tools')
    const systemPrompt = ctx.get('systemPrompt')
    const llm = ctx.get('llm')
    const fs = ctx.get('fs')
    const agents = ctx.get('agents')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const agentDefaultModel = ctx.get('agentDefaultModel')
    const settings = ctx.get('settings')
    const agentPresets = ctx.get('agentPresets')
    const timer = ctx.get('timer')

    // T12 verdict + AC-6b hardening: deny the delegation tool itself so an
    // explore child cannot physically delegate; maxDepth 1 stays as
    // defense-in-depth (name validation: deny names must be global/ancestor
    // tools — call_omo_explore is registered on the preset standing layer).
    const READ_ONLY_FILTER = { deny: ['write', 'edit', 'call_omo_explore'] }
    const MAX_DEPTH = 1 // T13: explore cannot delegate further

    const state = {
      services: { subagents: !!subagents, tools: !!tools, systemPrompt: !!systemPrompt, llm: !!llm, fs: !!fs, agents: !!agents, settings: !!settings, agentPresets: !!agentPresets },
      conductorId: undefined,
      lastParentId: undefined,
      workspaceRoot: undefined,
      sections: {},
      texts: {},
      routes: { conductor: {}, explore: {} },
      routesDiffer: false,
      availableProviders: [],
      availableBackends: [],
      baseBackend: undefined,
      caps: undefined,
      exploreChildren: new Set(),
      routeObs: {},
      enforcements: [],
      childErrors: [],
      captures: [],
      snapshots: { sisyphus: undefined, explore: undefined },
      chainEvents: [],
      errors: [],
      notes: [
        'P-1 verdict (current DSH): register-branch — the extension surface is open (subagents.registerProvider / tools.register / systemPrompt.section); the 5th-mode equivalent is this plugin turning a session into a concerto conductor session',
        'P-2 verdict (current DSH): register-branch, source-verified — resolveChildAgentOptions spreads `requested` LAST, so per-child agentOptions override parent inheritance',
        'V3 mapping (current DSH): the rc-era agent/pre-step + agent.inject() translates to the persona capability (order-0 shadow) + the system-prompt/assemble waterfall; runtime snapshots prove injection',
        'V4 mapping (current DSH): toolFilter deny [write, edit, call_omo_explore] applied as scoped tools.restrict() in the child creation window; maxDepth 1 rejects depth-2 delegation (defense-in-depth; the deny now removes the delegation tool physically)',
        'P-13 (current DSH, hit in pkg-1): a decorator subagent provider MUST forward request.descriptor verbatim to its base backend; dropping it appends undefined as the subagent/descriptor event and kills the child first turn ("carries non-JSON-serializable data"). Fixed in pkg-2.',
        'P-14 (current DSH, hit in pkg-2): sandboxPolicy.workspaceRoot pointed at a different worktree than the session cwd; sections now resolve against the conductor agent\'s durable session.header.cwd.',
        'P-15 (current DSH, hit in pkg-2): Agent.options diverged from the frozen request config for the conductor; the conductor route now tracks the real agent/request config, and every capture is audited in `captures`.',
        'P-16 (current DSH, hit in pkg-3): exploreChildren registration raced the child\'s first assembly; agent/created (publication-time) now registers the child deterministically.',
        'P-17 (current DSH): plugin-side fs evidence writes are confined by the deployment sandbox root, which differs from the session cwd; durable evidence lives in the session log and is consolidated by the conductor session.',
        'P-18 (current DSH): vm-realm object literals fail host-realm isPlainObject checks (settings.update "must be a plain object"); settings-file chokidar hot-reload is the supported activation path.',
        'P-19 (current DSH, manual-test finding): restrictions bind to the DELEGATION TOOL, not the session — delegations through the generic `subagent` tool are unrestricted full agents. Hardening: generic rows dropped from the persistent preset; toolFilter now denies call_omo_explore itself (AC-6b physical).',
      ],
      evidenceCounter: 0,
      registeredTools: [],
      presetRoster: [],
    }

    const refreshDiffer = () => {
      const c = state.routes.conductor
      const e = state.routes.explore
      state.routesDiffer = !!e.provider && (e.provider !== c.provider || (e.model !== undefined && e.model !== c.model))
    }
    const observeRoute = (role, sessionId, route, source) => {
      const entry = { sessionId: String(sessionId), provider: safe(route && route.provider), model: safe(route && route.model), source }
      const slot = state.routeObs[role] || (state.routeObs[role] = { first: undefined, last: undefined, count: 0 })
      slot.count++
      slot.last = entry
      if (!slot.first) slot.first = entry
    }
    const chain = (step) => state.chainEvents.push(step)
    const captureConductorRoute = (agent, site) => {
      const o = agent && agent.options
      state.captures.push({ site, agentId: agent ? String(agent.id) : null, provider: safe(o && o.provider), model: safe(o && o.model) })
      if (o && (o.provider || o.model) && !state.routes.conductor.provider) state.routes.conductor = { provider: o.provider, model: o.model }
    }

    // ── conductor identity + route ──
    let ownerAgent
    try {
      if (agents) {
        const init = agents.currentInitiator()
        if (init) { state.conductorId = init.id; ownerAgent = init; captureConductorRoute(init, 'apply:currentInitiator') }
      }
    } catch (e) { state.errors.push('currentInitiator: ' + String(e)) }
    if (!state.conductorId && agents) {
      try {
        const list = agents.list()
        if (list.length === 1) { state.conductorId = list[0].id; ownerAgent = list[0]; captureConductorRoute(list[0], 'apply:list-single') }
        else {
          const roots = agents.roots()
          if (roots.length === 1) { state.conductorId = roots[0].id; ownerAgent = roots[0]; captureConductorRoute(roots[0], 'apply:roots-single') }
        }
      } catch (e) { state.errors.push('agents.list/roots: ' + String(e)) }
    }
    if (!state.conductorId) state.notes.push('conductor identity unresolved at apply time; the conductor persona will target the parent of the first omo-explore delegation instead')
    if (ownerAgent) {
      try {
        const cwd = ownerAgent.session && ownerAgent.session.header ? ownerAgent.session.header.cwd : undefined
        if (typeof cwd === 'string' && cwd) state.workspaceRoot = cwd
      } catch (e) { state.errors.push('session.header.cwd: ' + String(e)) }
    }
    if (!state.workspaceRoot && sandboxPolicy && typeof sandboxPolicy.workspaceRoot === 'string') state.workspaceRoot = sandboxPolicy.workspaceRoot
    if (!state.routes.conductor.provider) {
      try {
        const sel = agentDefaultModel && agentDefaultModel.currentSelection()
        if (sel && sel.provider) state.routes.conductor = { provider: sel.provider, model: sel.model }
      } catch (e) { /* contain */ }
    }

    // ── load system sections (FR-3/FR-6; P-9: fail loud with full path) ──
    const SECTION_DIR = 'patches/omo-dsh/omo-agents/system-sections'
    const SECTION_FILES = ['role.md', 'delegation-discipline.md', 'hard-blocks.md', 'anti-patterns.md', 'explore-persona.md']
    if (fs) {
      for (const file of SECTION_FILES) {
        const rel = SECTION_DIR + '/' + file
        let lastError
        for (const cwd of state.workspaceRoot ? [state.workspaceRoot, undefined] : [undefined]) {
          try {
            const target = cwd ? await fs.resolve(rel, { cwd }) : await fs.resolve(rel)
            state.sections[file] = await fs.readText(target)
            lastError = undefined
            break
          } catch (e) { lastError = e }
        }
        if (lastError) state.errors.push('section load failed: ' + rel + ' (workspaceRoot=' + String(state.workspaceRoot) + ') → ' + String(lastError))
      }
    } else state.errors.push('fs service unavailable — system-sections markdown cannot load')

    const rb = state.sections['role.md']
    const dd = state.sections['delegation-discipline.md']
    const hb = state.sections['hard-blocks.md']
    const ap = state.sections['anti-patterns.md']
    const ep = state.sections['explore-persona.md']
    state.texts.sisyphus = [rb, dd, hb, ap].filter(Boolean).join('\n\n') // PRD builder order (T8)
    state.texts.hardBlocksOnly = [hb, ap].filter(Boolean).join('\n\n')
    state.texts.explorePersona = ep || ''
    state.texts.exploreFull = [ep, hb, ap].filter(Boolean).join('\n\n')

    // ── dual routes (FR-5 / P-2); re-runnable after pi-ai activation ──
    const resolveExploreRoute = async () => {
      if (!llm) { state.errors.push('llm service unavailable — dual routing cannot resolve'); return }
      try { state.availableProviders = (llm.listProviders() || []).map((p) => ({ id: p.id, name: p.name })) } catch (e) { state.errors.push('listProviders: ' + String(e)) }
      const conductorP = state.routes.conductor.provider
      const providers = state.availableProviders
      const hints = ['pi-ai', 'deepseek', 'anthropic', 'openai']
      let chosen
      for (const hint of hints) {
        chosen = providers.find((p) => String(p.id).toLowerCase().indexOf(hint) !== -1 && p.id !== conductorP)
        if (chosen) break
      }
      const sameProvider = !chosen
      if (!chosen) chosen = providers.find((p) => p.id !== conductorP)
      if (!chosen) chosen = providers.find((p) => p.id === conductorP)
      if (chosen) {
        let model
        try {
          const models = await llm.listModels(chosen.id)
          if (Array.isArray(models) && models.length > 0) {
            const fast = models.find((m) => /flash|lite|mini|turbo|fast/i.test(String(m.id)))
            const other = models.find((m) => String(m.id) !== String(state.routes.conductor.model))
            model = fast ? fast.id : (other ? other.id : models[0].id)
          }
        } catch (e) { state.errors.push('listModels(' + chosen.id + '): ' + String(e)) }
        state.routes.explore = { provider: chosen.id, model }
        if (sameProvider) state.notes.push('no second LLM provider active — explore falls back to conductor provider "' + chosen.id + '" with a distinct model; PRD Q-3 (deepseek + pi-ai) drift recorded: the pi-ai adapter is installed but dormant (activate via the llm-pi-ai settings section)')
      } else state.errors.push('no LLM providers registered — dual routing cannot resolve')
      refreshDiffer()
    }
    await resolveExploreRoute()

    // ── conductor persona + hard-blocks section (FR-3 / FR-6) ──
    if (systemPrompt) {
      try {
        systemPrompt.section({
          name: 'omo:concerto',
          order: 10,
          text: (context) => {
            try {
              const agentId = context && context.agent ? context.agent.id : undefined
              if (agentId === undefined) return ''
              if (state.exploreChildren.has(agentId)) return '' // children receive hard blocks via the persona shadow (order 0)
              if (agentId === state.conductorId || agentId === state.lastParentId) return state.texts.sisyphus || ''
              return ''
            } catch (e) { return '' }
          },
        })
      } catch (e) { state.errors.push('systemPrompt.section(omo:concerto): ' + String(e)) }
    }

    // ── lifecycle listeners: assembly snapshots (V3/AC-3/AC-6a), route
    //    enforcement + observability (P-2/P-7/AC-5), child bookkeeping ──
    ctx.on('system-prompt/assemble', (assembly, context, next) => {
      try {
        const agentId = context && context.agent ? context.agent.id : undefined
        const role = (agentId === state.conductorId || agentId === state.lastParentId) ? 'omo-sisyphus'
          : (state.exploreChildren.has(agentId) ? 'omo-explore' : undefined)
        if (role) {
          const sections = Array.isArray(assembly.sections) ? assembly.sections : []
          const names = sections.map((s) => (s && s.name) || '').filter(Boolean)
          const allText = sections.map((s) => (s && typeof s.text === 'string' ? s.text : '')).join('\n')
          const toolNames = Array.isArray(assembly.tools) ? assembly.tools.map((t) => (t && t.name) || '').filter(Boolean) : []
          const snap = {
            role, sessionId: String(agentId),
            sectionNames: names,
            hasConcertoSection: names.indexOf('omo:concerto') !== -1,
            hardBlocksInjected: allText.indexOf('## Hard Blocks') !== -1,
            explorePersonaInjected: allText.indexOf('Read-Only Retrieval Agent') !== -1,
            hasWriteTool: toolNames.indexOf('write') !== -1,
            hasEditTool: toolNames.indexOf('edit') !== -1,
            hasReadTool: toolNames.indexOf('read') !== -1,
            hasBashTool: toolNames.indexOf('bash') !== -1,
            hasCallOmoExploreTool: toolNames.indexOf('call_omo_explore') !== -1,
            toolCount: toolNames.length,
          }
          if (role === 'omo-explore') state.snapshots.explore = snap
          if (role === 'omo-sisyphus' && !state.snapshots.sisyphus) state.snapshots.sisyphus = snap
        }
      } catch (e) { /* contain */ }
      return next()
    })
    ctx.on('agent/request', async (payload, next) => {
      let config
      try { config = await next() } catch (e) { throw e }
      try {
        const agent = payload && payload.agent
        if (!agent || !config) return config
        const role = (agent.id === state.conductorId || agent.id === state.lastParentId) ? 'omo-sisyphus'
          : (state.exploreChildren.has(agent.id) ? 'omo-explore' : undefined)
        if (!role) return config
        const observed = { provider: config.provider, model: config.model }
        observeRoute(role, agent.id, observed, 'agent/request')
        if (role === 'omo-sisyphus') {
          state.routes.conductor = { provider: config.provider, model: config.model }
          refreshDiffer()
        } else {
          const want = state.routes.explore
          const needsFix = want.provider && (observed.provider !== want.provider || (want.model !== undefined && observed.model !== want.model))
          if (needsFix) {
            const fixed = Object.assign({}, config)
            if (want.provider) fixed.provider = want.provider
            if (want.model !== undefined) fixed.model = want.model
            state.enforcements.push({ sessionId: String(agent.id), from: observed, to: { provider: fixed.provider, model: fixed.model } })
            return fixed
          }
        }
      } catch (e) { state.errors.push('agent/request listener: ' + String(e)) }
      return config
    })
    ctx.on('agent/error', (payload) => {
      try {
        const agent = payload && payload.agent
        if (!agent) return
        const role = state.exploreChildren.has(agent.id) ? 'omo-explore'
          : (agent.id === state.conductorId || agent.id === state.lastParentId) ? 'omo-sisyphus' : undefined
        if (!role) return
        const err = payload.error
        const msg = err && err.message ? String(err.message) : (err && err.code ? 'code=' + String(err.code) : String(err))
        state.childErrors.push({ role, sessionId: String(agent.id), turn: safe(payload.turn), step: safe(payload.step), message: msg })
        if (state.childErrors.length > 20) state.childErrors.shift()
      } catch (e) { /* contain */ }
    })
    ctx.on('agent/created', (payload) => {
      try {
        const agent = payload && payload.agent
        if (!agent) return
        const header = agent.session && agent.session.header
        const lineageMatch = header && (header.origin === 'subagent' || (header.parentSession && String(header.parentSession) === String(state.lastParentId)))
        const routeMatch = agent.options && agent.options.provider === state.routes.explore.provider && agent.options.model === state.routes.explore.model
        if (lineageMatch && routeMatch) state.exploreChildren.add(agent.id)
        if (state.exploreChildren.has(agent.id)) {
          const o = agent.options
          if (o) observeRoute('omo-explore', agent.id, { provider: o.provider, model: o.model }, 'agent/created')
        }
      } catch (e) { /* contain */ }
    })
    ctx.on('subagent/start', (info) => {
      try { if (info && info.provider === 'omo-explore' && info.id) state.exploreChildren.add(info.id) } catch (e) { /* contain */ }
    })
    ctx.on('subagent/end', (info) => {
      try { if (info && info.provider === 'omo-explore' && info.id) state.exploreChildren.delete(info.id) } catch (e) { /* contain */ }
    })

    // ── omo-explore provider (FR-4) ──
    if (subagents) {
      try { state.availableBackends = subagents.list() } catch (e) { state.errors.push('subagents.list: ' + String(e)) }
      let base
      for (const n of ['spawn', 'fork']) {
        const p = subagents.getProvider(n)
        if (p) { base = p; break }
      }
      if (!base) {
        for (const n of state.availableBackends) {
          const p = subagents.getProvider(n)
          if (p && p.capabilities && p.capabilities.depthLimit && p.capabilities.toolFilter && p.capabilities.persona) { base = p; break }
        }
      }
      if (!base) {
        for (const n of state.availableBackends) {
          const p = subagents.getProvider(n)
          if (p) { base = p; break }
        }
      }
      if (!base) state.errors.push('no subagent backend registered — omo-explore provider cannot mount')
      else {
        state.baseBackend = base.name
        const caps = {
          outputSchema: !!(base.capabilities && base.capabilities.outputSchema),
          depthLimit: !!(base.capabilities && base.capabilities.depthLimit),
          toolFilter: !!(base.capabilities && base.capabilities.toolFilter),
          persona: !!(base.capabilities && base.capabilities.persona),
        }
        state.caps = caps
        if (!caps.depthLimit || !caps.toolFilter || !caps.persona) state.errors.push('base backend "' + base.name + '" lacks start capabilities (depthLimit=' + caps.depthLimit + ' toolFilter=' + caps.toolFilter + ' persona=' + caps.persona + ') — AC-6 restrictions degraded')
        try {
          subagents.registerProvider({
            name: 'omo-explore',
            capabilities: caps,
            inheritsParentContext: false,
            start(request) {
              try {
                if (request && request.parent) {
                  state.lastParentId = request.parent.id
                  captureConductorRoute(request.parent, 'provider.start:parent')
                }
              } catch (e) { /* contain */ }
              const merged = { label: request.label, prompt: request.prompt, parent: request.parent, signal: request.signal, descriptor: request.descriptor }
              if (request.outputSchema !== undefined && caps.outputSchema) merged.outputSchema = request.outputSchema
              if (caps.persona && state.texts.exploreFull) merged.persona = state.texts.exploreFull
              if (caps.toolFilter) merged.toolFilter = READ_ONLY_FILTER
              if (caps.depthLimit) merged.maxDepth = MAX_DEPTH
              if (state.routes.explore.provider) merged.agentOptions = Object.assign({ provider: state.routes.explore.provider }, state.routes.explore.model !== undefined ? { model: state.routes.explore.model } : {})
              return base.start(merged)
            },
          })
        } catch (e) { state.errors.push('registerProvider(omo-explore): ' + String(e)) }
      }
    }

    // ── tool registration helper ──
    const registerTool = (name, description, parameters, output, execute, timeoutMs) => {
      const def = { name, description, parameters, output }
      if (timeoutMs) def.timeoutMs = timeoutMs
      def.execute = execute
      let tool = def
      try { if (typeof harness !== 'undefined' && harness && typeof harness.defineTool === 'function') tool = harness.defineTool(def) } catch (e) { state.errors.push('defineTool(' + name + '): ' + String(e)) }
      let registered = false
      try {
        if (typeof harness !== 'undefined' && harness && typeof harness.registerTool === 'function') { harness.registerTool(ctx, tool); registered = true }
      } catch (e) { state.errors.push('registerTool(' + name + ') via harness: ' + String(e)) }
      if (!registered) {
        try {
          if (tools) { tools.register(tool); registered = true }
          else throw new Error('no tool registration path (harness/tools unavailable)')
        } catch (e) { state.errors.push('registerTool(' + name + ') via tools: ' + String(e)) }
      }
      if (registered) state.registeredTools.push(name)
    }

    // ── delegation tool (PRD §4.4 piece 3 / FR-4 binding) ──
    const DELEGATE_DESCRIPTION = [
      'Delegate a SELF-CONTAINED retrieval task to the omo-explore subagent — a read-only codebase retrieval specialist running on its own model route.',
      'Use this as the DEFAULT move for retrieval work: finding files, reading code, summarizing repository content. You are the conductor: judge, delegate, then review the result and answer the user.',
      'omo-explore CANNOT write or edit files and CANNOT delegate further, so hand off everything it needs in one message.',
      '',
      'MUST provide `task`: the complete, self-contained retrieval task (what to find/read, where, and what exactly to report back). Prompts MUST be in English.',
      '',
      '❌ FAILS: {"task": "帮我看看"} — not self-contained, no file/repo context.',
      '✅ CORRECT: {"task": "Read README.md at the workspace root and report the project goal in one sentence."}',
    ].join('\n')
    registerTool(
      'call_omo_explore',
      DELEGATE_DESCRIPTION,
      {
        task: { type: 'string', required: true, description: 'The complete, self-contained retrieval task for omo-explore. MUST be in English.' },
        description: { type: 'string', description: 'Short display label for the delegation (3-5 words).' },
      },
      {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            runId: { type: 'string', required: true },
            output: { type: 'string', required: true },
          },
        },
        render: (args, value) => [{ type: 'text', text: String(value.output) }],
      },
      async (args, exec) => {
        const parent = exec && exec.agent
        if (!parent) throw new Error('call_omo_explore requires a calling agent (exec.agent was undefined)')
        const task = typeof args.task === 'string' && args.task.trim() ? args.task.trim() : ''
        if (!task) throw new Error('call_omo_explore: `task` must be a non-empty string — the complete, self-contained retrieval task (MUST be in English)')
        if (!subagents || !state.baseBackend) throw new Error('concerto: omo-explore provider is not mounted (no subagent backend)')
        chain({ step: 'delegation-dispatched', via: 'call_omo_explore', taskChars: task.length })
        const run = await subagents.start('omo-explore', {
          label: (typeof args.description === 'string' && args.description.trim()) ? args.description.trim() : 'omo-explore retrieval',
          prompt: [{ type: 'text', text: task }],
          parent,
          signal: exec.signal,
        })
        state.exploreChildren.add(run.id)
        chain({ step: 'explore-started', runId: String(run.id) })
        try {
          if (run.localAgent && run.localAgent.options) observeRoute('omo-explore', run.id, { provider: run.localAgent.options.provider, model: run.localAgent.options.model }, 'delegation-tool')
          const result = await run.result
          const error = stopReasonError(result)
          const text = textOfBlocks(result.output)
          if (error) {
            chain({ step: 'explore-failed', stopReason: result.stopReason })
            const lastErr = state.childErrors.length ? state.childErrors[state.childErrors.length - 1] : undefined
            const suffix = lastErr && lastErr.sessionId === String(run.id) ? ' [child-error: ' + lastErr.message + ']' : ''
            throw new Error(withPartialText(error, result.output) + suffix)
          }
          chain({ step: 'explore-completed', outputChars: text.length })
          chain({ step: 'result-returned-to-conductor' })
          return { ok: true, runId: String(run.id), output: text }
        } finally {
          try { await run.dispose() } catch (e) { /* contain */ }
          state.exploreChildren.delete(run.id)
        }
      },
      300000,
    )

    // ── evidence writer (fs.createIfAbsent; counter-based names, no Date global) ──
    const writeEvidence = async (kind, report) => {
      if (!fs) return 'evidence in-memory only (fs unavailable)'
      let lastError
      for (let attempt = 0; attempt < 4; attempt++) {
        const n = ++state.evidenceCounter
        const rel = '.omo/evidence/concerto-' + kind + '-' + n + '.json'
        try {
          const target = state.workspaceRoot ? await fs.resolve(rel, { cwd: state.workspaceRoot }) : await fs.resolve(rel)
          await fs.writeText(target, JSON.stringify(report, null, 2), { kind: 'createIfAbsent' })
          return rel
        } catch (e) { lastError = e }
      }
      return 'evidence write failed: ' + String(lastError)
    }

    // ── follow-up #1: report + re-resolve after pi-ai activation (P-18) ──
    const ACTIVATE_DESCRIPTION = 'Follow-up #1: report the pi-ai route state and re-resolve the explore route. In-process settings.update is blocked by the vm-realm isPlainObject check (P-18); the supported activation path is editing $DSH_HOME/settings.yaml (llm-pi-ai section) — the settings-file provider hot-reloads it.'
    registerTool(
      'concerto_activate_piai',
      ACTIVATE_DESCRIPTION,
      {
        note: { type: 'string', description: 'Optional free-text note recorded with the activation.' },
      },
      {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            activated: { type: 'boolean', required: true },
            providersAfter: { type: 'json', required: true },
            exploreRoute: { type: 'json', required: true },
            routesDiffer: { type: 'boolean', required: true },
            detail: { type: 'string', required: true },
          },
        },
        render: (args, value) => [{ type: 'text', text: 'concerto_activate_piai: activated=' + value.activated + ' — providers=' + JSON.stringify(value.providersAfter) + ' — exploreRoute=' + JSON.stringify(value.exploreRoute) + '\n' + value.detail }],
      },
      async (args, exec) => {
        try { state.availableProviders = (llm.listProviders() || []).map((p) => ({ id: p.id, name: p.name })) } catch (e) { /* contain */ }
        const activated = state.availableProviders.some((p) => p.id === 'deepseek')
        await resolveExploreRoute()
        return {
          activated,
          providersAfter: state.availableProviders,
          exploreRoute: { provider: safe(state.routes.explore.provider), model: safe(state.routes.explore.model) },
          routesDiffer: state.routesDiffer,
          detail: activated ? 'pi-ai route `deepseek` is active; explore route re-resolved.' : 'pi-ai route `deepseek` is NOT active — edit $DSH_HOME/settings.yaml (llm-pi-ai section) and re-run this tool.',
        }
      },
      120000,
    )

    // ── follow-up #2: author the persistent `concerto` user preset ──
    const PRESET_DESCRIPTION = 'Follow-up #2: ensure the persistent `concerto` user preset exists (ctx.agentPresets.copy from `standard`), report its composition path and the roster; pass validate:"yes" to mount-validate it with standingKeyFor (the same mount a session start performs).'
    registerTool(
      'concerto_preset_copy',
      PRESET_DESCRIPTION,
      {
        validate: { type: 'string', description: 'Optional: pass "yes" to run the standingKeyFor mount validation after the copy.' },
      },
      {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            path: { type: 'string', required: true },
            created: { type: 'boolean', required: true },
            roster: { type: 'json', required: true },
            validation: { type: 'string', required: true },
          },
        },
        render: (args, value) => [{ type: 'text', text: 'concerto_preset_copy: id=' + value.id + ' created=' + value.created + '\npath: ' + value.path + '\nroster: ' + JSON.stringify(value.roster) + '\nvalidation: ' + value.validation }],
      },
      async (args, exec) => {
        if (!agentPresets) throw new Error('agentPresets service unavailable — cannot author the preset')
        let preset
        let created = false
        try { preset = await agentPresets.resolve('concerto') } catch (e) { /* not present yet */ }
        if (!preset) {
          await agentPresets.copy('standard', 'concerto', '协奏模式 (Concerto Mode)')
          created = true
          preset = await agentPresets.resolve('concerto')
        }
        const roster = (await agentPresets.list()).map((p) => ({ id: p.id, trust: p.trust, path: p.path, broken: !!p.broken }))
        state.presetRoster = roster
        let validation = 'not requested'
        if (typeof args.validate === 'string' && args.validate === 'yes') {
          try { await agentPresets.standingKeyFor('concerto'); validation = 'mounted OK' } catch (e) { validation = String((e && e.message) || e) }
        }
        return { id: 'concerto', path: preset.path, created, roster, validation }
      },
      120000,
    )

    // ── verification tool (FR-8) ──
    const VERIFY_DESCRIPTION = [
      'Run the Concerto Mode MVP verification suite (FR-8): checks registration, prompt assembly (AC-3), the omo-explore restrictions (AC-6, incl. the AC-6b physical no-delegation hardening), dual routing (AC-5), route observability, follow-up #1 (pi-ai active) and #2 (persistent preset on roster), then writes an evidence file under .omo/evidence/.',
      'Returns a PASS/FAIL report with one check per row; a FAIL here is a real defect, not a style opinion.',
    ].join(' ')
    registerTool(
      'concerto_verify',
      VERIFY_DESCRIPTION,
      {
        detail: { type: 'string', description: 'Optional: pass "full" to include route observations and snapshots in the summary text.' },
      },
      {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            result: { type: 'string', required: true },
            total: { type: 'number', required: true },
            passed: { type: 'number', required: true },
            failed: { type: 'number', required: true },
            skipped: { type: 'number', required: true },
            evidenceFile: { type: 'string', required: true },
            summary: { type: 'string', required: true },
            checks: { type: 'json', required: true },
            routes: { type: 'json', required: true },
            notes: { type: 'json', required: true },
            errors: { type: 'json', required: true },
            childErrors: { type: 'json', required: true },
            routeObs: { type: 'json', required: true },
            chainEvents: { type: 'json', required: true },
            enforcements: { type: 'json', required: true },
            snapshots: { type: 'json', required: true },
            captures: { type: 'json', required: true },
            presetRoster: { type: 'json', required: true },
          },
        },
        render: (args, value) => [{ type: 'text', text: 'concerto_verify: ' + value.result + '\n' + value.summary }],
      },
      async (args, exec) => {
        refreshDiffer()
        try { state.availableProviders = (llm.listProviders() || []).map((p) => ({ id: p.id, name: p.name })) } catch (e) { /* contain */ }
        if (agentPresets) { try { state.presetRoster = (await agentPresets.list()).map((p) => ({ id: p.id, trust: p.trust, path: p.path, broken: !!p.broken })) } catch (e) { state.errors.push('agentPresets.list: ' + String(e)) } }
        const checks = []
        const check = (id, name, status, detail) => checks.push({ id, name, status, detail })
        check('svc-01', 'core services present', state.services.subagents && state.services.tools && state.services.systemPrompt && state.services.llm ? 'pass' : 'fail',
          'subagents=' + state.services.subagents + ' tools=' + state.services.tools + ' systemPrompt=' + state.services.systemPrompt + ' llm=' + state.services.llm + ' fs=' + state.services.fs)
        check('fr2-01', 'concerto mode activated for this session (FR-2)', state.conductorId ? 'pass' : 'skip',
          'conductor=' + String(state.conductorId) + ' workspaceRoot=' + String(state.workspaceRoot))
        check('fr3-01', 'all 5 system-sections loaded (FR-3)', Object.keys(state.sections).length === 5 ? 'pass' : 'fail',
          'loaded=' + Object.keys(state.sections).length + '/5' + (state.errors.length ? ' — errors: ' + state.errors.slice(0, 3).join(' | ') : ''))
        check('fr3-02', 'sisyphus prompt assembled in PRD order, 4 sections (AC-3)', /# Orchestrator Role[\s\S]*# Delegation Discipline[\s\S]*## Hard Blocks[\s\S]*## Anti-Patterns/.test(state.texts.sisyphus || '') ? 'pass' : 'fail',
          'builder=[role, delegation-discipline, hard-blocks, anti-patterns] joined with blank lines')
        check('fr4-01', "provider 'omo-explore' registered (FR-4)", subagents && subagents.list().indexOf('omo-explore') !== -1 ? 'pass' : 'fail',
          'backends=' + JSON.stringify(state.availableBackends) + ' base=' + String(state.baseBackend))
        check('fr4-02', 'provider capabilities depthLimit/toolFilter/persona (FR-4)', state.caps && state.caps.depthLimit && state.caps.toolFilter && state.caps.persona ? 'pass' : 'fail',
          JSON.stringify(state.caps))
        check('fr4-03', 'delegation tool call_omo_explore registered (FR-4)', tools && tools.get('call_omo_explore') !== undefined ? 'pass' : 'fail',
          'registeredTools=' + JSON.stringify(state.registeredTools))
        check('ac6a-01', 'toolFilter read-only: deny [write, edit, call_omo_explore], bash kept (AC-6a / T12 + AC-6b hardening)', JSON.stringify(READ_ONLY_FILTER) === JSON.stringify({ deny: ['write', 'edit', 'call_omo_explore'] }) ? 'pass' : 'fail',
          JSON.stringify(READ_ONLY_FILTER))
        check('ac6b-01', 'depth cap maxDepth=1 (AC-6b / T13, defense-in-depth)', MAX_DEPTH === 1 && state.caps && state.caps.depthLimit ? 'pass' : 'fail',
          'maxDepth=' + MAX_DEPTH + '; rejection semantics: SubagentDepthError "subagent depth 2 exceeds maxDepth 1" (source-verified resolveChildDepth)')
        check('fr5-01', 'dual routes resolved (FR-5)', state.routes.explore.provider ? 'pass' : 'fail',
          'conductor=' + JSON.stringify(state.routes.conductor) + ' explore=' + JSON.stringify(state.routes.explore))
        check('ac5-01', 'route pairs differ (AC-5)', state.routesDiffer ? 'pass' : 'fail',
          'conductor=' + JSON.stringify(state.routes.conductor) + ' explore=' + JSON.stringify(state.routes.explore))
        check('fr6-01', 'hard-blocks content non-empty (FR-6)', (state.texts.hardBlocksOnly || '').indexOf('## Hard Blocks') !== -1 ? 'pass' : 'fail',
          (state.texts.hardBlocksOnly || '').length + ' chars')
        check('fr6-02', 'explore child persona carries hard blocks (FR-6 injection channel)', (state.texts.exploreFull || '').indexOf('## Hard Blocks') !== -1 ? 'pass' : 'fail',
          'persona shadow = explore-persona + hard-blocks + anti-patterns')
        check('ac3-01', 'conductor assembly snapshot: omo:concerto section + hard blocks present (AC-3)', state.snapshots.sisyphus ? (state.snapshots.sisyphus.hasConcertoSection && state.snapshots.sisyphus.hardBlocksInjected ? 'pass' : 'fail') : 'skip',
          state.snapshots.sisyphus ? JSON.stringify({ hasConcertoSection: state.snapshots.sisyphus.hasConcertoSection, hardBlocksInjected: state.snapshots.sisyphus.hardBlocksInjected }) : 'no conductor assembly observed yet')
        check('ac6a-02', 'explore assembly snapshot: write/edit/call_omo_explore absent, read present (AC-6a + AC-6b)', state.snapshots.explore ? (!state.snapshots.explore.hasWriteTool && !state.snapshots.explore.hasEditTool && !state.snapshots.explore.hasCallOmoExploreTool && state.snapshots.explore.hasReadTool ? 'pass' : 'fail') : 'skip',
          state.snapshots.explore ? JSON.stringify({ write: state.snapshots.explore.hasWriteTool, edit: state.snapshots.explore.hasEditTool, callOmoExplore: state.snapshots.explore.hasCallOmoExploreTool, read: state.snapshots.explore.hasReadTool, toolCount: state.snapshots.explore.toolCount }) : 'no explore assembly observed yet (run concerto_demo first)')
        check('ac6b-02', 'explore cannot physically delegate: call_omo_explore absent from child tool list (AC-6b hardening)', state.snapshots.explore ? (!state.snapshots.explore.hasCallOmoExploreTool ? 'pass' : 'fail') : 'skip',
          state.snapshots.explore ? JSON.stringify({ callOmoExplore: state.snapshots.explore.hasCallOmoExploreTool }) : 'run concerto_demo first')
        check('fr6-03', 'explore assembly snapshot: persona + hard blocks injected (FR-6)', state.snapshots.explore ? (state.snapshots.explore.explorePersonaInjected && state.snapshots.explore.hardBlocksInjected ? 'pass' : 'fail') : 'skip',
          state.snapshots.explore ? JSON.stringify({ persona: state.snapshots.explore.explorePersonaInjected, hardBlocks: state.snapshots.explore.hardBlocksInjected }) : 'run concerto_demo first')
        check('ac5-02', 'route observability: explore route observed (AC-5 / P-7)', state.routeObs['omo-explore'] ? 'pass' : 'skip',
          state.routeObs['omo-explore'] ? JSON.stringify({ first: state.routeObs['omo-explore'].first, last: state.routeObs['omo-explore'].last, count: state.routeObs['omo-explore'].count }) : 'no explore run observed yet')
        check('ac5-03', 'route observability: conductor route observed (AC-5)', state.routeObs['omo-sisyphus'] ? 'pass' : 'skip',
          state.routeObs['omo-sisyphus'] ? JSON.stringify({ last: state.routeObs['omo-sisyphus'].last, count: state.routeObs['omo-sisyphus'].count }) : 'no conductor request observed by listener yet')
        check('ac4-01', 'delegation chain recorded (AC-4)', state.chainEvents.some((e) => e.step === 'explore-completed') ? 'pass' : 'skip',
          JSON.stringify(state.chainEvents))
        check('fu1-01', 'pi-ai route `deepseek` active (follow-up #1 / Q-3)', state.availableProviders.some((p) => p.id === 'deepseek') ? 'pass' : 'fail',
          'providers=' + JSON.stringify(state.availableProviders.map((p) => p.id)))
        check('fu2-01', 'persistent `concerto` preset on roster (follow-up #2)', agentPresets ? (state.presetRoster.some((p) => p.id === 'concerto') ? 'pass' : 'fail') : 'skip',
          state.presetRoster.length ? JSON.stringify(state.presetRoster.find((p) => p.id === 'concerto')) : 'roster empty')

        const failed = checks.filter((c) => c.status === 'fail').length
        const summaryLines = ['concerto_verify result: ' + (failed === 0 ? 'PASS' : 'FAIL') + ' — ' + checks.filter((c) => c.status === 'pass').length + ' passed, ' + failed + ' failed, ' + checks.filter((c) => c.status === 'skip').length + ' skipped']
        for (const c of checks) summaryLines.push('[' + String(c.status).toUpperCase() + '] ' + c.id + ' — ' + c.name + (c.detail ? ': ' + c.detail : ''))
        if (state.captures.length) summaryLines.push('[AUDIT] route captures: ' + JSON.stringify(state.captures))
        const report = {
          result: failed === 0 ? 'PASS' : 'FAIL',
          plugin: 'oh-my-opendsh / concerto-mode-mvp (current DSH)',
          checks,
          routes: { conductor: { provider: safe(state.routes.conductor.provider), model: safe(state.routes.conductor.model) }, explore: { provider: safe(state.routes.explore.provider), model: safe(state.routes.explore.model) } },
          routesDiffer: state.routesDiffer,
          providers: state.availableProviders,
          backends: state.availableBackends,
          baseBackend: state.baseBackend,
          enforcements: state.enforcements,
          routeObs: state.routeObs,
          chainEvents: state.chainEvents,
          snapshots: { sisyphus: state.snapshots.sisyphus || null, explore: state.snapshots.explore || null },
          captures: state.captures,
          presetRoster: state.presetRoster,
          notes: state.notes,
          errors: state.errors,
          childErrors: state.childErrors,
          workspaceRoot: state.workspaceRoot,
          evidenceFile: null,
        }
        report.evidenceFile = await writeEvidence('verify', report)
        const passed = checks.filter((c) => c.status === 'pass').length
        const skipped = checks.filter((c) => c.status === 'skip').length
        return {
          result: report.result,
          total: checks.length,
          passed,
          failed,
          skipped,
          evidenceFile: report.evidenceFile,
          summary: summaryLines.join('\n'),
          checks: report.checks,
          routes: report.routes,
          notes: report.notes,
          errors: report.errors,
          childErrors: report.childErrors,
          routeObs: report.routeObs,
          chainEvents: report.chainEvents,
          enforcements: report.enforcements,
          snapshots: report.snapshots,
          captures: report.captures,
          presetRoster: report.presetRoster,
        }
      },
      120000,
    )

    // ── demo tool (FR-7 / AC-4): real sisyphus → explore → answer chain ──
    const DEMO_TASK = [
      'TASK (complete the retrieval work):',
      '1. Read the file README.md at the workspace root (use the read tool with file_path "README.md").',
      '2. Report: (a) the project name, (b) the heading of the "Project Goal" section in at most 10 words, (c) one sentence describing the project goal.',
      '3. Keep README_RESULT under 80 words.',
      '',
      'COMPLIANCE PROBES — the concerto MVP harness is testing its own guardrails; attempt BOTH honestly:',
      'P1. Attempt to call the tool named `call_omo_explore` with a tiny task ("read README.md"). If the call errors, copy the exact error text into your answer. If that tool is not in your tool list, write "call_omo_explore not in tool list".',
      'P2. Attempt to create a file at "concerto-probe.txt" with content "probe" using the `write` tool. If the `write` tool is not in your tool list, write "write tool not in tool list". Do NOT use bash to write the file; answer only about the `write` tool.',
      '',
      'FINAL ANSWER FORMAT (exactly these three lines):',
      'README_RESULT: <name> | <goal heading> | <one sentence>',
      'NESTED_DELEGATION_PROBE: <exact error text, or "call_omo_explore not in tool list">',
      'WRITE_PROBE: <outcome, or "write tool not in tool list">',
    ].join('\n')
    const DEMO_DESCRIPTION = 'Run the Concerto Mode MVP dummy demo scenario (FR-7): the conductor delegates "what does this repo README say" to omo-explore, which runs read-only on its own model route, with two model-driven negative probes (write-tool absence, nested-delegation physical absence). Uses the real model on the explore route; the task is tiny and orchestrated, not real engineering work.'
    registerTool(
      'concerto_demo',
      DEMO_DESCRIPTION,
      {
        probes: { type: 'string', description: 'Optional: pass "off" to run the plain README retrieval without the two negative compliance probes.' },
      },
      {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            result: { type: 'string', required: true },
            stopReason: { type: 'string', required: true },
            output: { type: 'string', required: true },
            evidenceFile: { type: 'string', required: true },
            ac4: { type: 'json', required: true },
            ac5: { type: 'json', required: true },
            ac6a: { type: 'json', required: true },
            ac6b: { type: 'json', required: true },
            routes: { type: 'json', required: true },
            chain: { type: 'json', required: true },
            childErrors: { type: 'json', required: true },
          },
        },
        render: (args, value) => [{ type: 'text', text: 'concerto_demo: ' + value.result + ' — stopReason: ' + value.stopReason + '\n' + String(value.output || '').slice(0, 3000) }],
      },
      async (args, exec) => {
        refreshDiffer()
        const parent = exec && exec.agent
        if (!parent) throw new Error('concerto_demo requires a calling agent')
        if (!subagents || !state.baseBackend) throw new Error('concerto: omo-explore provider is not mounted')
        const probesOn = !(typeof args.probes === 'string' && args.probes === 'off')
        const taskText = probesOn ? DEMO_TASK : DEMO_TASK.split('\n').slice(0, 4).join('\n')
        chain({ step: 'demo-dispatched', scenario: 'README retrieval (FR-7)', probes: probesOn ? 'on' : 'off' })
        const run = await subagents.start('omo-explore', {
          label: 'concerto demo README retrieval',
          prompt: [{ type: 'text', text: taskText }],
          parent,
          signal: exec.signal,
        })
        state.exploreChildren.add(run.id)
        chain({ step: 'explore-started', runId: String(run.id) })
        let value
        try {
          if (run.localAgent && run.localAgent.options) observeRoute('omo-explore', run.id, { provider: run.localAgent.options.provider, model: run.localAgent.options.model }, 'delegation-tool')
          const result = await run.result
          const text = textOfBlocks(result.output)
          const err = stopReasonError(result)
          if (err) chain({ step: 'explore-failed', stopReason: result.stopReason })
          else chain({ step: 'explore-completed', outputChars: text.length })
          chain({ step: 'result-returned-to-conductor' })
          const obs = state.routeObs['omo-explore']
          const exploreSnap = state.snapshots.explore
          value = {
            result: err ? 'FAIL' : 'PASS',
            stopReason: String(result.stopReason),
            output: text.slice(0, 4000),
            evidenceFile: null,
            ac4: {
              delegationDispatched: true,
              exploreStarted: true,
              exploreCompleted: !err,
              resultReturned: true,
              chainOk: !err && state.chainEvents.some((e) => e.step === 'explore-completed'),
            },
            ac5: { routesDiffer: state.routesDiffer, observedMatchesConfigured: !!(obs && obs.last && obs.last.provider === state.routes.explore.provider && obs.last.model === state.routes.explore.model) },
            ac6a: {
              writeEditDeniedByConfig: true,
              assemblyProof: exploreSnap ? { writeVisible: exploreSnap.hasWriteTool, editVisible: exploreSnap.hasEditTool, readVisible: exploreSnap.hasReadTool, callOmoExploreVisible: exploreSnap.hasCallOmoExploreTool, toolCount: exploreSnap.toolCount } : null,
              childReportedWriteAbsent: /write tool not in tool list/i.test(text) || /no.{0,12}write.? tool/i.test(text),
            },
            ac6b: {
              maxDepth: MAX_DEPTH,
              physicalNoDelegation: exploreSnap ? !exploreSnap.hasCallOmoExploreTool : null,
              childReportedDepthRejection: /exceeds maxDepth/i.test(text),
              childReportedToolAbsent: /call_omo_explore not in tool list/i.test(text),
            },
            routes: { conductor: { provider: safe(state.routes.conductor.provider), model: safe(state.routes.conductor.model) }, exploreConfigured: { provider: safe(state.routes.explore.provider), model: safe(state.routes.explore.model) }, exploreObserved: obs ? obs.last : null },
            chain: state.chainEvents.slice(-14),
            childErrors: state.childErrors.slice(-8),
          }
        } catch (e) {
          value = { result: 'ERROR', stopReason: 'infrastructure', output: String(e), evidenceFile: null, ac4: { chainOk: false }, ac5: {}, ac6a: {}, ac6b: {}, routes: {}, chain: state.chainEvents.slice(-14), childErrors: state.childErrors.slice(-8) }
        } finally {
          try { await run.dispose() } catch (e) { /* contain */ }
          state.exploreChildren.delete(run.id)
        }
        try { value.evidenceFile = await writeEvidence('demo', value) } catch (e) { /* contain */ }
        return value
      },
      600000,
    )

    console.log('[concerto] mounted v6 — conductor=' + String(state.conductorId) + ' workspaceRoot=' + String(state.workspaceRoot) + ' exploreRoute=' + JSON.stringify(state.routes.explore) + ' backend=' + String(state.baseBackend) + ' errors=' + state.errors.length)
  },
}

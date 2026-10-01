// scripts/prove-command-registry.mjs — P4-T16 (门 8; the Q-1 conclusion, proven).
//
// Precedent: scripts/prove-guardrail-deny-path.mjs (P3-T19) and
// scripts/prove-explore-toolfilter.mjs (T12). Same discipline — the INSTALLED dsh's
// OWN modules do the work, a real registry is built in-process, and only the leaves
// are stubs. No LLM, no network, no boot.
//
// WHAT IS REAL HERE:
//   * `@deepseek-ai/dsh-commands` — the real CommandRuntime, the real
//     `parseCommand`, the real `execute()` the Web UI's command surface calls;
//   * the real `patches/omo-dsh/omo-commands/src/index.ts` plugin, applied
//     through the real cordis `Context` exactly as dsh applies an insert row.
//
// WHAT IS STUBBED, AND WHY THAT IS STILL A PROOF:
//   * the `commands` service the plugin registers INTO. The real runtime needs a
//     live agent, a session and a log to execute against; the registry itself —
//     which rows are registered, under which name, with which description and
//     argument hint, and whether the handler is the real one — is the subject
//     here, and the real CommandRuntime below proves the rest through the real
//     service rather than a look-alike.
//
// WHY THIS PROOF EXISTS (Q-1, closed in review; now pinned).
//
//   ① The command REGISTRY is visible in a real composition. Until now the only
//      place that was proven was `tests/omo-commands/registration.test.ts`, which
//      builds its own fake `ctx`. A fake ctx can be wrong about the very thing it
//      is checking: if the real `apply()` read its rows from the wrong place, or
//      stopped calling `ctx.commands.register` at all, a test whose stub still
//      records calls would keep passing while the shipped plugin registered
//      nothing. Here the plugin is applied to a REAL cordis Context, so a
//      registration that does not happen is a registration that did not happen.
//
//   ② A THROWING command handler settles as `kind: 'error'`, not as a crash.
//      dsh-commands documents this ("a thrown or aborted handler settles as
//      `kind: 'error'`, dsh-commands/lib/index.js:293-296") and the e2e observes
//      `command/done` with that kind — but "we read the code" is not a proof, and
//      the e2e never triggers a throw (no ported command throws in the sandbox).
//      Q-1's conclusion is therefore currently enforced by nothing. This proof
//      drives a real `execute()` with a handler that throws and pins the settle
//      shape, so a dsh upgrade that changes it to re-throw is caught by 门 8
//      rather than by a user's command silently killing their turn.
//
// Usage:
//   node scripts/prove-command-registry.mjs <dsh-node_modules>
// Exit 0 = PASS, exit 1 = FAIL (with every failed assertion printed).

import { pathToFileURL } from 'node:url'

const [nm] = process.argv.slice(2)
if (!nm) {
  console.error('usage: node scripts/prove-command-registry.mjs <dsh-node_modules>')
  process.exit(2)
}

const problems = []
const fail = (message) => problems.push(message)
const note = (message) => console.log(`P4T16-PROOF ${message}`)
const imp = (p) => import(pathToFileURL(`${nm}/${p}`).href)

// ── the real modules ────────────────────────────────────────────────────────
const { Context } = await imp('@deepseek-ai/cordis/lib/index.js')
const { CommandRuntime, parseCommand } = await imp('@deepseek-ai/dsh-commands/lib/index.js')

const commandsSrc = new URL('../patches/omo-dsh/omo-commands/src/', import.meta.url)
const commandsPluginModule = await import(new URL('index.ts', commandsSrc).href)
const { COMMAND_MANIFEST, EXPECTED_COMMAND_COUNT } = await import(
  new URL('manifest.ts', commandsSrc).href
)
// The registered-line FORMATTER, not a transcription. `formatCommandRegisteredLine`
// is the one function that decides what a boot line looks like, so deriving the
// census from it means a change to the marker text is caught here on the next run
// instead of by a user reading a boot log.
const { formatCommandRegisteredLine, formatLoadedSummaryLine } = await import(
  new URL('boot-markers.ts', commandsSrc).href
)

// ── ① the registry, through a REAL cordis Context ────────────────────────────
const plugin = typeof commandsPluginModule.default === 'function'
  ? commandsPluginModule.default
  : commandsPluginModule.apply
if (typeof plugin !== 'function') {
  fail('omo-commands/src/index.ts exports no callable plugin (default or apply)')
}

// The REAL `CommandRuntime` is itself the cordis `commands` service (it extends
// Service and calls `super(ctx, 'commands')`, dsh-commands/lib/index.js:241-242),
// so part ① needs no stub at all: the plugin registers into the real registry and
// the proof reads the real registry back. The first draft of this file provided a
// recording stand-in and then ALSO tried `new CommandRuntime({ log: null })` for
// part ② — which crashed on `ctx.reflect`, because a cordis service is
// constructed FROM a live context. One real service serves both halves.
//
// A `skills` stand-in is still needed: the plugin ALSO registers the 19 vendored
// skills through `ctx.skills`, and without it every row logs
// `cannot get property "skills" without inject` and the whole apply() is judged on
// noise. `skills` is not what this proof is about, so it is a leaf stub — and the
// registry, the registration call and the settle path are all real.
const ctx = new Context()
// Constructing the service on a live context is what REGISTERS it — a second
// `ctx.provide('commands', runtime)` is rejected as a duplicate at root.
const runtime = new CommandRuntime(ctx)
const registeredSkills = []
ctx.provide('skills', {
  register(definition) { registeredSkills.push(definition); return definition },
})
// The boot markers this plugin prints are part of what the proof is about, so
// capture the real console output across the real apply() rather than trusting a
// hand-written marker list. (scripts/smoke-real.mjs's LOADED_MARKERS covers the
// three SUMMARY lines only, and it is a manual gate; the per-command lines had no
// full census anywhere.)
const bootLines = []
const realLog = console.log
console.log = (...args) => { bootLines.push(args.join(' ')); }
try {
  await ctx.plugin(plugin)
} finally {
  console.log = realLog
}
await new Promise((resolve) => setImmediate(resolve))
const bootLog = bootLines.join('\n')

// Read the real registry back through its own view API.
const view = runtime.view({ id: 'agent-proof' })
const registrations = new Map()
for (const name of COMMAND_MANIFEST.map((entry) => entry.id)) {
  const found = view.get(name)
  if (found !== undefined) registrations.set(name, found.definition)
}

const ported = COMMAND_MANIFEST.filter((entry) => entry.status === 'ported')
const pending = COMMAND_MANIFEST.filter((entry) => entry.status !== 'ported')

note(`registry: ${registrations.size} command(s) registered, manifest carries ${COMMAND_MANIFEST.length} (${ported.length} ported, ${pending.length} pending)`)

if (COMMAND_MANIFEST.length !== EXPECTED_COMMAND_COUNT) {
  fail(`manifest carries ${COMMAND_MANIFEST.length} rows but EXPECTED_COMMAND_COUNT is ${EXPECTED_COMMAND_COUNT}`)
}
if (registrations.size === 0) {
  fail('the real apply() registered NO command — this is the failure the fake-ctx test cannot see')
}
for (const entry of ported) {
  const definition = registrations.get(entry.id)
  if (definition === undefined) {
    fail(`ported manifest row '${entry.id}' was NOT registered by the real apply()`)
    continue
  }
  if (typeof definition.handler !== 'function') {
    fail(`'${entry.id}' registered without a callable handler`)
  }
  if (typeof definition.description !== 'string' || definition.description.length === 0) {
    fail(`'${entry.id}' registered with no description`)
  }
  // argumentHint 来自 manifest 行（唯一事实源）；null 时**完全不声明** input。
  if (entry.argumentHint === null) {
    if (definition.input !== undefined) {
      fail(`'${entry.id}' has argumentHint=null but still declared an input shape`)
    }
  } else if (definition.input?.hint !== entry.argumentHint) {
    fail(`'${entry.id}' input.hint=${JSON.stringify(definition.input?.hint)} (manifest says ${JSON.stringify(entry.argumentHint)})`)
  }
}
// Q-3: the pending rows must be ABSENT. Registering `ulw-plan` would shadow the
// gesture bridge that dsh-tool-skill installs, and the roster test that guards it
// lives in the unit suite — here it is the same claim seen from the real side.
for (const entry of pending) {
  if (registrations.has(entry.id)) {
    fail(`pending manifest row '${entry.id}' IS registered — for ulw-plan this would shadow the gesture bridge (Q-3)`)
  }
}

// ── ①b the full registered-marker census, derived from the formatter ─────────
//
// `LOADED_MARKERS` in smoke-real.mjs is three hand-written summary strings. The
// per-command `… command <id> registered` lines had no census at all: each e2e
// scenario asserted only ITS OWN command's line, so a port that registered under
// the wrong name would have been caught by that scenario's e2e, while a port with
// no scenario of its own had nothing watching it. Here the expectation is
// computed from the manifest ids and the ONE formatter, so it covers every ported
// row including any that has no scenario.
const missingMarkers = []
for (const entry of ported) {
  const expected = formatCommandRegisteredLine(entry.id)
  if (!bootLog.includes(expected)) missingMarkers.push(`${entry.id} → ${JSON.stringify(expected)}`)
}
if (missingMarkers.length > 0) {
  fail(`boot log is missing the registered marker for: ${missingMarkers.join('; ')}`)
} else {
  note(`boot log carries all ${ported.length} per-command registered markers (formatter-derived)`)
}
// The summary formatter takes the manifest ENTRIES, not counts — the first draft
// passed three numbers and `countsByStatus` threw on a non-iterable.
const summary = formatLoadedSummaryLine(COMMAND_MANIFEST, ported)
if (!bootLog.includes(summary)) {
  fail(`boot log is missing the summary marker ${JSON.stringify(summary)}`)
} else {
  note(`boot log carries the summary marker ${JSON.stringify(summary)}`)
}
// 一个 pending 行也**不得**出现注册标记（Q-3）——这正是「汇总说 5/6」而用户看不到
// 第六行的原因。
for (const entry of pending) {
  const ghost = formatCommandRegisteredLine(entry.id)
  if (bootLog.includes(ghost)) {
    fail(`boot log contains a registered marker for the PENDING row '${entry.id}' — the summary would understate reality`)
  }
}

// ── ② a throwing handler settles as `kind: 'error'` ──────────────────────────
const thrown = new Error('prove-command-registry: deliberate handler failure')

// ②a parse: the real parser admits the name (a parse miss would test nothing).
const parsed = parseCommand('/prove-throw')
if (parsed === null || parsed === undefined || parsed.name !== 'prove-throw') {
  fail(`parseCommand('/prove-throw') did not resolve to name 'prove-throw' (got ${JSON.stringify(parsed?.name ?? parsed)})`)
} else {
  note(`parseCommand admitted '/prove-throw'`)
}

// ②b execute: the real CommandRuntime against a real registration whose handler
// throws. The agent/session/log below are leaves — the settle path under test is
// dsh-commands', not the agent's. The log is a leaf because `appendLifecycle`
// writes `command/run` / `command/done` into it and the proof only cares that
// execute() reached that point; the recorded rows are read back below so the
// pairing is witnessed too, not merely the settle kind.
runtime.register({ name: 'prove-throw', description: 'deliberate throw', handler: () => { throw thrown } })
// The lifecycle writer is `session.append.bind(session)(type, data)`
// (dsh-commands/lib/index.js:411) — so the leaf session needs an `append` METHOD
// that is safe to bind, not a `log` object. The first draft guessed `log.append`
// and execute() died on `Cannot read properties of undefined (reading 'bind')`.
const lifecycle = []
// `appendLifecycle` calls `session.append(type, data)` — TWO arguments, not one
// row object. The first draft wrote `append(row)`, so every lifecycle event
// arrived as the bare string 'command/run' and the pairing check found nothing;
// it reported "0 command/run rows" while the settle had in fact happened.
const leafSession = {
  id: 'session-proof',
  append(type, data) { lifecycle.push({ type, data }) },
}
const leafAgent = { id: 'agent-proof', session: leafSession }

let settled = null
let rethrown = null
try {
  settled = await runtime.execute(leafAgent, '/prove-throw', [], new AbortController().signal)
} catch (error) {
  rethrown = error
}

// ── the REAL settle contract, both halves ────────────────────────────────────
//
// The task framed this as "a handler throw settles as kind:'error' rather than
// crashing". The first run of this proof showed that framing is HALF right, and
// the half that was wrong is the half that matters. dsh-commands does
// (dsh-commands/lib/index.js:381-385):
//
//     } catch (error) {
//       this.settleThrown(agent.session, parsed.name, commandId, error)
//       throw error            // ← the re-throw
//     }
//
// So a throwing handler BOTH appends `command/done` with `kind: 'error'` AND
// re-raises the original error to `execute()`'s caller. The lifecycle settle is
// what the e2e sees; the re-throw is what decides whether the user's turn dies.
// Proving only the first would have left the load-bearing half unproven, and
// proving that it does NOT re-throw would have asserted something dsh does not do
// — a proof that fails for the right reason is still a wrong proof.
//
// ②a: the lifecycle settle, with the message intact.
const runRows = lifecycle.filter((row) => row.type === 'command/run')
const doneRows = lifecycle.filter((row) => row.type === 'command/done')
if (runRows.length !== 1) fail(`the throwing execution produced ${runRows.length} command/run rows, want 1`)
if (doneRows.length !== 1) {
  fail(`the throwing execution produced ${doneRows.length} command/done rows, want 1 — settleThrown did not run`)
} else {
  const done = doneRows[0].data ?? {}
  note(`throwing handler: command/done kind='${done.kind}'`)
  if (done.kind !== 'error') {
    fail(`a throwing handler settled the lifecycle as kind=${JSON.stringify(done.kind)}, want 'error'`)
  }
  if (typeof done.text !== 'string' || !done.text.includes('deliberate handler failure')) {
    fail(`the command/done text does not carry the thrown message: ${JSON.stringify(String(done.text).slice(0, 80))}`)
  }
  if (runRows.length === 1 && done.commandId !== runRows[0].data?.commandId) {
    fail('the throwing execution\'s command/run and command/done carried different commandIds')
  }
}

// ②b: the re-throw, identity-preserved (not a wrapped copy — callers switch on
// their own error types, so wrapping would change observable behaviour).
if (rethrown === null) {
  fail('execute() swallowed a throwing handler and returned normally — dsh re-throws by design (lib/index.js:383); a change here changes the caller contract')
} else if (rethrown !== thrown) {
  fail(`execute() re-threw a DIFFERENT object (${String(rethrown)}), not the handler's own error`)
} else {
  note('execute() re-threw the handler\'s own error object')
}
if (settled !== null) {
  fail(`execute() both re-threw AND returned a settled result (${JSON.stringify(settled)}) — the two halves are exclusive`)
}

// ②c control: the pipeline is not dead — the NEXT command still runs.
  let ok = null
  try {
    runtime.register({ name: 'prove-ok', description: 'control', handler: () => ({ kind: 'success', text: 'fine' }) })
    ok = await runtime.execute(leafAgent, '/prove-ok', [], new AbortController().signal)
  } catch (error) {
    fail(`the control command after a throwing one also threw: ${String(error?.message ?? error)}`)
  }
// ②c: the registry is still alive — the next command settles normally.
const okResult = ok?.result ?? ok
if (okResult === null) {
  fail('the control command returned no settled result')
} else if (okResult.kind !== 'success') {
  fail(`the control command settled as ${JSON.stringify(okResult.kind)}, want 'success' — one bad handler must not kill the registry`)
} else {
  note('control command after the throw settled as kind=\'success\'')
}

// ── report ──────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  for (const message of problems) console.log(`FAIL ${message}`)
  console.log(`P4T16-PROOF FAIL — ${problems.length} problem(s)`)
  process.exit(1)
}
console.log('P4T16-PROOF PASS — command registry visible in a real composition; a throwing handler settles as kind:\'error\'')
process.exit(0)

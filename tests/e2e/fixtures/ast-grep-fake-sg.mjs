#!/usr/bin/env node
// ast-grep-fake-sg.mjs — the hermetic `sg` DOUBLE, and in the P6-T7 scenario it
// is the TOOL'S REAL BODY, not a stub.
//
// THE CHAIN IT SITS ON (this is what the scenario proves, and this file is the
// link that makes it provable without a network or a downloaded binary):
//
//   mock-LLM  →  dsh's `bash` tool  →  THIS process  →  stdout  →  the tool
//   result  →  the session log  →  the driver's assertions
//
// What comes back on stdout is not canned bytes: every `file`, `line`, `column`
// and `text` in the JSON is READ OUT OF THE FIXTURE FILES at run time, exactly
// as the real `sg` reads them out of the project it is pointed at. So the
// scenario's byte-equality assertions are about transport — do the bytes the tool
// authored survive the whole way back into the session log — and not about a
// string someone typed into the driver. The driver reads the same files the other
// way round, and ast-grep-fixture-constants.mjs is the inert third reader; see
// that file's header for which pair of readers proves what.
//
// WHY IT MAY ANSWER AT ALL, and where its honesty stops. It answers for ONE
// pattern family, `OMO_E2E_AST_GREP_TARGET(`, and it says `[]` for everything
// else. It is NOT a TypeScript parser: it has no AST, no grammar, and no
// language support. Its matching rule is the documented line rule below, and that
// rule is the whole of its capability. A real `sg` would match the same three
// lines here for a better reason — it actually parses — and this double cannot
// demonstrate that reason; it can only refuse to fake it. The boundary is stated
// rather than claimed closed: what this proves is the plumbing of the tool chain
// and the loudness of its absence, never ast-grep's semantics.
//
// THE MATCHING RULE (shared semantics, and the driver implements its own copy of
// it — same rule, two implementations, never a shared function):
//   a line is a match iff `TOKEN(` occurs in it OUTSIDE any string literal and
//   outside any `//` comment, and that occurrence is not the declaration
//   (`function TOKEN(`). Quote state at the occurrence is part of the predicate,
//   not a detail: an earlier revision stripped comments but scored a hit wherever
//   `TOKEN(` appeared in the surviving text, so `"OMO_E2E_AST_GREP_TARGET(x)
//   inside string"` matched — text, not a call. Three decoys then refuse for three
//   genuinely different reasons — a bare mention has no call parens, a different
//   callee has the wrong name, and a call SHAPED token inside a string literal is
//   quoted text. Comment stripping is still load-bearing: the token appears in this
//   project's comments, including once as `TOKEN(…)`, so a scan that did not strip
//   comments would report matches that are prose.
//
// NEVER SILENT. An argv this double does not implement prints a NAMED line on
// stderr and exits 2. A fixture that exits 0 on work it did not do is how a fake
// starts passing for real — the same rule fake-sg.sh follows.

import { readdirSync, readFileSync, appendFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  AST_GREP_SENTINEL_TOKEN,
  AST_GREP_FAKE_SG_LOG_ENV,
} from './ast-grep-fixture-constants.mjs'

/** The version this double announces — a LITERAL, restated here on purpose, and
 *  pinned from the outside rather than trusted from inside. (An earlier comment
 *  here claimed it was "imported from the single source of truth rather than
 *  restated"; that was false as written — it was a literal with an env override
 *  nothing set. Corrected in FIX-T7, and the override is gone: a double whose
 *  announced version could be rewritten by the environment could not be pinned
 *  at all.) The seal is `lspHermeticSgSealSelfTest` in drive.mjs, which SPAWNS
 *  this file's `--version` and refuses any output not containing the provisioner's
 *  own `SG_PINNED_VERSION` — the same shape fake-sg.sh's seal takes. A double that
 *  announced a different version would be a fixture failing its own gate, and the
 *  resolver's `--version` probe (sg-resolver.ts) is the consumer that would
 *  silently accept it, so the seal has to live outside this file. */
const ANNOUNCED_VERSION = 'ast-grep 0.43.0'

/** Strip a trailing `//` comment, tracking single/double/backtick strings so a
 *  `//` inside a string does not cut the line. Not a tokenizer — it tracks only
 *  what the fixture's decoys require, and the honest limit is stated above. */
export function codePartOf(line) {
  let quote = null
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quote !== null) {
      if (ch === '\\') { i += 1; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i)
  }
  return line
}

/** Where this line CALLS the sentinel, as a 0-based index into the RAW line, or
 *  -1 when it does not. The walk carries quote state, because the question the
 *  rule asks is about the occurrence, not about the line: finding `TOKEN(` in
 *  text that survives comment stripping is not enough when the occurrence sits
 *  inside `"…"` and is therefore quoted prose. A `\` consumes the character it
 *  escapes, so `"\"TOKEN("` stays inside the string. The declaration is skipped by
 *  testing what immediately precedes the occurrence, not the whole line — a line
 *  that declared and called the sentinel on one line would otherwise lose its
 *  call. */
export function sentinelCallIndex(line) {
  let quote = null
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quote !== null) {
      if (ch === '\\') { i += 1; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '/' && line[i + 1] === '/') return -1
    if (line.startsWith(`${AST_GREP_SENTINEL_TOKEN}(`, i) && !/function\s*$/.test(line.slice(0, i))) return i
  }
  return -1
}

/** The rule, applied to one line: does it CALL the sentinel family? */
export function lineIsSentinelCall(line) {
  return sentinelCallIndex(line) !== -1
}

/** Every `.ts` file under `dir`, sorted, so the result order is deterministic
 *  across filesystems. Symlinks are not followed: the fixture is a flat tree and
 *  following links would let a stray link reach outside the sandbox copy. */
export function listSourceFiles(dir) {
  const out = []
  const walk = (current) => {
    let entries
    try {
      entries = readdirSync(current)
    } catch (error) {
      // Named, not raw: the caller turns this into the same stderr line as every
      // other unreadable subject, instead of a stack trace from inside a walk.
      throw new Error(`cannot read directory ${current}: ${String(error?.code ?? error)}`)
    }
    for (const entry of entries.sort()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(current, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (entry.endsWith('.ts')) out.push(full)
    }
  }
  walk(dir)
  return out
}

/**
 * The matches for one search: `file` relative to the search directory (the form
 * real `sg` prints), `line` 1-based, `column` 1-based at the token's first
 * character, `text` the trimmed code part. Every field is read from the file in
 * front of it — nothing here is passed in from the caller's expectation.
 */
export function collectMatches(searchDir) {
  const matches = []
  for (const full of listSourceFiles(searchDir)) {
    const lines = readFileSync(full, 'utf8').split('\n')
    lines.forEach((line, index) => {
      const at = sentinelCallIndex(line)
      if (at === -1) return
      matches.push({
        file: relative(searchDir, full).split(/[\\/]/).join('/'),
        line: index + 1,
        // The column is the CALL SITE the walk found, indexed into the raw line —
        // not `codePartOf(line).indexOf(…)`, which would score the first
        // occurrence wherever it sits, including inside a string.
        column: at + 1,
        text: codePartOf(line).trim(),
      })
    })
  }
  return matches
}

function emit(json, payload) {
  if (!json) {
    // Human format, the shape `sg` prints without `--json`: one block per match.
    process.stdout.write(payload.map((m) => `${m.file}:${m.line}:${m.column}\n  ${m.text}\n`).join(''))
    return
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

/** Flags that CONSUME the next argv. Written down as a set rather than inferred
 *  from "does it start with a dash", because the inference is what broke the
 *  first run of this double: `sg run -p P --lang ts --json=compact .` has `ts`
 *  sitting in the middle of its argument list as a VALUE, and a filter that only
 *  excludes dashed tokens took `ts` as the search directory and died in
 *  `readdirSync('ts')`. Real sg takes values for `--lang`, so a double that
 *  cannot tell a value from a positional is not a double of real sg's grammar at
 *  all — it is a different command with a similar name.
 *
 *  THE AUTHORITATIVE TABLE is
 *  `patches/omo-dsh/vendor/shared-skills/skills/ast-grep/references/cli.md` — the
 *  repo-root path. The bare `vendor/…` spelling used here before FIX-T7-R3 was
 *  relative to `patches/omo-dsh/`, which made the citation unopenable from the repo
 *  root, and a reference you cannot follow is not a reference. This list is that
 *  table's transcription, not a guess: `-p/--pattern`,
 *  `-l/--lang`, `--globs`, `--color` there, plus `-j/--threads <N>` at cli.md:35
 *  — which a previous revision of this file had in BOOLEAN_FLAGS as if it meant
 *  `--json`, so `sg run -j 4` consumed `-j` as a boolean, took `4` as a
 *  positional, and reached `readdirSync('4')`. A double that misreads a value as
 *  a path is not merely wrong, it is wrong in the direction of doing work on the
 *  wrong subject.
 *
 *  There is no `-g` here, and that is deliberate: cli.md:26 spells the glob flag
 *  as `--globs <G>` with NO short form, so `-g` is an unknown flag and belongs to
 *  the named-refusal family below, not to a transcription that claims to be one. */
const VALUE_FLAGS = new Set([
  '-p', '--pattern',
  '-l', '--lang',
  '--globs',
  '--color',
  '-j', '--threads',
])

/** The ONE `--json=<S>` format this double actually produces. cli.md:31 lists
 *  three (`pretty | stream | compact`), and accepting all three while emitting the
 *  same bytes for each was measured — `--json=compact`, `--json=stream` and
 *  `--json=pretty` came back with an identical md5, which is exactly the silent
 *  substitution this file's own NEVER SILENT rule forbids: a caller who asked for
 *  NDJSON and got a JSON array would have no way to notice. So the accepted set
 *  is narrowed to what is truly produced, and the other two are refused BY NAME
 *  with the discrepancy stated in the message rather than papered over. (The
 *  alternative — really emitting NDJSON and indented JSON — was declined: nothing
 *  in the scenario consumes them, and a second output path the scenario never
 *  exercises is untested surface dressed up as fidelity.) */
const JSON_FORMATS = new Set(['compact'])

/** Boolean flags this double understands, and they are only the ones cli.md lists
 *  as taking no value. `-i` there is `--interactive`, NOT `--ignore-case`;
 *  `--ignore-case`, `-w/--word-match`, `--pretty` and `--strict` are not `sg run`
 *  flags at all, and they used to sit in this set — which meant `sg run
 *  --ignore-case` exited 0 having done something other than what was asked. That
 *  is the exact silence this file's own NEVER SILENT rule forbids, so they are
 *  gone and fall through to the named exit 2 below. (`--strict` is not a flag
 *  either: cli.md:23 spells it `--strictness <S>`, a VALUE flag, and an unknown
 *  dashed word is refused by name rather than half-implemented.)
 *
 *  `--json` is NOT in this set, and FIX-T7-R3 measured it rather than reasoned it
 *  away: a probe on this branch recorded every name that ever reached it, and
 *  across `--json`, `--json=compact`, `-i` and `--follow` only `-i` and `--follow`
 *  were hit — the dedicated `--json` branch above intercepts both spellings before
 *  this set is consulted, so a `--json` entry here was unreachable code wearing the
 *  look of documentation. Unreachable entries are how a table starts lying: the next
 *  reader edits it, sees `--json`, and believes it is what makes `--json` work. */
const BOOLEAN_FLAGS = new Set(['-i', '--follow'])

/** Accepted-but-NOT-implemented, each refused with its own named line. `-r` and
 *  `--update-all` are here on purpose: the skill's biggest documented gotcha is
 *  that real sg takes `--json --update-all` and silently mutates nothing. A
 *  read-only double that quietly accepted them would teach exactly the wrong
 *  lesson, so it says no out loud instead. */
const NOT_IMPLEMENTED = new Map([
  ['-r', 'rewrite'],
  ['--rewrite', 'rewrite'],
  ['-U', '--update-all'],
  ['--update-all', '--update-all'],
  ['--json-out', '--json-out (write results to a file)'],
  ['--inspect', '--inspect (rule inspection)'],
])

/** The argv grammar this double implements. Anything else is a named exit 2. */
export function main(argv, cwd = process.cwd()) {
  if (argv.includes('--version') || argv.includes('-V')) {
    process.stdout.write(`${ANNOUNCED_VERSION}\n`)
    return 0
  }
  const runIndex = argv.indexOf('run')
  if (runIndex === -1) {
    // FIX-T7-R2-7: real sg makes `run` the DEFAULT subcommand, so `sg -p 'foo'`
    // means `sg run -p 'foo'` (cli.md:11). This double does NOT honour that
    // shorthand, deliberately and stated rather than silently: honouring it would
    // double the grammar this file has to hold for a form no scenario invokes, and
    // a fixture whose grammar is inferred is a fixture nobody specified. The
    // refusal therefore names the shorthand so the reader learns the real tool's
    // shape from the error instead of from a man page.
    process.stderr.write(`[ast-grep-fake-sg] not implemented: ${JSON.stringify(argv)} — this double speaks \`sg run -p <pattern> [--json[=compact]] <dir>\` and \`--version\` only. Note: \`sg -p …\` is real sg's shorthand for \`sg run -p …\` (cli.md:11); this double requires the explicit \`run\`.\n`)
    return 2
  }
  const rest = argv.slice(runIndex + 1)
  const values = new Map()
  const positional = []
  let json = false
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    // FIX-T7-R2-1: `-` used to fall through into `positional`, and then into
    // `readdirSync('-')`, and then out of the process as a bare node stack trace —
    // the loudest possible way to be silent about a feature this double does not
    // have. cli.md:25 documents `--stdin` as the real tool's way in, and the
    // scenario has no stdin face at all, so `-` is refused BY NAME. Implementing
    // stdin was declined: it is a second input path with no assertion behind it.
    if (arg === '-') {
      process.stderr.write('[ast-grep-fake-sg] `-` (stdin) is not implemented by this double — it searches files in a directory; real sg reads stdin via `--stdin` (cli.md:25)\n')
      return 2
    }
    const inlineEquals = arg.startsWith('-') && arg.includes('=')
    const name = inlineEquals ? arg.slice(0, arg.indexOf('=')) : arg
    if (NOT_IMPLEMENTED.has(name)) {
      process.stderr.write(`[ast-grep-fake-sg] \`${name}\` is NOT implemented — this double is read-only by design; a rewrite leg would need a copied fixture and a second pass, and P6-T7 declined that trade (see the scenario header)\n`)
      return 2
    }
    // `--json` is the one flag whose VALUE is optional (`--json` alone, or
    // `--json=<S>` with S from cli.md:31), so it cannot live in VALUE_FLAGS —
    // but the optional form is not a licence to ignore the form that IS given.
    if (name === '--json') {
      if (!inlineEquals) { json = true; continue }
      const format = arg.slice(arg.indexOf('=') + 1)
      if (!JSON_FORMATS.has(format)) {
        // Two different truths, two different messages: `pretty`/`stream` ARE
        // formats real sg emits (cli.md:31) and this double is the narrower tool;
        // `yaml` is not a format sg emits at all. Collapsing them into one line
        // would tell the caller the tool was wrong when the tool was only narrow.
        const realSgFormats = ['pretty', 'stream', 'compact']
        process.stderr.write(realSgFormats.includes(format)
          ? `[ast-grep-fake-sg] \`--json=${format}\` is a format this double does not emit; it emits \`compact\` (cli.md:31 lists three, this double emits one)\n`
          : `[ast-grep-fake-sg] \`--json=${format}\` is not a format sg emits — accepted: ${[...JSON_FORMATS].join(', ')} (cli.md:31)\n`)
        return 2
      }
      json = true
      continue
    }
    if (VALUE_FLAGS.has(name)) {
      const value = inlineEquals ? arg.slice(arg.indexOf('=') + 1) : rest[i + 1]
      if (typeof value !== 'string' || value.length === 0) {
        process.stderr.write(`[ast-grep-fake-sg] \`${name}\` carries no value\n`)
        return 2
      }
      // `-j/--threads <N>` is numeric by its own documentation; a non-numeric
      // thread count is a malformed command, and consuming it silently would let
      // this double accept argv real sg would reject.
      if ((name === '-j' || name === '--threads') && !/^\d+$/.test(value)) {
        process.stderr.write(`[ast-grep-fake-sg] \`${name}\` takes a number, got \`${value}\` (cli.md:35)\n`)
        return 2
      }
      values.set(name, value)
      if (!inlineEquals) i += 1
      continue
    }
    if (BOOLEAN_FLAGS.has(name)) continue
    if (arg.startsWith('-')) {
      process.stderr.write(`[ast-grep-fake-sg] unknown flag \`${name}\` in ${JSON.stringify(argv)} — refusing to guess what this run meant\n`)
      return 2
    }
    positional.push(arg)
  }
  const pattern = values.get('-p') ?? values.get('--pattern')
  if (typeof pattern !== 'string' || pattern.length === 0) {
    process.stderr.write('[ast-grep-fake-sg] `run` without `-p <pattern>` — refusing to guess a pattern\n')
    return 2
  }
  const searchDir = positional[0] ?? '.'
  // FIX-T7-R3-4b: a SECOND positional was silently dropped — `sg run -p x .
  // /nonexistent` searched `.` and exited 0 as if nothing had been left out, which
  // is the quietest failure this file is built to forbid: the caller asked about two
  // trees and got an answer about one, with a green exit to certify it. Real sg
  // accepts multiple paths, this double searches one, so the gap is stated by name
  // and the run refuses rather than narrowing the subject on the sly.
  if (positional.length > 1) {
    process.stderr.write(`[ast-grep-fake-sg] ${String(positional.length)} search paths given (${positional.join(', ')}) — this double searches exactly ONE directory; refusing to answer about \`${searchDir}\` and pretend the others were covered\n`)
    return 2
  }

  // FIX-T7-R2-1: the search subject is CHECKED before it is searched. Three forms
  // used to reach `readdirSync` and die there — `--lang ts -` (the `-` admitted by
  // this file's own loop), `--json=compact /nonexistent-xyz`, and a FILE passed as
  // the directory (ENOTDIR) — each leaving the process with a bare node stack trace
  // and exit 1. A stack trace is the worst possible error format here: it names
  // node's internals instead of the mistake, and exit 1 is the same code a real
  // search failure would give, so the caller cannot tell "you asked for something
  // this tool is not" from "the search ran and broke". Both now answer with the
  // same named line and exit 2, the code this file's NEVER SILENT contract
  // reserves for argv it does not implement. Checked BEFORE the evidence log is
  // written, so the log only ever records runs that actually searched.
  let searchStats = null
  try {
    searchStats = statSync(searchDir)
  } catch {
    searchStats = null
  }
  if (searchStats === null || !searchStats.isDirectory()) {
    process.stderr.write(`[ast-grep-fake-sg] search path \`${searchDir}\` is not a readable directory — refusing to search a subject that is not there\n`)
    return 2
  }

  // The evidence the scenario reads off disk: this really was spawned, with this
  // argv, in this cwd. Without it, a non-empty result could be indistinguishable
  // from a result the driver fabricated.
  //
  // The default lives under the SEARCH CWD, not under a path the caller must
  // pass: the driver's scenario `env` thunk is called with no arguments
  // (drive.mjs's `scenarioEnvOverlay(def)` invokes `def.env()`), so it cannot
  // name a per-sandbox log file. cwd is — the search runs inside the sandbox
  // copy, so the evidence lands in the sandbox with the work it evidences, and
  // the driver reads it back at a path both sides can compute independently.
  const logPath = process.env[AST_GREP_FAKE_SG_LOG_ENV] ?? join(cwd, '.fake-sg-calls.log')
  if (typeof logPath === 'string' && logPath.length > 0) {
    appendFileSync(logPath, `spawned argv=${JSON.stringify(argv)} cwd=${cwd}\n`)
  }

  // The one honesty boundary that matters: answer for the sentinel family, and
  // say `[]` — honestly, with no matches — for everything else. A double that
  // answered SOMETHING for any pattern would let the scenario pass on a subject
  // it was never about.
  if (!pattern.includes(AST_GREP_SENTINEL_TOKEN)) {
    emit(json, [])
    return 0
  }
  try {
    emit(json, collectMatches(searchDir))
  } catch (error) {
    // The precheck above covers the ordinary case; this catches the rest — a
    // directory that turns unreadable mid-walk, a permission bit that moved — and
    // reports it as the named failure it is rather than as a stack trace.
    process.stderr.write(`[ast-grep-fake-sg] search path \`${searchDir}\` is not a readable directory — ${String(error instanceof Error ? error.message : error)}\n`)
    return 2
  }
  return 0
}

// Run only when invoked as a program, so the driver can import the rule above
// without executing a CLI (the imported symbols are the fixture's readers' shared
// rule; the pin lives in ast-grep-fixture-constants.mjs, not here).
if (process.argv[1] !== undefined && process.argv[1].endsWith('ast-grep-fake-sg.mjs')) {
  process.exitCode = main(process.argv.slice(2))
}

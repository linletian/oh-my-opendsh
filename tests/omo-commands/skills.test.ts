// P4-T5 — the skill delivery mechanism: frontmatter reader, vendor discovery and
// the loud-but-non-fatal registration loop (plan §4.1 candidate b′).
//
// THE THREE THINGS THIS SUITE PINS
//   1. The READER'S SEMANTICS against the vendor files themselves, plus the
//      dsh-skill-filesystem rules it copies (non-empty required fields, optional
//      string dropped when empty, metadata forwarded only as a mapping) and the
//      three frontmatter SHAPES actually vendored (bare scalar, double-quoted
//      with an inner escaped quote, one nested metadata level).
//   2. DISCOVERY ↔ the real vendor tree: 19 skill directories, frontmatter name
//      == directory name, every one of them parseable. This is the omo-hooks
//      "manifest ↔ file set" discipline (static gate c13) applied to the skill
//      side, minus the gate: the assertion lives here because the vendor tree is
//      a vendored COPY whose count is a fact this file can read.
//   3. The LOOP: one failing skill logs its own FAILED line and the sweep
//      continues; the summary reports the honest ratio; a returned disposer is
//      adopted by the fiber.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  EXPECTED_VENDOR_SKILL_COUNT,
  INVOCATION_KEYS,
  RUNTIME_SOURCE,
  SKILL_FILE_NAME,
  SKILL_NAME_PATTERN,
  VENDOR_SKILLS_DIR,
  VendorSkillError,
  listVendorSkillDirectories,
  parseSkillDocument,
  readVendorSkillDocument,
  runSkillRegistrations,
  scanVendorSkills,
  toSkillRegistration,
  type SkillRegistrationContext,
  type VendorSkillEntry,
} from '../../patches/omo-dsh/omo-commands/src/skills.ts'

/** A synthetic document, so reader tests never depend on vendor prose. */
function document(fields: string, body = '# Title\n\nbody text\n'): string {
  return `---\n${fields}\n---\n\n${body}`
}

/** One entry built from a synthetic document, for loop tests. */
function entry(path: string, directoryName: string, name: string): VendorSkillEntry {
  return {
    path,
    directoryName,
    document: { name, description: `fixture ${name}`, content: 'body' },
  }
}

/** A context whose `skills.register` records calls and can be told to throw. */
function fakeSkillContext(options: { throwOn?: (name: string) => boolean } = {}): {
  ctx: SkillRegistrationContext
  registered: { name: string; description: string; content: string; path: string; source: string }[]
  disposals: (() => void)[]
  stopFiber: () => void
} {
  const registered: { name: string; description: string; content: string; path: string; source: string }[] = []
  const disposals: (() => void)[] = []
  const ctx: SkillRegistrationContext = {
    skills: {
      register: (registration) => {
        if (options.throwOn?.(registration.name) === true) {
          throw new Error('registry rejected the runtime skill')
        }
        const record = {
          name: registration.name,
          description: registration.description,
          content: registration.content,
          path: registration.path,
          source: registration.source,
        }
        registered.push(record)
        const unregister = () => {
          const index = registered.findIndex((row) => row.name === registration.name)
          if (index >= 0) registered.splice(index, 1)
        }
        disposals.push(unregister)
        return unregister
      },
    },
    effect: (execute) => {
      const collected = execute()
      if (typeof collected === 'function') {
        disposals.push(collected)
        return collected
      }
      return undefined
    },
  }
  return {
    ctx,
    registered,
    disposals,
    stopFiber: () => {
      for (const dispose of [...disposals].reverse()) dispose()
      disposals.length = 0
    },
  }
}

describe('P4-T5 the frontmatter reader — the three vendored shapes', () => {
  it('reads a bare scalar value (the ultrawork shape, measured)', () => {
    const parsed = parseSkillDocument(
      document('name: ultrawork\ndescription: Binding ultrawork mode directive for omo-senpi.'),
      '/fixture/SKILL.md',
    )
    expect(parsed.name).toBe('ultrawork')
    expect(parsed.description).toBe('Binding ultrawork mode directive for omo-senpi.')
  })

  it('reads a double-quoted scalar and UNESCAPES inner quotes (the remove-ai-slops shape)', () => {
    // Naive slice-and-slice would leave `\"` in the catalog description; the
    // escape translation is why the reader cannot just strip the quotes.
    const parsed = parseSkillDocument(
      document('name: remove-ai-slops\ndescription: "Covers \\"remove slop\\" and \\"deslop\\"."'),
      '/fixture/SKILL.md',
    )
    expect(parsed.description).toBe('Covers "remove slop" and "deslop".')
  })

  it('reads ONE nested metadata level (the hyperplan / ultrawork / ulw-plan shape)', () => {
    const parsed = parseSkillDocument(
      document([
        'name: hyperplan',
        'description: Adversarial multi-agent planning skill',
        'metadata:',
        '  short-description: Adversarial 5-member cross-critique planning',
      ].join('\n')),
      '/fixture/SKILL.md',
    )
    expect(parsed.metadata).toEqual({ 'short-description': 'Adversarial 5-member cross-critique planning' })
  })

  it('keeps the body verbatim after trimming (mirrors dsh-skill-filesystem `body.trim()`)', () => {
    const parsed = parseSkillDocument(document('name: x\ndescription: y', '\n# Heading\n\nstep one\n\n'), '/f/SKILL.md')
    expect(parsed.content).toBe('# Heading\n\nstep one')
  })

  it('omits whenToUse entirely when the frontmatter has none', () => {
    // Mirrors dsh's `optionalString`: absent means absent, not `undefined` keys.
    const parsed = parseSkillDocument(document('name: x\ndescription: y'), '/f/SKILL.md')
    expect(Object.hasOwn(parsed, 'whenToUse')).toBe(false)
  })

  it('carries whenToUse through when present', () => {
    const parsed = parseSkillDocument(
      document('name: x\ndescription: y\nwhenToUse: when the user asks for x'),
      '/f/SKILL.md',
    )
    expect(parsed.whenToUse).toBe('when the user asks for x')
  })

  it('ignores an unknown top-level key that carries a plain scalar', () => {
    // An informational key is not an error: dsh-skill-filesystem ignores every
    // field it does not consume either, so failing here would break the boot over
    // a comment-like key. NOT a blanket "ignore unknown keys" rule — the
    // invocability pair is refused (the next case), because that one is CONSUMED
    // upstream and this path would invert it.
    const parsed = parseSkillDocument(document('name: x\ndescription: y\nallowed-tools: read'), '/f/SKILL.md')
    expect(parsed.name).toBe('x')
  })

  it('refuses the invocability keys instead of silently inverting them', () => {
    // MEASURED: dsh-skill-filesystem consumes both keys; the runtime registry
    // has no such field and `toSkillRegistration` leaves `invocation` absent, so
    // dsh would default this skill to model+user invocable — the opposite of
    // `disable-model-invocation: true`. A boot failure is the honest outcome.
    for (const key of INVOCATION_KEYS) {
      expect(() => parseSkillDocument(
        document(`name: x\ndescription: y\n${key}: true`),
        '/fixture/SKILL.md',
      )).toThrow(new RegExp(`${key}.*cannot honour`))
    }
  })

  it('skips whole-line YAML comments, including inside a nested mapping', () => {
    // A comment is legal YAML that dsh-skill-filesystem accepts, and a future
    // vendored file explaining its own `metadata` is the most likely innocuous
    // addition (dual review, MINOR 2). Failing a skill over its own comment would
    // be absurd — and the nested one also pins that a comment does NOT close the
    // open mapping the way a top-level key does.
    const parsed = parseSkillDocument(document([
      'name: x',
      '# why this name',
      'description: y',
      'metadata:',
      '  # the short form the catalog shows',
      '  short-description: "x in one line"',
    ].join('\n')), '/f/SKILL.md')
    expect(parsed.name).toBe('x')
    expect(parsed.description).toBe('y')
    expect(parsed.metadata).toEqual({ 'short-description': 'x in one line' })
  })

  it('parses a TWO-key nested mapping (the deviation I refused, pinned)', () => {
    // Clearing `openKey` after each nested line would reject this — legal YAML —
    // and today every vendored `metadata` has exactly ONE nested key, so no other
    // test would notice. This is the regression pin for that decision (dual
    // review, deviation ① follow-up).
    const parsed = parseSkillDocument(document([
      'name: x',
      'description: y',
      'metadata:',
      '  short-description: "short"',
      '  audience: "beginner"',
    ].join('\n')), '/f/SKILL.md')
    expect(parsed.metadata).toEqual({ 'short-description': 'short', audience: 'beginner' })
  })

  it('rejects a duplicate NESTED key, naming its real file line', () => {
    // The second `short-description` would otherwise silently overwrite the first,
    // leaving a catalog description nobody wrote. Line 7 in the document built
    // below (frontmatter opens at line 1, so its first key is line 2) — the
    // off-by-one fix is pinned here, not just in the reader.
    const raw = document([
      'name: x',                              // file line 2
      'description: y',                       // 3
      'metadata:',                            // 4
      '  short-description: "first"',         // 5
      '  short-description: "second"',        // 6
    ].join('\n'))
    expect(raw.split('\n')[5]).toBe('  short-description: "second"')
    expect(() => parseSkillDocument(raw, '/fixture/SKILL.md')).toThrow(
      'duplicate frontmatter key "metadata.short-description" at line 6',
    )
  })

  it('rejects a duplicate TOP-LEVEL key, naming its real file line', () => {
    const raw = document([
      'name: x',            // file line 2
      'description: y',     // 3
      'description: z',     // 4
    ].join('\n'))
    expect(() => parseSkillDocument(raw, '/fixture/SKILL.md')).toThrow('duplicate frontmatter key "description" at line 4')
  })

  it('strips a TRAILING comment off a plain scalar, and keeps `#` inside quotes', () => {
    // MEASURED YAML: outside quotes a `#` opens a comment only when it starts the
    // scalar or follows whitespace. The value is model-facing (it lands in
    // `<available_skills>`), so a swallowed `# note` would print a human's aside
    // to the model as part of the skill's contract (dual review, final NIT).
    expect(parseSkillDocument(document('name: x\ndescription: A. # note'), '/f/SKILL.md').description)
      .toBe('A.')
    expect(parseSkillDocument(document('name: x\ndescription: "A # note"'), '/f/SKILL.md').description)
      .toBe('A # note')
    // The rule is not a blunt cut at the first `#`: a hash that is NOT preceded
    // by whitespace is data — the real `lsp-setup` description contains `c#/razor`.
    expect(parseSkillDocument(document('name: x\ndescription: supports c#/razor'), '/f/SKILL.md').description)
      .toBe('supports c#/razor')
    // Same rule on a nested key and on a bare `name`.
    const parsed = parseSkillDocument(document([
      'name: x # the skill name',
      'description: y',
      'metadata:',
      '  short-description: "short" # for the catalog',
    ].join('\n')), '/f/SKILL.md')
    expect(parsed.name).toBe('x')
    expect(parsed.metadata).toEqual({ 'short-description': 'short' })
  })

  it('rejects a required field whose whole value is a comment (YAML reads it as missing)', () => {
    // `description: # note` leaves the key VALUELESS in YAML, so dsh's
    // `stringField` would read it as missing. Before this fix the reader kept the
    // literal text `# note` and would have published that as a description.
    expect(() => parseSkillDocument(document('name: x\ndescription: # note'), '/fixture/SKILL.md'))
      .toThrow('frontmatter requires description')
  })

  it('tolerates CRLF frontmatter (the closing `---` still terminates)', () => {
    const parsed = parseSkillDocument('---\r\nname: x\r\ndescription: y\r\n---\r\n\r\nbody\r\n', '/f/SKILL.md')
    expect(parsed.name).toBe('x')
    expect(parsed.content).toBe('body')
  })
})

describe('P4-T5 the frontmatter reader — everything malformed fails LOUDLY, naming the file', () => {
  const cases: { label: string; raw: string }[] = [
    { label: 'no frontmatter at all', raw: '# just a body\n' },
    { label: 'unterminated frontmatter', raw: '---\nname: x\ndescription: y\n' },
    { label: 'missing name', raw: document('description: y') },
    { label: 'missing description', raw: document('name: x') },
    { label: 'empty quoted description reads as missing', raw: document('name: x\ndescription: ""') },
    { label: 'non-kebab-case name', raw: document('name: Shared/Git\ndescription: y') },
    { label: 'name with an underscore', raw: document('name: git_master\ndescription: y') },
    { label: 'block scalar', raw: document('name: x\ndescription: |\n  multi line') },
    { label: 'sequence item', raw: document('name: x\ndescription: y\ntags:\n  - one\n  - two') },
    { label: 'line without a colon', raw: document('name: x\ndescription: y\njust prose') },
    { label: 'nested line under a scalar key', raw: document('name: x\n  oops: y\ndescription: y') },
    { label: 'unknown escape in a quoted scalar', raw: document('name: x\ndescription: "bad \\q escape"') },
  ]
  for (const { label, raw } of cases) {
    it(`rejects ${label}`, () => {
      expect(() => parseSkillDocument(raw, '/fixture/SKILL.md')).toThrow(VendorSkillError)
      // The message must name the file: a boot log line that cannot say which
      // vendored skill is broken is not a loud failure, it is a shrug.
      expect(() => parseSkillDocument(raw, '/fixture/SKILL.md')).toThrow('/fixture/SKILL.md')
    })
  }
})

describe('P4-T5 the REAL vendor tree — discovery ↔ the 19 shipped skills', () => {
  it('finds exactly the expected number of skill directories', () => {
    // Hand-transcribed count, the same discipline as EXPECTED_HOOK_COUNT: a new
    // vendored skill must move this number in the same commit.
    expect(EXPECTED_VENDOR_SKILL_COUNT).toBe(19)
    expect(listVendorSkillDirectories(VENDOR_SKILLS_DIR)).toHaveLength(EXPECTED_VENDOR_SKILL_COUNT)
  })

  it('delivers a scan whose NAMES are the directory set, one for one (dual review, NIT 12)', () => {
    // The count assertion above and the "every directory's name equals its own
    // name" assertion below are a PAIR, and neither substitutes for the other: a
    // refactor that made the count pass by, say, filtering a directory out of the
    // scan would keep a bare length check green while the catalog silently lost a
    // skill. Asserting the two SETS here is what makes a refactor unable to
    // remove the cross-check.
    const directories = listVendorSkillDirectories(VENDOR_SKILLS_DIR)
    const scan = scanVendorSkills(VENDOR_SKILLS_DIR)
    expect(scan.failures).toEqual([])
    expect(scan.entries.map((entry) => entry.directoryName).sort()).toEqual([...directories].sort())
    expect(scan.entries.map((entry) => entry.document.name).sort()).toEqual([...directories].sort())
  })

  it('resolves the vendor tree as an ABSOLUTE path next to the plugin package', () => {
    // P-9: anchored to this module's own URL, never process.cwd(). The measured
    // `link:` install makes that the real repository path.
    expect(VENDOR_SKILLS_DIR.startsWith('/')).toBe(true)
    expect(VENDOR_SKILLS_DIR.endsWith('/patches/omo-dsh/vendor/shared-skills/skills')).toBe(true)
    expect(existsSync(VENDOR_SKILLS_DIR)).toBe(true)
  })

  it('lists the directory names in code-point order (the registry\'s own runtime order)', () => {
    const directories = listVendorSkillDirectories(VENDOR_SKILLS_DIR)
    expect(directories).toEqual([...directories].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    // `hyperplan` / `ultrawork` sort after `git-master` but before `init-deep`;
    // the two non-shared skills are inside this one tree (measured), so the
    // catalog is ONE flat 19-name set, not a nested `shared/` namespace.
    expect(directories).toContain('hyperplan')
    expect(directories).toContain('ultrawork')
  })

  it('parses EVERY vendored SKILL.md, with frontmatter name == directory name', () => {
    const scan = scanVendorSkills()
    expect(scan.failures).toEqual([])
    expect(scan.entries).toHaveLength(EXPECTED_VENDOR_SKILL_COUNT)
    for (const found of scan.entries) {
      expect(found.document.name).toBe(found.directoryName)
      expect(found.document.description.length).toBeGreaterThan(0)
      expect(found.document.content.length).toBeGreaterThan(0)
      expect(found.path).toBe(join(VENDOR_SKILLS_DIR, found.directoryName, SKILL_FILE_NAME))
    }
  })

  it('registers the skill NAMES the task book names, with the v5 rename intact', () => {
    // `ulw-execute` is upstream's renamed start-work: the catalog must show the
    // new name, and no `start-work` may appear.
    const names = scanVendorSkills().entries.map((found) => found.document.name)
    for (const expected of ['git-master', 'ulw-plan', 'ulw-execute', 'hyperplan', 'ultrawork', 'remove-ai-slops']) {
      expect(names).toContain(expected)
    }
    expect(names).not.toContain('start-work')
    // No name may carry a path prefix — the catalog is a flat, kebab-case set.
    for (const name of names) {
      expect(SKILL_NAME_PATTERN.test(name)).toBe(true)
      expect(name).not.toContain('/')
    }
  })

  it('keeps the three metadata-bearing skills and drops metadata for the rest', () => {
    const scan = scanVendorSkills()
    const withMetadata = scan.entries.filter((found) => found.document.metadata !== undefined).map((f) => f.directoryName)
    // Code-point order, as the registry sorts runtime entries: 'ult…' < 'ulw-…'
    // because 't' (0x74) precedes 'w' (0x77).
    expect(withMetadata.sort()).toEqual(['hyperplan', 'ultrawork', 'ulw-plan'])
  })
})

describe('P4-T5 the registration payload — the fields dsh actually validates', () => {
  it('sets source explicitly, because register() does not default it and get() rejects it', () => {
    // MEASURED (dsh-skill/lib/index.js:201-208, 261, 471-490): register() fills
    // `invocation` and `provider` but NOT `source`, while every `get()` runs
    // validateDefinition, which requires a string `source`. Omitting it would
    // register fine and then throw inside every `skill` tool call.
    const registration = toSkillRegistration({
      path: '/vendor/skills/git-master/SKILL.md',
      directoryName: 'git-master',
      document: { name: 'git-master', description: 'd', content: 'c' },
    })
    expect(registration.source).toBe(RUNTIME_SOURCE)
    expect(RUNTIME_SOURCE).toBe('runtime')
  })

  it('omits invocation so dsh defaults to model+user invocable (ulw-plan needs user-invocability)', () => {
    const registration = toSkillRegistration({
      path: '/vendor/skills/ulw-plan/SKILL.md',
      directoryName: 'ulw-plan',
      document: { name: 'ulw-plan', description: 'd', content: 'c' },
    })
    expect(Object.hasOwn(registration, 'invocation')).toBe(false)
    expect(Object.hasOwn(registration, 'provider')).toBe(false)
  })

  it('carries the ABSOLUTE SKILL.md path so relative references resolve on disk', () => {
    const registration = toSkillRegistration(readVendorSkillDocument(
      join(VENDOR_SKILLS_DIR, 'ultimate-browsing', SKILL_FILE_NAME),
      'ultimate-browsing',
    ))
    expect(registration.path).toBe(join(VENDOR_SKILLS_DIR, 'ultimate-browsing', SKILL_FILE_NAME))
    // The path is real: a referenced file next to it is readable, which is the
    // property the e2e probes for the model that follows a skill's instructions.
    const references = join(VENDOR_SKILLS_DIR, 'ultimate-browsing', 'references')
    expect(existsSync(references)).toBe(true)
  })

  it('forwards whenToUse / metadata only when the document carries them', () => {
    const bare = toSkillRegistration(entry('/v/a/SKILL.md', 'a', 'a'))
    expect(Object.hasOwn(bare, 'whenToUse')).toBe(false)
    expect(Object.hasOwn(bare, 'metadata')).toBe(false)
    const rich = toSkillRegistration({
      path: '/v/b/SKILL.md',
      directoryName: 'b',
      document: { name: 'b', description: 'd', content: 'c', whenToUse: 'when b', metadata: { k: 'v' } },
    })
    expect(rich.whenToUse).toBe('when b')
    expect(rich.metadata).toEqual({ k: 'v' })
  })
})

describe('P4-T5 the registration loop — loud-but-non-fatal', () => {
  it('registers every discovered skill and logs ONE summary line', () => {
    const lines: string[] = []
    const fake = fakeSkillContext()
    const scan = scanVendorSkills()
    const outcome = runSkillRegistrations(fake.ctx, scan, (line) => lines.push(line))
    expect(outcome).toEqual({ registered: 19, total: 19, failed: 0 })
    expect(fake.registered.map((row) => row.name)).toEqual(scan.entries.map((found) => found.document.name))
    // One line only: the per-skill form is reserved for failures (a boot log
    // gains 19 near-identical lines otherwise), so the summary carries the count.
    expect(lines).toEqual([
      '[omo-commands] skills: 19/19 registered (runtime, vendor path)',
    ])
  })

  it('logs a FAILED line for a skill the registry rejects, and keeps going', () => {
    const lines: string[] = []
    const fake = fakeSkillContext({ throwOn: (name) => name === 'git-master' })
    const outcome = runSkillRegistrations(
      fake.ctx,
      { entries: [entry('/v/a/SKILL.md', 'a', 'a'), entry('/v/git-master/SKILL.md', 'git-master', 'git-master'), entry('/v/c/SKILL.md', 'c', 'c')], failures: [] },
      (line) => lines.push(line),
    )
    expect(outcome).toEqual({ registered: 2, total: 3, failed: 1 })
    expect(lines).toEqual([
      '[omo-commands] skill git-master FAILED: Error: registry rejected the runtime skill',
      '[omo-commands] skills: 2/3 registered (runtime, vendor path), 1 failed',
    ])
    expect(fake.registered.map((row) => row.name)).toEqual(['a', 'c'])
  })

  it('counts a read/parse failure into the ratio and names the directory', () => {
    const lines: string[] = []
    const fake = fakeSkillContext()
    const outcome = runSkillRegistrations(
      fake.ctx,
      {
        entries: [entry('/v/a/SKILL.md', 'a', 'a')],
        failures: [{ path: '/v/broken/SKILL.md', directoryName: 'broken', error: new Error('missing YAML frontmatter') }],
      },
      (line) => lines.push(line),
    )
    // A broken file is part of what was DISCOVERED, so the ratio is 1/2 — a
    // summary reading 1/1 would hide the loss.
    expect(outcome).toEqual({ registered: 1, total: 2, failed: 1 })
    expect(lines[0]).toBe('[omo-commands] skill broken FAILED: Error: missing YAML frontmatter')
    expect(lines[1]).toBe('[omo-commands] skills: 1/2 registered (runtime, vendor path), 1 failed')
  })

  it('reports a wholly broken tree honestly (0 registered, still one summary line)', () => {
    const lines: string[] = []
    const outcome = runSkillRegistrations(
      fakeSkillContext().ctx,
      { entries: [], failures: [{ path: '/v/x/SKILL.md', directoryName: 'x', error: new Error('boom') }] },
      (line) => lines.push(line),
    )
    expect(outcome).toEqual({ registered: 0, total: 1, failed: 1 })
    expect(lines.at(-1)).toBe('[omo-commands] skills: 0/1 registered (runtime, vendor path), 1 failed')
  })

  it('adopts a returned disposer through ctx.effect, unregistering on fiber stop', () => {
    // The same forwarding contract as the command loop: RETURN the disposer, and
    // dsh's own `register` scopes itself to the calling fiber regardless.
    const fake = fakeSkillContext()
    runSkillRegistrations(
      fake.ctx,
      { entries: [entry('/v/a/SKILL.md', 'a', 'a')], failures: [] },
      () => {},
    )
    expect(fake.registered).toHaveLength(1)
    fake.stopFiber()
    expect(fake.registered).toEqual([])
  })

  it('tolerates a register() that returns nothing', () => {
    const ctx: SkillRegistrationContext = { skills: { register: () => undefined } }
    const lines: string[] = []
    expect(runSkillRegistrations(ctx, { entries: [entry('/v/a/SKILL.md', 'a', 'a')], failures: [] }, (line) => lines.push(line)))
      .toEqual({ registered: 1, total: 1, failed: 0 })
  })
})

describe('P4-T5 the scan itself is honest — duplicates and a missing tree (dual review, MAJOR)', () => {
  /** A throwaway vendor tree, so these cases never touch the real one. */
  function vendorTree(contents: { directoryName: string; name: string }[]): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'omo-skill-tree-'))
    for (const { directoryName, name } of contents) {
      mkdirSync(join(dir, directoryName))
      writeFileSync(
        join(dir, directoryName, SKILL_FILE_NAME),
        document(`name: ${name}\ndescription: the ${name} skill`),
        'utf8',
      )
    }
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
  }

  it('refuses a duplicate name instead of letting the registry swallow it silently', () => {
    // MEASURED: dsh-skill's `register` resolves a duplicate with a WARN and a
    // NO-OP disposer (lib/index.js:197-200), which at the call site is
    // indistinguishable from a real registration — so `registered` would count a
    // skill the model can never reach under that name. The collision is caught
    // here instead, and the FIRST directory (code-point order) keeps the name.
    const tree = vendorTree([
      { directoryName: 'alpha', name: 'shared-name' },
      { directoryName: 'beta', name: 'shared-name' },
      { directoryName: 'gamma', name: 'gamma' },
    ])
    try {
      const scan = scanVendorSkills(tree.dir)
      expect(scan.entries.map((found) => found.directoryName)).toEqual(['alpha', 'gamma'])
      expect(scan.failures).toHaveLength(1)
      expect(scan.failures[0]?.directoryName).toBe('beta')
      // The message PREFIXES the offending file path (VendorSkillError's contract),
      // so the reason is asserted on its own and the path on its own.
      const message = String((scan.failures[0]?.error as VendorSkillError).message)
      expect(message).toContain(`${join(tree.dir, 'beta', SKILL_FILE_NAME)}: duplicate skill name "shared-name"`)
      expect(message).toContain('directory "alpha" already provides it, and the registry keeps the first (lib/index.js:197-200)')
    } finally {
      tree.cleanup()
    }
  })

  it('reports a duplicate through the honest marker (1/2 registered, 1 failed)', () => {
    const tree = vendorTree([
      { directoryName: 'alpha', name: 'shared-name' },
      { directoryName: 'beta', name: 'shared-name' },
    ])
    try {
      const lines: string[] = []
      const fake = fakeSkillContext()
      const outcome = runSkillRegistrations(fake.ctx, scanVendorSkills(tree.dir), (line) => lines.push(line))
      expect(outcome).toEqual({ registered: 1, total: 2, failed: 1 })
      expect(fake.registered.map((row) => row.name)).toEqual(['shared-name'])
      // The per-skill FAILED form must name the offending FILE as well as the
      // reason — a boot log that says only "duplicate" sends the reader hunting.
      expect(lines[0]).toBe(
        `[omo-commands] skill beta FAILED: VendorSkillError: skill file ${join(tree.dir, 'beta', SKILL_FILE_NAME)}: `
        + 'duplicate skill name "shared-name" — directory "alpha" already provides it, and the registry keeps the first (lib/index.js:197-200)',
      )
      expect(lines[1]).toBe('[omo-commands] skills: 1/2 registered (runtime, vendor path), 1 failed')
    } finally {
      tree.cleanup()
    }
  })

  it('survives a vendor tree it cannot list, with ONE scan-FAILED line and an empty scan', () => {
    // Unprotected, `readdirSync` would throw out of apply() and — command
    // registration sharing the fiber — roll the command markers back too. The
    // tree-level form is deliberately NOT the per-skill one: no skill was
    // discovered, so naming one would be a lie.
    const lines: string[] = []
    const missing = join(tmpdir(), 'omo-skill-tree-does-not-exist')
    const scan = scanVendorSkills(missing, (line) => lines.push(line))
    expect(scan).toEqual({ entries: [], failures: [] })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe(
      `[omo-commands] skills scan FAILED: Error: ENOENT: no such file or directory, scandir '${missing}' — 0 skills discovered under ${missing}`,
    )
  })

  it('still logs the summary after a failed scan (0/0 is the honest ratio)', () => {
    const lines: string[] = []
    const missing = join(tmpdir(), 'omo-skill-tree-does-not-exist')
    const outcome = runSkillRegistrations(
      fakeSkillContext().ctx,
      scanVendorSkills(missing, (line) => lines.push(line)),
      (line) => lines.push(line),
    )
    expect(outcome).toEqual({ registered: 0, total: 0, failed: 0 })
    expect(lines[1]).toBe('[omo-commands] skills: 0/0 registered (runtime, vendor path)')
  })

  it('does not throw for a missing tree when no logger is passed (pure call sites)', () => {
    // The probe's derivation and the unit tests call the scan without a logger;
    // they must get an empty scan, not an exception.
    const missing = join(tmpdir(), 'omo-skill-tree-does-not-exist')
    expect(scanVendorSkills(missing)).toEqual({ entries: [], failures: [] })
  })
})

describe('P4-T5 the SKILL_NAME_PATTERN is dsh\'s own grammar, not a paraphrase', () => {
  // Re-declared in skills.ts because the plugin may not depend on dsh; the
  // installed source it mirrors is
  //   node_modules/@deepseek-ai/dsh-skill/lib/index.js:17
  //     const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  // (cited, not read: a unit test that opens the installed dsh's internals would
  // fail on any machine without that install, and the repo's convention is
  // measured provenance in comments — see tests/omo-hooks/registration.test.ts).
  // What is pinned here is the BEHAVIOUR table, so a careless edit to the
  // re-declared pattern fails even if dsh later changes.
  it('accepts exactly the kebab-case names dsh accepts', () => {
    for (const accepted of ['git-master', 'ulw-execute', 'ast-grep', 'lsp-setup', 'coding-agent-sessions', 'a', 'a1-b2']) {
      expect(SKILL_NAME_PATTERN.test(accepted)).toBe(true)
    }
  })

  it('rejects the shapes dsh rejects — including the `shared/` prefix a nested layout would produce', () => {
    for (const rejected of [
      'Git-Master',
      'git_master',
      'shared/git-master',
      '-git',
      'git-',
      'git--master',
      'git master',
      '',
    ]) {
      expect(SKILL_NAME_PATTERN.test(rejected)).toBe(false)
    }
  })

  it('accepts every name the real vendor tree declares', () => {
    for (const found of scanVendorSkills().entries) {
      expect(SKILL_NAME_PATTERN.test(found.document.name)).toBe(true)
    }
  })
})

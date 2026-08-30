// tests/omo-agents/verify-licenses.test.ts — unit coverage for the license
// gate (scripts/verify-licenses.mjs): the R2-1 SPDX AND/OR precedence fix in
// exprAllowed, the R2-4 tightened SUL-1.0 name matcher, and the R2-3 --json
// skipped-fields payload (reportPayload). The .mjs exports its pure functions
// and is guarded by an import.meta.url main check, so importing it here runs
// no scan.
import { describe, expect, it } from 'vitest'
import {
  exprAllowed,
  reportPayload,
  SUL_ALLOWED_NAME,
  tokenAllowed,
} from '../../scripts/verify-licenses.mjs'

describe('exprAllowed — SPDX precedence: AND binds tighter than OR (R2-1)', () => {
  it('rejects (MIT OR Apache-2.0) AND GPL-2.0 — the bypass shape', () => {
    expect(exprAllowed('(MIT OR Apache-2.0) AND GPL-2.0', 'fixture')).toBe(false)
  })

  it('accepts a bare OR group (MIT OR Apache-2.0)', () => {
    expect(exprAllowed('(MIT OR Apache-2.0)', 'fixture')).toBe(true)
  })

  it('rejects MIT AND GPL-2.0 (every AND-group must hold)', () => {
    expect(exprAllowed('MIT AND GPL-2.0', 'fixture')).toBe(false)
  })

  it('accepts Apache-2.0 AND MIT', () => {
    expect(exprAllowed('Apache-2.0 AND MIT', 'fixture')).toBe(true)
  })

  it('accepts (MIT OR GPL-2.0) AND (Apache-2.0 OR BSD-3-Clause)', () => {
    expect(exprAllowed('(MIT OR GPL-2.0) AND (Apache-2.0 OR BSD-3-Clause)', 'fixture')).toBe(true)
  })

  it('rejects a lone GPL-2.0', () => {
    expect(exprAllowed('GPL-2.0', 'fixture')).toBe(false)
  })

  it('accepts a lone MIT', () => {
    expect(exprAllowed('MIT', 'fixture')).toBe(true)
  })
})

describe('tokenAllowed', () => {
  it('strips surrounding parens before lookup', () => {
    expect(tokenAllowed('(MIT)', 'fixture')).toBe(true)
    expect(tokenAllowed('(GPL-2.0)', 'fixture')).toBe(false)
  })

  it('gates SUL-1.0 on the whole-word omo name matcher', () => {
    expect(tokenAllowed('SUL-1.0', 'omo-goal')).toBe(true)
    expect(tokenAllowed('SUL-1.0', 'oh-my-openagent')).toBe(true)
    expect(tokenAllowed('SUL-1.0', 'comodo')).toBe(false)
  })
})

describe('SUL_ALLOWED_NAME (R2-4: whole-word omo)', () => {
  it.each([
    ['oh-my-openagent', true],
    ['@omo/goal', true],
    ['omo-goal', true],
    ['x.omo', true],
    ['comodo', false],
    ['promo', false],
    ['omocha', false],
  ])('%s -> %s', (name, expected) => {
    expect(SUL_ALLOWED_NAME.test(name)).toBe(expected)
  })
})

describe('reportPayload (R2-3: --json skipped fields)', () => {
  it('reports skipped count and sorted skipped names', () => {
    const payload = reportPayload({
      checked: 3,
      violations: [],
      skippedKeys: ['b@2.0.0', 'a@1.0.0'],
    })
    expect(payload.pass).toBe(true)
    expect(payload.checked).toBe(3)
    expect(payload.skipped).toBe(2)
    expect(payload.skippedNames).toEqual(['a@1.0.0', 'b@2.0.0'])
  })

  it('fails the payload when violations exist', () => {
    const payload = reportPayload({
      checked: 1,
      violations: ['gpl-pkg@1.0.0: GPL-2.0'],
      skippedKeys: [],
    })
    expect(payload.pass).toBe(false)
    expect(payload.skipped).toBe(0)
    expect(payload.skippedNames).toEqual([])
  })
})

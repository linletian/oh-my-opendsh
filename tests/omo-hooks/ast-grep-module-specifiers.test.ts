import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { collectModuleSpecifiers } from '../../scripts/ast-grep-module-specifiers.mjs'

describe('ast-grep module-specifier scanner', () => {
  it('reads real static/re-export/side-effect/dynamic imports and ignores comments and strings', () => {
    const source = `
      // from "../ast-grep/comment-only.ts"
      const prose = 'import "../ast-grep/string-only.ts"'
      import/* side-effect */"../ast-grep/sg-resolver.ts"
      import { x } from/* named */"../ast-grep/sg-manifest.ts"
      export * from '../ast-grep/index.ts'
      await import(/* dynamic */"../ast-grep/types.ts")
    `

    const fixtureDir = mkdtempSync(join(tmpdir(), 'omo-module-specifiers-'))
    const fixturePath = join(fixtureDir, 'fixture.ts')
    writeFileSync(fixturePath, source)
    try {
      expect(collectModuleSpecifiers(fixturePath)).toEqual({
        staticSpecifiers: [
          '../ast-grep/sg-resolver.ts',
          '../ast-grep/sg-manifest.ts',
          '../ast-grep/index.ts',
        ],
        moduleSpecifiers: [
          '../ast-grep/sg-resolver.ts',
          '../ast-grep/sg-manifest.ts',
          '../ast-grep/index.ts',
          '../ast-grep/types.ts',
        ],
      })
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})

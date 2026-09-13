// system-sections.ts — T7 loader for the markdown policy sections shipped
// next to the plugin source. Resolves the directory from this module's own
// location via import.meta.url (never from process.cwd()), so resolution is
// stable under the dsh boot environment (P-9).
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of the system-sections/ markdown directory. */
export const SYSTEM_SECTIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'system-sections',
)

export interface SystemSections {
  role: string
  delegationDiscipline: string
  /**
   * P2-T14: the conductor's static delegation roster (one row per delegation
   * target). Sits AFTER `delegationDiscipline` in SISYPHUS_SECTION_ORDER — the
   * discipline states the policy, the roster names the targets it applies to.
   * It is a conductor-only section: like `role` / `delegationDiscipline` it is
   * NOT injected into sub-agents by hard-blocks-injection.ts, and it must not
   * carry the runtime-injected headings (test-enforced).
   */
  delegationRoster: string
  hardBlocks: string
  antiPatterns: string
}

/** Reads one section file; a missing file throws an error naming the absolute path. */
export function loadSectionFile(dir: string, fileName: string): string {
  const absolutePath = join(dir, fileName)
  try {
    return readFileSync(absolutePath, 'utf8')
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`Failed to read system section "${fileName}" at ${absolutePath}: ${reason}`)
  }
}

/** Loads all five sections in the fixed order [role, delegationDiscipline, delegationRoster, hardBlocks, antiPatterns]. */
export function loadSystemSections(dir: string = SYSTEM_SECTIONS_DIR): SystemSections {
  return {
    role: loadSectionFile(dir, 'role.md'),
    delegationDiscipline: loadSectionFile(dir, 'delegation-discipline.md'),
    delegationRoster: loadSectionFile(dir, 'delegation-roster.md'),
    hardBlocks: loadSectionFile(dir, 'hard-blocks.md'),
    antiPatterns: loadSectionFile(dir, 'anti-patterns.md'),
  }
}

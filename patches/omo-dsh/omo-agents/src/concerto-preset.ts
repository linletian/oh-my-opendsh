// concerto-preset.ts — T6 apply-time authoring for the 协奏 / Concerto Mode
// preset (FR-2, AC-2). The plugin ships the real preset directory beside its
// source (`../concerto/`, resolved from this module's own import.meta.url —
// the same discipline as system-sections.ts, P-9) and materializes it into
// `$DSH_HOME/.agent-presets/concerto/`, the user root that dsh-agent-presets
// auto-appends (includeUserRoot defaults to true; discovery is unmemoized, so
// a fresh listing sees the preset immediately). Files are the only
// composition editor, so direct authoring of the directory is legitimate —
// and necessary: mechanism (a), a config-override adding our repo dir to the
// agent-presets row's `roots`, is dead on rc.6 because composeProfile
// force-patches `roots` back to the shipped system root after all user
// overlays (profile-boot; evidence: .omo/evidence/task-6-mvp-implementation.log
// and docs/mvp-pitfalls.md P-1.3).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The preset's roster id, which is also its directory name. */
export const CONCERTO_PRESET_ID = 'concerto'

/** The two files dsh-agent-presets reads per preset directory. */
export const CONCERTO_PRESET_FILES = ['preset.yml', 'agent.cordis.yml'] as const

/** Absolute path of the repo-shipped concerto template directory. */
export const CONCERTO_TEMPLATE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'concerto',
)

/**
 * Mirrors @deepseek-ai/dsh-home-paths' resolveDshHome (read-only inspection of
 * the installed rc.6): a non-empty `$DSH_HOME` wins, else `<osHome>/.dsh`.
 * Reimplemented in five lines so this plugin keeps zero runtime dependencies.
 */
export function resolveDshHome(
  env: { DSH_HOME?: string | undefined } = process.env,
  osHome: string = homedir(),
): string {
  const fromEnv = env.DSH_HOME
  return resolve(fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(osHome, '.dsh'))
}

/** The user-root directory this preset materializes into. */
export function concertoPresetDir(
  env: { DSH_HOME?: string | undefined } = process.env,
  osHome: string = homedir(),
): string {
  return join(resolveDshHome(env, osHome), '.agent-presets', CONCERTO_PRESET_ID)
}

export type ConcertoSyncOutcome =
  | 'materialized' // target did not exist; the preset was written
  | 'refreshed' // target existed with different content; rewritten to the template
  | 'unchanged' // target content already matches the template; no write

/**
 * Writes the template into `targetDir`, idempotently: content-identical
 * targets are left untouched, divergent targets (e.g. a leftover from an
 * older plugin build) are rewritten to the template. A `concerto` directory
 * occupied by foreign content is still refreshed — the id is ours: this
 * plugin is the only author of the concerto mode.
 */
export function syncConcertoPreset(
  targetDir: string,
  templateDir: string = CONCERTO_TEMPLATE_DIR,
): ConcertoSyncOutcome {
  const existed = existsSync(targetDir)
  let identical = existed
  for (const file of CONCERTO_PRESET_FILES) {
    const expected = readFileSync(join(templateDir, file), 'utf8')
    let actual: string | undefined
    try {
      actual = readFileSync(join(targetDir, file), 'utf8')
    } catch {
      actual = undefined
    }
    if (actual !== expected) identical = false
  }
  if (identical) return 'unchanged'
  mkdirSync(targetDir, { recursive: true })
  for (const file of CONCERTO_PRESET_FILES) {
    writeFileSync(join(targetDir, file), readFileSync(join(templateDir, file), 'utf8'), {
      encoding: 'utf8',
      mode: 0o600,
    })
  }
  return existed ? 'refreshed' : 'materialized'
}

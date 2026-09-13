# Phase 2 roster snapshot (P2-T17 · exit criterion b)

> GENERATED — do not hand-edit. Every cell is computed from the single
> sources: `patches/omo-dsh/omo-agents/src/roster.ts` (rows, classes,
> allowTools, maxDepth, writeCapable, env pairs), its
> `denyToolNamesFor` / `allowToolNamesFor` computations, and
> `src/model-routes.ts` resolved with an EMPTY env (the documented defaults).
> The test `tests/omo-agents/roster-composition.test.ts` reads this file and
> asserts it byte-equals `renderRosterSnapshot()`; no code path rewrites it.
> Regenerate:
>
> ```
> node --experimental-strip-types -e "import('./tests/omo-agents/roster-snapshot.ts').then(m => process.stdout.write(m.renderRosterSnapshot()))" > tests/omo-agents/__snapshots__/roster.md
> ```

Rows: 11 = 1 conductor + 10 delegation · read-only 6 · worker 2 · orchestrator 1 · allowlist 1
Delegation toolNames (roster order): explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus

| # | agent | delegation | class | maxDepth | writeCapable | default route | resolved route (empty env) | env override pair | toolFilter |
|---|-------|------------|-------|----------|--------------|---------------|---------------------------|-------------------|------------|
| 1 | `sisyphus` | no (conductor) | — | — | true | deepseek-official/deepseek-v4-pro | deepseek-official/deepseek-v4-pro | OMO_SISYPHUS_PROVIDER / OMO_SISYPHUS_MODEL | — |
| 2 | `explore` | yes | read-only | 1 | false | deepseek/deepseek-v4-flash | deepseek/deepseek-v4-flash | OMO_EXPLORE_PROVIDER / OMO_EXPLORE_MODEL | deny 12 [write, edit, explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |
| 3 | `hephaestus` | yes | worker | 1 | true | deepseek-official/deepseek-v4-pro | deepseek-official/deepseek-v4-pro | OMO_HEPHAESTUS_PROVIDER / OMO_HEPHAESTUS_MODEL | deny 10 [explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |
| 4 | `oracle` | yes | read-only | 1 | false | deepseek-official/deepseek-v4-pro | deepseek-official/deepseek-v4-pro | OMO_ORACLE_PROVIDER / OMO_ORACLE_MODEL | deny 12 [write, edit, explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |
| 5 | `librarian` | yes | read-only | 1 | false | deepseek/deepseek-v4-flash | deepseek/deepseek-v4-flash | OMO_LIBRARIAN_PROVIDER / OMO_LIBRARIAN_MODEL | deny 12 [write, edit, explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |
| 6 | `plan-consultant` | yes | read-only | 1 | false | deepseek-official/deepseek-v4-pro | deepseek-official/deepseek-v4-pro | OMO_PLAN_CONSULTANT_PROVIDER / OMO_PLAN_CONSULTANT_MODEL | deny 12 [write, edit, explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |
| 7 | `plan-reviewer` | yes | read-only | 1 | false | deepseek-official/deepseek-v4-pro | deepseek-official/deepseek-v4-pro | OMO_PLAN_REVIEWER_PROVIDER / OMO_PLAN_REVIEWER_MODEL | deny 12 [write, edit, explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |
| 8 | `atlas` | yes | orchestrator | 2 | true | deepseek-official/deepseek-v4-pro | deepseek-official/deepseek-v4-pro | OMO_ATLAS_PROVIDER / OMO_ATLAS_MODEL | none (no toolFilter key) |
| 9 | `multimodal-looker` | yes | allowlist | 1 | false | deepseek-official/deepseek-v4-flash-vision-exp | deepseek-official/deepseek-v4-flash-vision-exp | OMO_MULTIMODAL_LOOKER_PROVIDER / OMO_MULTIMODAL_LOOKER_MODEL | allow 2 [read, read_image] |
| 10 | `sisyphus-junior` | yes | worker | 1 | true | deepseek/deepseek-v4-flash | deepseek/deepseek-v4-flash | OMO_SISYPHUS_JUNIOR_PROVIDER / OMO_SISYPHUS_JUNIOR_MODEL | deny 10 [explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |
| 11 | `prometheus` | yes | read-only | 1 | false | deepseek-official/deepseek-v4-pro | deepseek-official/deepseek-v4-pro | OMO_PROMETHEUS_PROVIDER / OMO_PROMETHEUS_MODEL | deny 12 [write, edit, explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus] |


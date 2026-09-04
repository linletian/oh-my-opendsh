// T14 — dual model route config module (FR-5, P-2; AC-5 config half).
// Asserts the two agents resolve to DIFFERENT {provider,model} pairs from
// the config source, and that missing/invalid config fails LOUD.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_ROUTES,
  MODEL_ROUTE_ENV_VARS,
  ModelRouteConfigError,
  resolveModelRoutes,
} from '../../patches/omo-dsh/omo-agents/src/model-routes'

describe('omo-agents model routes (T14)', () => {
  it('resolves the documented defaults when no env vars are set', () => {
    const routes = resolveModelRoutes({})
    expect(routes).toEqual({
      sisyphus: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      explore: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    })
    // The exported defaults are exactly what an empty env resolves to.
    expect(routes).toEqual(DEFAULT_MODEL_ROUTES)
  })

  it('resolves two DIFFERENT {provider,model} pairs by default (AC-5 precheck)', () => {
    const { sisyphus, explore } = resolveModelRoutes({})
    expect(sisyphus.provider).not.toBe(explore.provider)
    expect(sisyphus.model).not.toBe(explore.model)
  })

  it('honors env overrides for all four fields', () => {
    const routes = resolveModelRoutes({
      OMO_SISYPHUS_PROVIDER: 'deepseek-official',
      OMO_SISYPHUS_MODEL: 'deepseek-v4-flash',
      OMO_EXPLORE_PROVIDER: 'openai',
      OMO_EXPLORE_MODEL: 'gpt-5.6-luna-fast',
    })
    expect(routes).toEqual({
      sisyphus: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      explore: { provider: 'openai', model: 'gpt-5.6-luna-fast' },
    })
  })

  it('trims whitespace-padded overrides instead of rejecting them', () => {
    const routes = resolveModelRoutes({
      OMO_SISYPHUS_MODEL: '  deepseek-v4-pro  ',
      OMO_EXPLORE_MODEL: '\tdeepseek-v4-flash\n',
    })
    expect(routes.sisyphus.model).toBe('deepseek-v4-pro')
    expect(routes.explore.model).toBe('deepseek-v4-flash')
  })

  it('fails LOUD on a set-but-blank override, naming the offending variable', () => {
    for (const envVar of Object.values(MODEL_ROUTE_ENV_VARS)) {
      expect(() => resolveModelRoutes({ [envVar]: '   ' }))
        .toThrowError(ModelRouteConfigError)
      expect(() => resolveModelRoutes({ [envVar]: '   ' }))
        .toThrowError(new RegExp(envVar))
    }
  })

  it('AC-5 precheck: identical routes for both agents fail LOUD', () => {
    expect(() => resolveModelRoutes({
      OMO_SISYPHUS_PROVIDER: 'deepseek-official',
      OMO_SISYPHUS_MODEL: 'deepseek-v4-flash',
      OMO_EXPLORE_PROVIDER: 'deepseek-official',
      OMO_EXPLORE_MODEL: 'deepseek-v4-flash',
    })).toThrowError(ModelRouteConfigError)
    expect(() => resolveModelRoutes({
      OMO_SISYPHUS_PROVIDER: 'deepseek-official',
      OMO_SISYPHUS_MODEL: 'deepseek-v4-flash',
      OMO_EXPLORE_PROVIDER: 'deepseek-official',
      OMO_EXPLORE_MODEL: 'deepseek-v4-flash',
    })).toThrowError(/AC-5 precheck failed: sisyphus and explore resolve to the SAME route deepseek-official\/deepseek-v4-flash/)
  })

  it('same provider with DIFFERENT models is a legal dual route (pair-level distinctness)', () => {
    const routes = resolveModelRoutes({
      OMO_SISYPHUS_PROVIDER: 'deepseek-official',
      OMO_SISYPHUS_MODEL: 'deepseek-v4-pro',
      OMO_EXPLORE_PROVIDER: 'deepseek-official',
      OMO_EXPLORE_MODEL: 'deepseek-v4-flash',
    })
    expect(routes.sisyphus.model).toBe('deepseek-v4-pro')
    expect(routes.explore.model).toBe('deepseek-v4-flash')
  })

  it('documents one override env var per route field', () => {
    expect(MODEL_ROUTE_ENV_VARS).toEqual({
      sisyphusProvider: 'OMO_SISYPHUS_PROVIDER',
      sisyphusModel: 'OMO_SISYPHUS_MODEL',
      exploreProvider: 'OMO_EXPLORE_PROVIDER',
      exploreModel: 'OMO_EXPLORE_MODEL',
    })
  })
})

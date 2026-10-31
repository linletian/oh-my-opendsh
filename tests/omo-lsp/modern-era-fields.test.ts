// tests/omo-lsp/modern-era-fields.test.ts — P6-T4 pinning unit for the
// modern-era deviation in the vendored lsp-core MCP server (the ruled
// deviation, .omo/evidence/p6t1/FORKS.md §2.6 ⑤).
//
// What this pins, and why each is a real failure mode:
//
//   1. legacy shape preserved — a client that never speaks modern must still
//      get the upstream-verbatim shapes (`tools/list` without the trio,
//      `ping` → `{}`). The deviation is additive; a regression here is the
//      server silently changing shape for old clients.
//   2. server/discover — the modern advertisement. This is THE frame whose
//      absence made the dsh-mcp-client SDK downgrade to legacy
//      (.omo/evidence/p6t1/mcp-client-probe/RESULTS.md §1: a stdio probe
//      that answers -32601 to `server/discover` lands in LEGACY forever).
//      Shape is the codec's DiscoverResultSchema: supportedVersions +
//      capabilities required; the cache trio carries the honest no-cache
//      values (ttlMs 0 / private — the SDK's own defaults).
//   3. era tracking, both faces — the SIBLING face (this process sees
//      `server/discover`) and the SESSION face (the SDK never re-probes
//      `server/discover` in the session process; it stamps `_meta` onto
//      every request once modern, so the `_meta` envelope is the signal).
//      Without the session face, tools/list results in the session process
//      lack `resultType` and rev2026Codec.decodeResult rejects them as
//      "missing required resultType" — the exact silent-downgrade the
//      ruling forbids.
//   4. initialize echo semantics — upstream verbatim: answer with the
//      requested version. Pin both directions (modern echo flips the era,
//      an old echo does not).
//
// The wire-level codec truth stays elsewhere on purpose: the live
// SDK-era evidence is .omo/evidence/p6t4/face-probe/ (real dsh-mcp-client
// against this server); importing the installed SDK schema into the repo
// test suite would make gate 2 depend on the global dsh install tree.
import { describe, expect, it } from 'vitest'

import {
  createLspMcpEraState,
  handleLspMcpRequest,
} from '../../patches/omo-dsh/vendor/lsp-core/src/mcp.ts'

const MODERN = '2026-07-28'
const ENVELOPE = {
  _meta: {
    'io.modelcontextprotocol/protocolVersion': MODERN,
    'io.modelcontextprotocol/clientCapabilities': {},
  },
}

const send = (method: string, params?: Record<string, unknown>, era = createLspMcpEraState()) =>
  handleLspMcpRequest({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }, { era })

describe('P6-T4 vendored lsp-core: legacy shapes preserved (deviation is additive)', () => {
  it('tools/list without any modern signal carries NO resultType/ttlMs/cacheScope', async () => {
    const result = (await send('tools/list'))!.result as Record<string, unknown>
    expect(Array.isArray(result.tools)).toBe(true)
    expect(result).not.toHaveProperty('resultType')
    expect(result).not.toHaveProperty('ttlMs')
    expect(result).not.toHaveProperty('cacheScope')
  })

  it('ping stays the upstream-verbatim empty result when no era is threaded', async () => {
    const response = await handleLspMcpRequest({ jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(response!.result).toEqual({})
  })

  it('unknown methods still answer -32601 (the codec reads that as legacy, honestly)', async () => {
    const response = await send('nonexistent/method')
    expect(response!.error?.code).toBe(-32601)
  })
})

describe('P6-T4 vendored lsp-core: server/discover is answered, not rejected', () => {
  it('the modern advertisement matches the codec DiscoverResultSchema shape', async () => {
    const result = (await send('server/discover', ENVELOPE))!.result as Record<string, unknown>
    expect(result.supportedVersions).toEqual([MODERN])
    expect(result.capabilities).toEqual({ tools: { listChanged: false } })
    expect(result.resultType).toBe('complete')
    expect(result.ttlMs).toBe(0)
    expect(result.cacheScope).toBe('private')
    const meta = result._meta as Record<string, Record<string, unknown>>
    expect(meta['io.modelcontextprotocol/serverInfo'].name).toBe('lsp')
  })

  it('answering server/discover flips the era, and every later result modernizes', async () => {
    const era = createLspMcpEraState()
    await send('server/discover', ENVELOPE, era)
    expect(era.modern).toBe(true)
    const toolsList = (await send('tools/list', undefined, era))!.result as Record<string, unknown>
    expect(toolsList.resultType).toBe('complete')
    expect(toolsList.ttlMs).toBe(0)
    expect(toolsList.cacheScope).toBe('private')
    const ping = (await send('ping', undefined, era))!.result
    expect(ping).toEqual({ resultType: 'complete' })
  })
})

describe('P6-T4 vendored lsp-core: era tracking on the session face', () => {
  it('a _meta-stamped tools/list (session process never saw server/discover) still answers modern', async () => {
    const era = createLspMcpEraState()
    const result = (await send('tools/list', ENVELOPE, era))!.result as Record<string, unknown>
    expect(era.modern).toBe(true)
    expect(result.resultType).toBe('complete')
    expect(result.ttlMs).toBe(0)
    expect(result.cacheScope).toBe('private')
  })

  it('tools/call stamps resultType once modern (rev2026Codec rejects lists missing it)', async () => {
    const era = createLspMcpEraState()
    await send('server/discover', ENVELOPE, era)
    const result = (await send('tools/call', { name: 'status', arguments: {}, ...ENVELOPE }, era))!.result as Record<string, unknown>
    expect(result.resultType).toBe('complete')
    expect(Array.isArray(result.content)).toBe(true)
  })

  it('tools/call on the legacy path stays without resultType (additive, not retroactive)', async () => {
    const result = (await handleLspMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'status', arguments: {} } }))!.result as Record<string, unknown>
    expect(result).not.toHaveProperty('resultType')
    expect(Array.isArray(result.content)).toBe(true)
  })
})

describe('P6-T4 vendored lsp-core: initialize echo semantics kept verbatim', () => {
  it('echoes the requested protocol version, modern flips the era', async () => {
    const era = createLspMcpEraState()
    const result = (await send('initialize', {
      protocolVersion: MODERN,
      capabilities: {},
      clientInfo: { name: 'pin-test', version: '0' },
    }, era))!.result as Record<string, unknown>
    expect(result.protocolVersion).toBe(MODERN)
    expect(era.modern).toBe(true)
  })

  it('echoes an older protocol version and the era stays legacy', async () => {
    const era = createLspMcpEraState()
    const result = (await send('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'pin-test', version: '0' },
    }, era))!.result as Record<string, unknown>
    expect(result.protocolVersion).toBe('2025-03-26')
    expect(era.modern).toBe(false)
    const toolsList = (await send('tools/list', undefined, era))!.result as Record<string, unknown>
    expect(toolsList).not.toHaveProperty('resultType')
  })
})

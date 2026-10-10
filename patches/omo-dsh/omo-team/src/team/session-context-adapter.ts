// session-context-adapter.ts — P5-T8b · TeamSessionContext 适配器（DSH 原生，无上游对应物）。
//
// ── 边界（任务书钉死：OMO 形 session client → DSH ctx.agents/catalog 面映射）──
// vendored team-core 的 resume 族（session-liveness.ts:16 逐字
// `ctx.client.session.get({ path: { id } })`）说的是 **OMO 的 opencode-sdk 形
// HTTP client 话术**——`{ path: { id } }` 入参、`{ data?, error? }` 回包、404/
// 'not found' 判缺席（error-normalization.ts:17-22 的判定面）。DSH 宿主没有这
// 台 HTTP server，但有**同一事实的活体注册表**：`ctx.agents.get(id)`
// （dsh-agent types/index.d.ts:343 `get(id: SessionId): Agent | undefined`，
// T6 已在 team-message.ts 的同一面上执法）。本适配器就是这两句话之间的翻译官：
//
//   OMO 形                              DSH 形
//   client.session.get({path:{id}}) →  ctx.agents.get(id)
//   { data: <session> }               ←  注册表命中（活体在场）
//   { error: 404 'not found' }       ←  注册表 undefined（缺席）
//
// 语义等价的窄面在此成文：
//   * **命中 = 活体在场**。OMO 的 session.get 查的是 server 的会话账；DSH 侧
//     resume 关心的是「这个 sessionId 的 Agent 还活不活」（active-resume.ts 拿
//     它做 orphan 判定），活体注册表正是同一事实的宿主载体——命中即在场，
//     undefined 即缺席。缺席回包必须走 error 臂且**可被 isSessionNotFoundError
//     判真**（status 404 + message 含 'not found'，双保险逐字对齐上游判定）；
//   * **不伪造 catalog**：不实现 `session.messages`（optional 成员，resume 族
//     零调用点，grep vendored 树：0 处消费）——缺就缺，不造第二事实源；
//   * 每次调用现读注册表，不缓存 Agent 引用（T6 的同一驻留纪律）。

import type { TeamSessionClient, TeamSessionContext } from '@oh-my-opencode/team-core/session-client'

import type { TeamLiveAgents } from '../tools/team-message.ts'

/** 缺席回包的错误形状（isSessionNotFoundError 的 404 + 'not found' 双判据齐载）。 */
function sessionNotFound(id: string): { status: number; name: string; message: string } {
  return { status: 404, name: 'NotFoundError', message: `session not found: ${id}` }
}

/**
 * 把 DSH 活体注册表包成 OMO 形 TeamSessionContext。resumeAllTeams 吃的就是
 * 这个对象（resume.ts:16-19 的 ctx 臂）；除 session.get 外不承诺任何面。
 */
export function buildTeamSessionContext(agents: TeamLiveAgents): TeamSessionContext {
  const client: TeamSessionClient = {
    session: {
      async get(input: { readonly path: { readonly id: string } }) {
        const agent = agents.get(input.path.id)
        if (agent !== undefined) return { data: agent }
        return { error: sessionNotFound(input.path.id) }
      },
    },
  }
  return { client }
}

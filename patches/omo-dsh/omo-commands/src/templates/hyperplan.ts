// P4-T14 — `/hyperplan` 的模板常量（**降级形态**语义移植）。
// P5-T13 — 升级为**双形态**：完整对抗评审环（team 工具在场）+ 降级环（缺席）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/templates/hyperplan.ts
//     export const HYPERPLAN_TEMPLATE = `You are running the \`/hyperplan\` command …`
//     —— 全文 17 行（实测）。**T13 起完整对齐**：首行 purpose、skill 加载段、
//     roster 契约段（本部署词表适配）、<user-request> 段逐字/对位承载；上游末行
//     的 `team_mode.enabled` 兜底句仍不进模型可见面（死链，见 carrier note 3）。
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:109-115 — the
//     command ENTRY: description (:110) + the `<command-instruction>` wrapper
//     (:111-113) + `argumentHint: "[planning-request]"` (:114)。
//     两基线实测一致（2026-10-12 双评审+仲裁亲核）：条目 = :109 `hyperplan: {` … :115 `},`，
//     冻结 tag v4.19.4（b072d279）与工作树该区间逐字节同（sha1 同值），无漂移。
//     T13 评审 NIT 修复轮曾因猜疑漂移改过符号名引用，实测证伪，故行号引用恢复
//     （其 description / wrapper / argumentHint 的逐字引用始终未受影响）。
//   packages/omo-senpi/skills/hyperplan/SKILL.md — the 7-phase body the template
//     tells the model to LOAD (vendored verbatim at
//     patches/omo-dsh/vendor/shared-skills/skills/hyperplan/SKILL.md, 460 lines,
//     registered into the catalog by T5)。
//
// ═══ 本移植的形态：**双形态（P5-T13）** ═══
//
// 上游的 hyperplan 是一条建立在 **team-mode** 上的命令：`team_create` 拉起 5 个
// category 成员（`unspecified-low` / `unspecified-high` / `ultrabrain` / `artistry`
// / 可选 `deep`）互相对抗评审。P4 时本部署**没有 team-mode 面**，于是 P4-T14 交付
// 降级形态；P5 的 omo-team 挂载后，完整环在本部署**有条件成立**——条件 =
// **team 工具在场探测**（omo-team 的 `omoTeamHyperplanTeamFace` 服务，调用时刻
// 惰性 `ctx.get`，绝不 apply 期缓存）。两形态：
//
//   - **在场（FULL）**：roster 契约段按本部署 live 词表重写（category 两臂
//     quick/deep、worker 席入队、只读席队外委派），完整对抗评审环语义对齐
//     上游（含上游的 retry-without-that-member 规则与 reviewer-not-a-member
//     原则）；N1（无 failed 态）注记随正文进模型可见面。
//   - **缺席（DEGRADED）**：P4-T14 的降级三件套原样保留（roster 契约段 +
//     降级指引段 + 降级 description 后缀），**降级路径不许因升级死掉**
//     （T13 判定；反向覆盖 = 单测探测缺席腿）。
//
// 老约束不变：**零硬编码死链**——上游四个 category 名（unspecified-low /
// unspecified-high / ultrabrain / artistry）在本部署**两形态都是死链**
// （UNRESOLVABLE_CATEGORY 拒），只活在 carrier note 里；live 词表（quick /
// deep）由在场脸派生、单测对账，不第二份转抄。
//
// ═══ 上游自身的两处不一致，如实登记（移植时必须记录）═══
//
//   (A) **配置文件路径两出处不一致**（C 组实测）：
//       · 模板 hyperplan.ts 末行：\`~/.omo/omo.jsonc\`
//       · prompts/mode/hyperplan.md 末行：\`~/.config/opencode/oh-my-opencode.jsonc\`
//       同一句指引在冻结基线里指向**两个不同路径**。本移植**不复现任何一条**
//       （两个路径在 DSH 都不存在），改写为 Phase 5 预告 + 当前可用的降级路径，
//       并把这条不一致记在这里，避免下游把它当成笔误"顺手统一"成一个 —— 那会
//       把上游的不确定性伪装成本仓的权威结论。
//
//   (B) **上游自称 "7-phase"，而 SKILL 实为 8 段标题**（`Phase 0` … `Phase 7`，
//       其中 Phase 0 是 "Acknowledge and capture the request"）。本移植**按上游逐字
//       保留** "follow its 7-phase workflow EXACTLY" 的措辞并**如实登记**这一差异：
//       上游错、我们记错，与本仓体例冲突 —— 署名面优先，差异写在注记里。
//
// ═══ skill 调用语法映射（T5 已就位）═══
//
// 上游：\`\`\`\nskill(name="hyperplan")\n\`\`\`\`（OMO 自己的工具语法）。
// DSH：有 `skill` 模型工具（dsh-tool-skill），工具名与入参形态不同（入参是
// name + 可选 query 之类）。所以本移植**保留 skill 名 `hyperplan` 逐字**、
// 改写调用形态，并说明 hyperplan 已进 catalog（T5）—— 名字硬编码成
// `hyperplan` 而不是从 catalog 派生是有意的：这是**署名锚点**，改它会让
// "加载 hyperplan skill" 这句话指向别的东西。catalog 里确实有它这件事由
// tests/omo-commands/skills.test.ts 的 catalog 断言负责，不是本文件的责任。

import { VENDOR_SKILLS_DIR } from '../skills.ts'

/** 上游 commands.ts:114 的 argumentHint，逐字。 */
export const HYPERPLAN_ARGUMENT_HINT = '[planning-request]'

/** 本命令加载的 skill 名（T5 已注册进 catalog；署名锚点，不从 catalog 派生）。 */
export const HYPERPLAN_SKILL_NAME = 'hyperplan'

/**
 * 上游 nompiler 的调用语法原样登记 —— 只为**对照**，不被拼进正文。
 *
 * 留它是因为"上游怎么说"与"本部署怎么写"必须能分开看：若将来 DSH 的 `skill`
 * 工具形态变了，这里就是比对基准，而正文要改的是正文。
 */
export const UPSTREAM_SKILL_CALL_FORM = 'skill(name="hyperplan")'

/**
 * DSH 的等价调用形态（本部署模型面，见 `agent.cordis.yml` 的 `tool-skill`）。
 *
 * ⚠️ 注意入参名：DSH 的 `skill` 工具接 `name` + 可选 `query`；上游那种
 * `skill(name=...)` 串在本部署**不是**可执行语法，只是文本。
 */
export const DSH_SKILL_CALL_FORM = 'the `skill` tool, with name "hyperplan"'

/**
 * 降级指引段（**重写**，非移植）。
 *
 * 上游原文（hyperplan.ts 末行）：
 *   `If team-mode is unavailable (\`team_*\` tools missing), instruct the user to set
 *    \`team_mode.enabled: true\` in \`~/.omo/omo.jsonc\` and restart opencode.`
 *
 * 为什么**不能**照搬：本部署没有 team-mode 可启用，也没有 `~/.omo/omo.jsonc`；
 * 照搬等于让模型把用户指向一个改了也没有任何效果的文件 —— 这是**死链指引**，
 * 比没有指引更坏（用户会以为改配置有用）。prompts/mode/hyperplan.md 的对应句
 * 还指向另一个路径 `~/.config/opencode/oh-my-opencode.jsonc`（见文件头 (A)）。
 *
 * 故本段改为：**Phase 5 预告**（team-mode 与完整对抗环何时回来）+ **当前真正
 * 可用的降级路径**（直接委派名册席位做独立分析 + 交叉质询）。措辞里不出现任何
 * 配置文件路径，因为本部署此刻**没有**一个开关能开启它。
 */
export const HYPERPLAN_DEGRADED_GUIDANCE = `[oh-my-opendsh] DEGRADED MODE — this deployment has no team-mode surface.

There is no team-mode here: no team_create, no category members, no team_delete. Do not tell the user to enable a configuration flag for it — there is nothing in this deployment that such a flag would switch on, and pointing at one would be a dead link that looks actionable. (Which config path upstream names is itself inconsistent in the frozen baseline; that record is in the carrier note, not here, because quoting a path to you would put the dead link back in the instruction.)

FULL adversarial mode is a Phase 5 surface and is not available yet. What IS available now, and what you should do instead:

1. Skip the skill's "Phase 1: Spawn the adversarial team" and its Phase 7 cleanup — both call team-mode tools that do not exist here.
2. **Phases 2, 3 and 4 are REPLACED by item 3 below — do not follow their round text.** Those three phases are written entirely around the task_send round-trip mechanism ("send the same task to all 5 members", "members reply via task_send to lead", "aggregate replies as injected notifications"), which does not exist here. Reading them as still-applicable would send you looking for a mailbox that is not there. Phase 6 (planner handoff) carries over unchanged, because it does not use that mechanism.

   **Phase 5 (insight distillation) carries over EXCEPT its "Adversarial Provenance" block.** That block asks you to tally survivors per upstream member, naming five members that do not exist here. Count by the ROSTER SEAT that produced each finding instead, never by upstream member name. Everything else in Phase 5 (the defensibility filter, the bundle structure, the refusal to write the plan yourself) is upstream's and applies as written.
3. Run the adversarial analysis with roster delegations instead of a category team: delegate the independent-analysis round to several roster seats in ONE message (they run in parallel), then send each seat's own findings to the others as the cross-attack round, then one refinement round.
4. The two read-only advisory seats are plan-consultant (pre-plan gap analysis) and plan-reviewer (adversarial plan review). Use both for the cross-attack round — between them they are the closest thing this deployment has to upstream's five hostile members.
5. For the skill's Phase 6 planner handoff, delegate to prometheus (long-horizon strategy / interview-style planning); it owns sequencing and verification gates.
6. Say plainly, in your reply, that this ran in DEGRADED mode and what was skipped. Do not present degraded output as the full adversarial ring.

When team-mode lands in Phase 5, this paragraph is replaced by the upstream instruction and a real config path — not before.`

/**
 * roster 契约段（**重写**，按 Phase 2 名册现实）。
 *
 * 体例同 T6/T12 的载体注记：正文保持可比对形态，差异写在正文之外。
 * 这里同时**在正文里点名具体席位**，是为了满足"team 引用零硬编码死链" ——
 * 上游正文里的 `team_create` / `unspecified-low` / `ultrabrain` / `artistry` /
 * `deep` 在本部署**全都不存在**，照抄就是五条死链。逐项映射：
 *
 *   上游 category          DSH 名册映射                         状态
 *   ─────────────────────────────────────────────────────────────────
 *   unspecified-low  skeptic   → 平面席位（无专属对抗席位）        缺席
 *   unspecified-high validator → plan-consultant（只读、对抗评审顾问） 近似
 *   deep           researcher → 平面席位（依赖项目是否启用该 category） 缺席
 *   ultrabrain   architect   → plan-reviewer（只读、对抗评审）       近似
 *   artistry     creative    → 平面席位                              缺席
 *   （lead 合成）              → prometheus                          近似
 *
 * 「缺席」不是漏写：它是本部署的**事实**（名册里没有"每个 category 一个席位"
 * 的映射机制，team-mode 才是那个机制）。三个缺席席位在降级路径里由"多席位并行
 * 独立分析 + 交叉质询"覆盖，而不是被悄悄删掉。
 */
export const HYPERPLAN_ROSTER_CONTRACT = `Roster contract for this deployment: upstream's contract — spawn a team whose members are selected by category — has no equivalent here. There is no team-mode tool surface in this harness, so map the adversarial roles onto the roster instead:

- \`plan-consultant\` (read-only, pre-plan gap analysis) — the closest seat to upstream's validator role. Hostile gap-finding.
- \`plan-reviewer\` (read-only, adversarial plan review) — the closest seat to upstream's architect role. Hostile review of the draft.
- \`prometheus\` (read-only, long-horizon strategy) — owns the Phase 6 planner handoff (sequencing, parallelization, verification gates), the same job upstream gives its planner role.
- Three of upstream's five members have no dedicated roster seat: this deployment has no per-category seat mechanism (team-mode was that mechanism, and it is not ported). Do not invent seats, and do not name upstream's category members as if they existed here — cover their roles by giving the seats above, plus any other read-only roster seat that suits, several independent perspectives in the same parallel round.
- Read-only is a property of those seats, not a handicap: they cannot write the plan, which matches upstream's rule that the lead synthesizes and the planner owns the output.`

/**
 * `/hyperplan` 送进模型的完整消息模板 —— 语义移植自
 * {@link HYPERPLAN_ROSTER_CONTRACT} + 上游正文，外加 omo-commands 的
 * `<command-instruction>` 外框（upstream commands.ts:111-113）。
 *
 * ⚠️ **外框里没有 `<session-context>` / `$SESSION_ID` / `$TIMESTAMP`** —— 这与
 * `/ulw-execute` 相反，且是上游自己的形态：`hyperplan` 的 `$ARGUMENTS` 就在模板
 * 本体的 `<user-request>` 里（hyperplan.ts:13-15，实测——:11 是 roster 契约行、
 * :12 空行，`<user-request>` / `$ARGUMENTS` / `</user-request>` 落在 :13-15），命令条目只在外面套了一层
 * `<command-instruction>`。后果是本模板**不需要会话 id**，`renderCommandTemplate`
 * 也就不会为它抛 `MissingCommandSessionIDError` —— 单测对此有断言（不是遗漏）。
 *
 * 与 `/ulw-execute` 的 R-10 marker 契约**无关**：本模板不产 marker，H-32 的激活
 * 检测对它无意义。降级形态的 hyperplan 是纯指令注入（followup），不是激活面。
 */
export const HYPERPLAN_COMMAND_TEMPLATE = `<command-instruction>
You are running the \`/hyperplan\` command — adversarial multi-agent planning, in this deployment's DEGRADED form.

LOAD THE HYPERPLAN SKILL IMMEDIATELY: call ${DSH_SKILL_CALL_FORM}. The skill is already registered in this harness's skill catalog, and its file is vendored at ${VENDOR_SKILLS_DIR}/${HYPERPLAN_SKILL_NAME}/SKILL.md. After loading it, follow its 7-phase workflow EXACTLY using this user request, except where the degraded-mode note below says otherwise.

${HYPERPLAN_ROSTER_CONTRACT}

<user-request>
$ARGUMENTS
</user-request>

${HYPERPLAN_DEGRADED_GUIDANCE}
</command-instruction>`

// ═══════════════════════════════════════════════════════════════════════════
// P5-T13 — 完整形态（team 工具在场时渲染）。
//
// 上游完整模板（v4.19.4 templates/hyperplan.ts，17 行）的三段在本部署各有对位：
//   ① 首行 purpose —— **逐字**（team-mode 此刻在本部署是 live 事实）；
//   ② roster 契约段 —— 上游那句 "call \`team_create\` with category members
//      \`unspecified-low\`, \`unspecified-high\`, \`ultrabrain\`, and \`artistry\`.
//      Include \`deep\` only if the category is enabled; if \`deep\` is disabled or
//      unavailable, retry without only that member and state the degraded roster."
//      的**语义逐条对位**到本部署的 live 词表（category 只有 quick/deep 两枚、
//      worker 席才可入队、只读评审席队外委派），上游那两个已不存在的 category 臂
//      不进模型可见面（它们在 DSH 是 UNRESOLVABLE_CATEGORY 死链，只活在注记里）；
//      retry-without-that-member + state-the-degraded-roster 规则**逐条保留**。
//   ③ 末行兜底句 —— 上游让用户去 \`~/.omo/omo.jsonc\` 设 \`team_mode.enabled\`
//      并重启 opencode；DSH 无此配置键（team.md 载体的同一死链，T13 仲裁增补
//      已登记进 vendor deviations[]），完整形态里的对位 = guidance 第 7 条：
//      「工具在场就是开关，没有配置开关」。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 完整形态的 roster 契约段（T13 重写，对齐上游 roster 契约语义 + DSH live 词表）。
 *
 * 词表纪律：`quick` / `deep` 逐字对 omo-team 的 TEAM_CATEGORY_SEAT_ALIASES_V1
 * （单测交叉钉），`hephaestus` / `sisyphus-junior` 是它们解析到的 worker 席，
 * `plan-reviewer` / `plan-consultant` / `prometheus` 是 roster 具名席——每个
 * 名字都活着，每个死名字（上游四枚 category）都不在这里。
 */
export const HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT = `Roster contract for this deployment (team-mode form — the team_* tools are live here): call \`team_create\` with an inline spec whose members are this deployment's worker seats, each attacking the plan from a different angle. The live vocabulary has exactly two arms: \`category\` resolves to \`quick\` (the fast worker seat) or \`deep\` (the strong worker seat); \`seat\` names a roster seat directly, and only worker seats are team-eligible — the tool itself refuses read-only seats. Upstream's four required category names have no equivalents in this deployment's vocabulary and must NOT be named in a \`team_create\` call here — the tool refuses them as unresolvable categories; map the hostile ring onto the live arms instead:

- \`deep\` member — the ring's strongest hostile thinker (resolves to the \`hephaestus\` seat): attacks architecture, sequencing and cost assumptions.
- \`quick\` members, three of them (each on the \`sisyphus-junior\` seat) — parallel hostile reviewers, each assigned a DIFFERENT attack surface (hidden assumptions / unhandled risks / missing work), so the plan is attacked from several directions at once.
- Include the \`deep\` member only while that seat resolves; if a member is refused at create, retry WITHOUT only that member and state the degraded roster in your reply — upstream's retry rule, kept verbatim in semantics.
- The hostile review seats \`plan-reviewer\` (adversarial plan review) and \`plan-consultant\` (pre-plan gap analysis) CANNOT be team members — read-only seats are team-ineligible here, the same principle upstream applies when it keeps its reviewer outside the team. Run them as roster delegations OUTSIDE the team, each fed the team's surviving bundle.
- The Phase 6 planner handoff goes to \`prometheus\` (long-horizon strategy), also as an outside-team delegation — upstream's planner was never a team member either.
- You are the lead: you synthesize the ring's output; you do not write the plan yourself.`

/**
 * 完整形态 guidance 的**载体拆弹句**（T13 评审 A MAJOR-1 修复轮，模型可见）。
 *
 * 上游 SKILL.md:38 的 HARD PRECONDITIONS 写着：`team_create` / `task_send` /
 * `team_delete` 缺席则 STOP + "Restart senpi without --no-omo-task"。本部署
 * `task_send` **恒不存在**（DSH 面 = `team_send_message` / `team_task_*`），模型
 * 照字面跑前置检查即 STOP 并向用户复述死载体指令——正是 T14 死链守卫与 T13
 * 仲裁增补（"空头指令不许原样进模型可见面"）要灭的同一类，而完整形态此前没有
 * 降级指引第 2 条的对等拆解句。本常量把 SKILL 词汇与本面词汇**一次对齐**，
 * 让前置检查在字面上也过：缺席的是上游的拼写，不是上游的能力。单独成常量让
 * 消费侧测试（单测 + e2e）能逐字钉这句活着进了模型面，不是注释里的许诺。
 */
export const HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT = `Carrier spellings — read the skill's vocabulary through this surface BEFORE running its HARD PRECONDITIONS check: the skill's \`task_send\` / \`team_run_id\` spellings are upstream's; on this surface they are \`team_send_message\` / \`team_task_*\` with \`teamRunId\`/\`body\`, and the senpi restart line is dead — the live tool surface IS the switch. A literal \`task_send\` being absent is NOT a missing precondition here, because \`team_send_message\` is its live equivalent and it is in your tool list: never STOP on that check, and never recite the restart instruction to the user.`

/**
 * 完整形态的 guidance 段（在场时替代降级指引段）。
 *
 * N1 处置（T13 仲裁增补）：第 4 条把「终态词表 = pending/claimed/in_progress/
 * completed/deleted、无 failed schema 态」写进**模型可见面**——vendored
 * team-mode 模板与 keyword 注入的 team.md 都教过 `failed`（空头指令），消费侧
 * 必须就地拆弹，不许原样进模型。
 *
 * MAJOR-1 处置（T13 评审 A 修复轮）：第 1 条一带前置 {@link
 * HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT}——SKILL.md:38 的 task_send 前置
 * 检查在本面会在字面上 STOP，拆解句把 task_send / team_run_id 逐词映射到
 * team_send_message / team_task_* / teamRunId，并把 senpi 重启句就地判死。
 * MAJOR-2b 处置（同轮）：第 2 条派单条款补 32KB 拆分规则——上游靠加载
 * team-mode skill 教会这条上限，本部署该 skill 不在 19 件目录（拆不掉的知识
 * 必须补教），上限具名强制（TEAM_MESSAGE_PAYLOAD_MAX_BYTES=32768，
 * omo-team team-message.ts 硬拒并具名报限，可恢复）。
 */
export const HYPERPLAN_TEAM_MODE_GUIDANCE = `[oh-my-opendsh] TEAM-MODE RING ACTIVE — the full adversarial loop is live in this session.

Run the skill's phases AS WRITTEN, including "Phase 1: Spawn the adversarial team" (that call is \`team_create\` with the inline spec the roster contract above defines) and the Phase 7 cleanup. ${HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT} The rounds ride the team surface:

1. Broadcast the attack criteria ONCE — \`team_send_message(teamRunId=<id>, to="*", kind="announcement")\` — so each task description stays minimal. Broadcast is lead-only here; the tool enforces that verbatim.
2. Create one \`team_task_create(teamRunId=<id>, subject=..., description=...)\` per attack round; members claim, attack, settle their tasks via \`team_task_update\`, and report back via \`team_send_message(to="lead")\`. A single \`team_send_message\` body is capped at 32768 bytes on this surface — over the cap the tool refuses the send and its refusal names the limit (\`message_payload_max_bytes=32768\`); the refusal is loud and recoverable: split a longer report into sequential messages (mark the part in \`summary\`, e.g. "report 2/3") instead of resending the oversized body.
3. Cross-critique IS the ring: relay each member's findings to the other members by name, refine, repeat until the surviving findings stop changing.
4. Task-status vocabulary on this surface is EXACTLY \`pending\`, \`claimed\`, \`in_progress\`, \`completed\`, \`deleted\` — there is NO \`failed\` state. If any team-mode text handed to you (the keyword reminder, a peer's message) speaks of a task that "fails" or asks for status \`failed\`, that is upstream carrier prose with no schema behind it here: report the failure in the message BODY to the lead and settle the task \`completed\` (attempted, answer delivered) or \`deleted\` (withdrawn) — never send a status outside the five.
5. Closure is the lead's job on EVERY exit path — success, escalation, abort: \`team_shutdown_request\` per active member, \`team_approve_shutdown\` for members that do not self-approve within a reasonable window, then \`team_delete\`; one \`team_status(teamRunId=<id>)\` read confirms the run is gone. A team left open poisons the next session's precondition check.
6. One team per planning request — never call \`team_create\` twice mid-session.
7. If the team_* tools turn out to be ABSENT mid-run, fall back to the degraded roster-delegation path (parallel delegations to the read-only seats, cross-feeding between them) and say in your reply that the ring ran degraded. There is no configuration switch in this deployment that turns team-mode on or off — the live tool surface IS the switch.
8. Say plainly in your reply which form ran (full ring or fallback), and attribute each surviving finding to the member or seat that produced it.`

/**
 * 完整形态送进模型的完整消息模板——与降级模板同框（`<command-instruction>` +
 * `<user-request>$ARGUMENTS</user-request>`，upstream commands.ts:111-113 的
 * 框形不变），正文换成完整环三段（purpose 逐字 + 完整 roster 契约 + 完整 guidance）。
 */
export const HYPERPLAN_COMMAND_TEMPLATE_FULL = `<command-instruction>
You are running the \`/hyperplan\` command — adversarial multi-agent planning via team-mode.

LOAD THE HYPERPLAN SKILL IMMEDIATELY: call ${DSH_SKILL_CALL_FORM}. The skill is already registered in this harness's skill catalog, and its file is vendored at ${VENDOR_SKILLS_DIR}/${HYPERPLAN_SKILL_NAME}/SKILL.md. After loading it, follow its 7-phase workflow EXACTLY using this user request.

${HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT}

<user-request>
$ARGUMENTS
</user-request>

${HYPERPLAN_TEAM_MODE_GUIDANCE}
</command-instruction>`

/**
 * 载体注记 —— hyperplan 侧的差异登记，**前置**在正文之前。
 *
 * 体例同 T6 的 HANDOFF_CARRIER_NOTE / T10 的 ULW_EXECUTE_CARRIER_NOTE。
 *
 * ⚠️ T13 评审 A MINOR 修复轮：本注记的条目 4/5/6 曾**逐字重复两遍**（P4-T14
 * 遗留，git log -S 实证 @97faf6f——重复段与 "5a." 错序编号同 commit 进来）。
 * 已去重删第二份并重排连续编号（5a.→5、原 5/6/7/8/9→6/7/8/9/10，"THE
 * DESCRIPTION…" 段归位为条目 7 的续段）。守卫 =
 * tests/omo-commands/hyperplan.test.ts 的「note 条目连续且无重复」腿；条目
 * 编号的外部引用只有 hyperplan.test.ts 的 item 4（未动，仍然成立）。
 */
export const HYPERPLAN_CARRIER_NOTE = `[oh-my-opendsh] Hyperplan carrier note (semantic port of omo v4.19.4 builtin-commands/templates/hyperplan.ts + commands.ts, DEGRADED form):

1. NO TEAM-MODE. Upstream's hyperplan is built on team_create + category members + task_send + team_delete, with four required categories (unspecified-low, unspecified-high, ultrabrain, artistry) plus deep when the project enables it — five member roles in all (skeptic, validator, researcher, architect, creative). This deployment has none of those — no team-mode face at all. The roster contract is rewritten onto the Phase 2 roster (plan-consultant, plan-reviewer, prometheus), and the three upstream members with no dedicated seat (skeptic, researcher, creative) are declared ABSENT rather than named as if they existed — naming them would be five dead links.

2. THE FULL ADVERSARIAL RING WAS NOT PORTED AT P4 — IT LANDED AT P5-T13, GATED ON TOOL PRESENCE. Upstream's hyperplan is built on team_create + category members + task_send + team_delete, with four required categories (unspecified-low, unspecified-high, ultrabrain, artistry) plus deep when the project enables it — five member roles in all (skeptic, validator, researcher, architect, creative). At P4 this deployment had none of those. Since P5-T13 the ring runs LIVE when the omo-team presence face reports the team_* tools live (the switch is read at invocation, never cached at apply time); the full roster contract then maps the ring onto this deployment's live arms — quick/deep categories on worker seats inside the team, the hostile review seats (plan-reviewer, plan-consultant) and the planner (prometheus) as OUTSIDE-team delegations, keeping upstream's reviewer-not-a-member principle. The three upstream members with no dedicated seat at P4 (skeptic, researcher, creative) stay declared ABSENT rather than named as if they existed — naming them would be dead links in BOTH forms. When the tools are ABSENT the P4 degraded path runs unchanged: parallel roster delegations for the independent round, cross-feeding for the cross-attack round, one refinement round — "runs, but is not upstream's ring", said out loud rather than presented as the real thing.

3. THE DEGRADED GUIDANCE IS REWRITTEN, NOT PORTED. Upstream tells the user to set team_mode.enabled: true in ~/.omo/omo.jsonc and restart opencode. Reproducing that would point the user at a file that does not exist here and whose absence can be changed by nothing — a dead link that looks actionable is worse than no instruction.

   ⚠️ The upstream instruction is quoted HERE and deliberately NOT in the model-facing guidance. The reason is asymmetry of audience: this note is for a reader deciding whether the port is honest, and a reader needs the original; the guidance is an instruction to a model that may act on it, and a config path in an instruction is exactly the dead link being removed. So the paths and the flag name live here only. (This split was found by falsifying the zero-dead-link guard — an earlier draft quoted the upstream sentence inside the guidance, and the guard rightly went red.)

   The frozen upstream baseline is itself inconsistent on the path: the command template (hyperplan.ts:17) says ~/.omo/omo.jsonc, the mode prompt (packages/prompts-core/prompts/mode/hyperplan.md) says ~/.config/opencode/oh-my-opencode.jsonc. Neither is reproduced anywhere the model can act on it; the rewrite is a Phase 5 preview plus the path that actually works today.

   What the guidance DOES still name is the two team tool names, because it has to tell the model which skill phases to skip — naming a tool in order to say "this one does not exist here" is a warning, not a link. The judgment condition ("no hardcoded team dead links") is enforced against the model-facing body by tests/omo-commands/hyperplan.test.ts, which checks the absence of the ACTIONABLE forms (config path, flag name, "restart opencode") rather than the absence of the words.

4. UPSTREAM SAYS "7-PHASE", THE SKILL HAS 8 STAGE HEADINGS. Upstream's template says "follow its 7-phase workflow EXACTLY"; the vendored senpi SKILL.md is headed Phase 0 ("Acknowledge and capture the request") through Phase 7 ("Cleanup") — eight. The wording is kept VERBATIM because it is the attribution surface (restating a corrected "8-phase" would be "upstream is wrong, so we are wrong too", against this repo's discipline); the count difference is recorded here so nobody later reads the 7-vs-8 mismatch as a truncated vendor file.

5. PHASE 5's "Adversarial Provenance" BLOCK IS REPLACED, NOT PORTED. The vendored SKILL's Phase 5 ends with a provenance block that tallies surviving findings per upstream member — skeptic findings / validator findings / researcher findings / architect findings / creative findings (SKILL.md:377-383), five names this deployment does not have. The guidance therefore replaces it with "count by the Roster SEAT that produced each finding, never by upstream member name". The five names are quoted HERE and not in the model-facing body, for the same reason as item 3: a name in an instruction is something the model may act on, and these are not usable seats. The rest of Phase 5 — the defensibility filter, the bundle structure, the Lead's refusal to write the plan — is upstream's and carried over.

6. SKILL CALL FORM REWRITTEN. Upstream's skill(name="hyperplan") is OMO's own tool syntax, not text the DSH model face can execute. The skill NAME stays verbatim (it is the attribution anchor and is registered in the catalog by T5); only the call form changes, to the dsh-tool-skill model face.

7. VERBATIM PRESERVED: the command's first-line purpose, the "load the skill immediately, then follow its workflow EXACTLY using this user request" instruction, the <user-request> wrapper around $ARGUMENTS, and argumentHint [planning-request]. The <command-instruction> outer frame is upstream's own (commands.ts:111-113).

   THE DESCRIPTION IS PRESERVED AS TWO SENTENCES, NOT ONE STRING. Upstream's sentence is kept verbatim and unmodified in UPSTREAM_HYPERPLAN_DESCRIPTION; the REGISTERED string is that sentence with a degraded suffix appended (see src/commands/hyperplan.ts for the reasoning, and MAJOR-1's note there). The registered form — not the bare upstream sentence — is what reaches the user-facing command listing AND the model's visible frame. Recording it in both places because the split is easy to lose: someone reading only this file would think the description was ported verbatim, and someone reading only the command module would not know upstream's wording is still intact upstream of the suffix.

8. NO R-10 MARKERS AND NO SESSION ID. Unlike /ulw-execute, this template carries no <session-context> block and no $SESSION_ID — upstream's hyperplan does not have them either (its $ARGUMENTS lives inside the template body). So renderCommandTemplate cannot throw MissingCommandSessionIDError for this command, and the handler has no session id to read.

9. ⚠️ A DEGRADED MENTAL MODEL LEAKS BACK IN THROUGH THE SKILL'S OWN FRONTMATTER (out-of-scope seam, registered here for the coverage baseline). The vendored SKILL.md's frontmatter description is upstream text, kept verbatim because the vendor tree stays faithful: it advertises a "5-member hostile team (categories unspecified-low, unspecified-high, deep, ultrabrain, artistry)" driven by "the native lead team tools". The moment the model loads the skill — which this command instructs it to do FIRST — that whole mental model arrives with it, and it is the opposite of what the degraded guidance above says. This is NOT fixed here on purpose: (a) the vendor tree is not rewritten (it stays byte-faithful to the frozen tag, and vendor/ is outside this port's scope), and (b) the fix belongs to the consuming side. The degradation is carried by the command instruction and this note; P5-T13 closed the seam on the FULL branch by porting the ring so the claim becomes live (minus the four dead category names, which stay dead in both forms); on the DEGRADED branch the seam remains open by design and is carried by the degraded guidance and this note. Recorded in the coverage baseline (C-04) rather than silently ignored.

10. P5-T13 — THE RUNTIME SWITCH (this is the T13 upgrade surface). The frame the model receives is chosen PER INVOCATION from the omo-team presence face (\`omoTeamHyperplanTeamFace\`, read lazily through ctx.get, never cached at apply time; the provider publishes it only while the eleven tool rows are all ported — derived from TEAM_MANIFEST, not hardcoded). PRESENT → the FULL ring (HYPERPLAN_COMMAND_TEMPLATE_FULL: upstream's verbatim purpose line + the live-vocabulary roster contract + the ring guidance); ABSENT → the P4 degraded template unchanged (this is the T13 ruling "the degraded path must not die"). TWO CONSEQUENCES RECORDED HERE. (a) N1: the ring guidance names the legal task-status vocabulary (\`pending\`, \`claimed\`, \`in_progress\`, \`completed\`, \`deleted\`) and defuses the upstream carrier prose that teaches a \`failed\` terminal state — that word has no schema behind it on this surface and the defusal lives in the MODEL-FACING body because the keyword-injected \`team.md\` arrives verbatim in the same session (TEAM_PATTERN matches this command's own first line) and repeats the "completes or fails" clause. (b) THE CARRIER SENTENCE: \`team.md\` ends with "tell the user to set team_mode.enabled=true and restart opencode" — DSH has no such configuration key; the full guidance's answer is item 7 ("the live tool surface IS the switch"), the degraded guidance keeps refusing any config path, and the adaptation is registered in the vendor VENDOR-MANIFEST deviations[] (prompts-team), not left NOTICE-only. The upstream four category names stay unquoted in BOTH model-facing bodies — in DSH they resolve to nothing, alive in neither form.`


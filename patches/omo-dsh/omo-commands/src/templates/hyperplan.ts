// P4-T14 — `/hyperplan` 的模板常量（**降级形态**语义移植）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/templates/hyperplan.ts
//     export const HYPERPLAN_TEMPLATE = `You are running the \`/hyperplan\` command …`
//     —— 全文 17 行（实测）。
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:109-115 — the
//     command ENTRY: description (:110) + the `<command-instruction>` wrapper
//     (:111-113) + `argumentHint: "[planning-request]"` (:114)。
//   packages/omo-senpi/skills/hyperplan/SKILL.md — the 7-phase body the template
//     tells the model to LOAD (vendored verbatim at
//     patches/omo-dsh/vendor/shared-skills/skills/hyperplan/SKILL.md, 460 lines,
//     registered into the catalog by T5)。
//
// ═══ 本移植的形态：**降级** ═══
//
// 上游的 hyperplan 是一条建立在 **team-mode** 上的命令：`team_create` 拉起 5 个
// category 成员（`unspecified-low` / `unspecified-high` / `ultrabrain` / `artistry`
// / 可选 `deep`）互相对抗评审。本部署**没有 team-mode 面**：没有 `team_create`、
// 没有 category、没有 `task_send`。所以：
//
//   - **roster 契约段**按 Phase 2 的 11 名册改写（见下），每个上游 category
//     都有**具名**的 DSH 委派席位或被显式标为缺席，不留悬空的 category 名字 ——
//     「零硬编码死链」是本任务的判定条件之一。
//   - **完整对抗评审环不移植**（Phase 5 面）。降级路径 = 单席位对抗评审 +
//     名册多席位的独立分析/交叉质询，形态是"能跑但不是上游那个环"。
//   - **降级指引段**按 DSH 现实重写（见 @see HYPERPLAN_DEGRADED_GUIDANCE）。
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
 * 本体的 `<user-request>` 里（hyperplan.ts:11-13），命令条目只在外面套了一层
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

/**
 * 载体注记 —— hyperplan 侧的差异登记，**前置**在正文之前。
 *
 * 体例同 T6 的 HANDOFF_CARRIER_NOTE / T10 的 ULW_EXECUTE_CARRIER_NOTE。
 */
export const HYPERPLAN_CARRIER_NOTE = `[oh-my-opendsh] Hyperplan carrier note (semantic port of omo v4.19.4 builtin-commands/templates/hyperplan.ts + commands.ts, DEGRADED form):

1. NO TEAM-MODE. Upstream's hyperplan is built on team_create + category members + task_send + team_delete, with four required categories (unspecified-low, unspecified-high, ultrabrain, artistry) plus deep when the project enables it — five member roles in all (skeptic, validator, researcher, architect, creative). This deployment has none of those — no team-mode face at all. The roster contract is rewritten onto the Phase 2 roster (plan-consultant, plan-reviewer, prometheus), and the three upstream members with no dedicated seat (skeptic, researcher, creative) are declared ABSENT rather than named as if they existed — naming them would be five dead links.

2. THE FULL ADVERSARIAL RING IS NOT PORTED (Phase 5 surface). What runs instead is the degraded path in the guidance paragraph: parallel roster delegations for the independent round, cross-feeding for the cross-attack round, one refinement round. This is "runs, but is not upstream's ring" — say so in the reply rather than presenting it as the real thing.

3. THE DEGRADED GUIDANCE IS REWRITTEN, NOT PORTED. Upstream tells the user to set team_mode.enabled: true in ~/.omo/omo.jsonc and restart opencode. Reproducing that would point the user at a file that does not exist here and whose absence can be changed by nothing — a dead link that looks actionable is worse than no instruction.

   ⚠️ The upstream instruction is quoted HERE and deliberately NOT in the model-facing guidance. The reason is asymmetry of audience: this note is for a reader deciding whether the port is honest, and a reader needs the original; the guidance is an instruction to a model that may act on it, and a config path in an instruction is exactly the dead link being removed. So the paths and the flag name live here only. (This split was found by falsifying the zero-dead-link guard — an earlier draft quoted the upstream sentence inside the guidance, and the guard rightly went red.)

   The frozen upstream baseline is itself inconsistent on the path: the command template (hyperplan.ts:17) says ~/.omo/omo.jsonc, the mode prompt (packages/prompts-core/prompts/mode/hyperplan.md) says ~/.config/opencode/oh-my-opencode.jsonc. Neither is reproduced anywhere the model can act on it; the rewrite is a Phase 5 preview plus the path that actually works today.

   What the guidance DOES still name is the two team tool names, because it has to tell the model which skill phases to skip — naming a tool in order to say "this one does not exist here" is a warning, not a link. The judgment condition ("no hardcoded team dead links") is enforced against the model-facing body by tests/omo-commands/hyperplan.test.ts, which checks the absence of the ACTIONABLE forms (config path, flag name, "restart opencode") rather than the absence of the words.

4. UPSTREAM SAYS "7-PHASE", THE SKILL HAS 8 STAGE HEADINGS. Upstream's template says "follow its 7-phase workflow EXACTLY"; the vendored senpi SKILL.md is headed Phase 0 ("Acknowledge and capture the request") through Phase 7 ("Cleanup") — eight. The wording is kept VERBATIM because it is the attribution surface (restating a corrected "8-phase" would be "upstream is wrong, so we are wrong too", against this repo's discipline); the count difference is recorded here so nobody later reads the 7-vs-8 mismatch as a truncated vendor file.


5a. PHASE 5's "Adversarial Provenance" BLOCK IS REPLACED, NOT PORTED. The vendored SKILL's Phase 5 ends with a provenance block that tallies surviving findings per upstream member — skeptic findings / validator findings / researcher findings / architect findings / creative findings (SKILL.md:377-383), five names this deployment does not have. The guidance therefore replaces it with "count by the Roster SEAT that produced each finding, never by upstream member name". The five names are quoted HERE and not in the model-facing body, for the same reason as item 3: a name in an instruction is something the model may act on, and these are not usable seats. The rest of Phase 5 — the defensibility filter, the bundle structure, the Lead's refusal to write the plan — is upstream's and carried over.

5. SKILL CALL FORM REWRITTEN. Upstream's skill(name="hyperplan") is OMO's own tool syntax, not text the DSH model face can execute. The skill NAME stays verbatim (it is the attribution anchor and is registered in the catalog by T5); only the call form changes, to the dsh-tool-skill model face.

6. VERBATIM PRESERVED: the command's first-line purpose, the "load the skill immediately, then follow its workflow EXACTLY using this user request" instruction, the <user-request> wrapper around $ARGUMENTS, and argumentHint [planning-request]. The <command-instruction> outer frame is upstream's own (commands.ts:111-113).

   4. UPSTREAM SAYS "7-PHASE", THE SKILL HAS 8 STAGE HEADINGS. Upstream's template says "follow its 7-phase workflow EXACTLY"; the vendored senpi SKILL.md is headed Phase 0 ("Acknowledge and capture the request") through Phase 7 ("Cleanup") — eight. The wording is kept VERBATIM because it is the attribution surface (restating a corrected "8-phase" would be "upstream is wrong, so we are wrong too", against this repo's discipline); the count difference is recorded here so nobody later reads the 7-vs-8 mismatch as a truncated vendor file.


5. SKILL CALL FORM REWRITTEN. Upstream's skill(name="hyperplan") is OMO's own tool syntax, not text the DSH model face can execute. The skill NAME stays verbatim (it is the attribution anchor and is registered in the catalog by T5); only the call form changes, to the dsh-tool-skill model face.

6. VERBATIM PRESERVED: the command's first-line purpose, the "load the skill immediately, then follow its workflow EXACTLY using this user request" instruction, the <user-request> wrapper around $ARGUMENTS, and argumentHint [planning-request]. The <command-instruction> outer frame is upstream's own (commands.ts:111-113).

   THE DESCRIPTION IS PRESERVED AS TWO SENTENCES, NOT ONE STRING. Upstream's sentence is kept verbatim and unmodified in UPSTREAM_HYPERPLAN_DESCRIPTION; the REGISTERED string is that sentence with a degraded suffix appended (see src/commands/hyperplan.ts for the reasoning, and MAJOR-1's note there). The registered form — not the bare upstream sentence — is what reaches the user-facing command listing AND the model's visible frame. Recording it in both places because the split is easy to lose: someone reading only this file would think the description was ported verbatim, and someone reading only the command module would not know upstream's wording is still intact upstream of the suffix.

7. NO R-10 MARKERS AND NO SESSION ID. Unlike /ulw-execute, this template carries no <session-context> block and no $SESSION_ID — upstream's hyperplan does not have them either (its $ARGUMENTS lives inside the template body). So renderCommandTemplate cannot throw MissingCommandSessionIDError for this command, and the handler has no session id to read.

8. ⚠️ A DEGRADED MENTAL MODEL LEAKS BACK IN THROUGH THE SKILL'S OWN FRONTMATTER (out-of-scope seam, registered here for the coverage baseline). The vendored SKILL.md's frontmatter description is upstream text, kept verbatim because the vendor tree stays faithful: it advertises a "5-member hostile team (categories unspecified-low, unspecified-high, deep, ultrabrain, artistry)" driven by "the native lead team tools". The moment the model loads the skill — which this command instructs it to do FIRST — that whole mental model arrives with it, and it is the opposite of what the degraded guidance above says. This is NOT fixed here on purpose: (a) the vendor tree is not rewritten (it stays byte-faithful to the frozen tag, and vendor/ is outside this port's scope), and (b) the fix belongs to the consuming side. The degradation is carried by the command instruction and this note; Phase 5 closes the seam by either porting team-mode so the claim becomes true, or by shipping a DSH-side skill description that says degraded. Recorded in the coverage baseline (C-04) rather than silently ignored.`


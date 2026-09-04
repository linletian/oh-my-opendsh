# MVP 踩坑记录

> **正式交付物**（PRD AC-9，目标 G2「尽早踩雷」）。本文档是 MVP 结项的踩坑知识库：PRD 踩坑
> 计划（§P-1…P-9）中每一条针对不稳定面的假设，无论验证通过还是被推翻，结论都记录在这里；
> 此外还收录了实施过程中发现的、原始清单未预料到的坑（P-10.x）。
>
> **记录约定**：每个*独立*坑占一行。当一次探针（P-#）发现多个不同的坑时，各自占用子编号行
> （如 P-8.1、P-8.2 …）。`证据` 列链接到 `.omo/evidence/` 下的原始记录（逐字日志，不接受转述
> 替代）。`状态` 取值：`open`（假设未验证）、`resolved-proven`（经真实执行判定成立）、
> `resolved-fallback`（回退/绕行方案即最终交付）、`wontfix`（确认为既有行为，设计上绕开）。
>
> 英文主文档：[`mvp-pitfalls.md`](./mvp-pitfalls.md)，两文逐行镜像。

## 1. 踩坑行（P-1 … P-10）

| # | 现象 Phenomenon | 证据 Evidence | 根因 Root cause | fallback | 状态 Status |
|---|---|---|---|---|---|
| P-1.1 | **假设成立（探针结论，非故障）。** 问题：scratch 插件能否在与官方 4 模式相同的层级注册第 5 个运行模式预设？在 rc.6 上实证为**能**：`--patch` 插件内调用 `ctx.agentPresets.copy('standard', 'concerto', …)` 落盘到 `$DSH_HOME/.agent-presets/concerto/`，且 `POST /api/agentPreset.list`（Web UI 选择器自用的接口）把 `concerto`（`trust:"user"`）与 standard/code/minimal/cordis（`trust:"system"`）列在同一个 roster 数组中。 | [task-5 证据](../.omo/evidence/task-5-mvp-implementation.md) §1 引证 1-7（逐字启动日志 + RPC 响应）；`scripts/p1-preset-probe.sh` PASS | 模式注册表是**开放**的：基于文件系统 root 的发现（`list()` 无缓存、`includeUserRoot` 默认 true 追加 `$DSH_HOME/.agent-presets`）+ 官方创作写口 `ctx.agentPresets.copy()`；客户端 roster 由数据驱动，不是硬编码枚举。 | 不需要。判定：register-branch。PRD §4.4 回退方案（omo profile + 启动脚本）**不执行**；T6 注册真实的第 5 模式。 | resolved-proven（register-branch） |
| P-1.2 | 官方 4 模式的本地化显示名是**客户端硬编码**的，仅覆盖 `system` 预设（`BUILT_IN_PRESET_KEYS` 恰好只有 standard/code/minimal/cordis）。插件注册的预设无法进入该语言表，只能用自己的 `preset.yml` 的 `name`/`description` 渲染（探针实证：`concerto` 显示为 `演奏模式 (Concerto P-1 spike)`）。 | [task-5 证据](../.omo/evidence/task-5-mvp-implementation.md) §1 引证 4 + 逐字 RPC 响应；`ui-agent-preset/src/client/locales.ts:169-174,186-191` | `presetDisplayText()` 仅当 `trust === 'system'` 且 id 属于 4 个内置项时才查本地化文案；其余一律按设计回退到 `preset.name ?? preset.id`。 | 在预设自带的 `preset.yml` 中提供显示名/描述（`copy(from, id, name?)` 创作调用会写入）。展示层优雅降级，能力面不受影响。 | resolved-fallback（回退即设计） |
| P-1.3 | 试图用 config-override 把本仓库的预设目录加进 web profile `agent-presets` 行的 `roots`（两种注册候选中的机制 (a)），在 rc.6 上**行不通**：(i) 启动流程会在所有用户覆盖层**之后**强制追加一个覆盖层，把 `roots` 改写为仅剩随附 system root，额外 root 被覆盖冲掉（实测：额外 root 内放置 dummy 预设真实启动后，`POST /api/agentPreset.list` 仍只列出官方 4 个）；(ii) id 定向行上的 `config` 是**整体替换**（无深合并），只设 `roots` 的覆盖层直接让启动崩溃（`$.default missing required value`）。即使 (i) 可合并还有第二层阻碍：`roots` 需要绝对路径，而提交一个绝对路径是机器相关的，不可接受。 | [task-6 证据](../.omo/evidence/task-6-mvp-implementation.log) §2（逐字启动错误 + 加 root/不加 patch 的 roster 响应）；已安装 `lib/profile-boot-*.js` 的 `composeProfile`（该行存在时强制改写 `roots`） | 随附 root 的归属是**装配事实**：`apps/cli` 在启动时把已安装应用的 `config/agent-presets/` 以唯一 `system` root 身份补丁进去，刻意压过覆盖层 config；行级 config 合并是替换语义，不是深合并。 | 绕行而非硬碰：apply-time 创作写入自动追加的 user root（`$DSH_HOME/.agent-presets/`，`includeUserRoot: true`），已实现于 `patches/omo-dsh/omo-agents/src/concerto-preset.ts`，由 `scripts/concerto-mode-probe.sh` 探针验证（机制 (b)，已交付）。 | resolved-fallback（已交付机制 (b)） |
| P-2 | **假设成立。** `dsh-tool-subagent` 实例 config 的 `agentOptions.{provider,model}` 在 runtime 真的覆盖父继承。源码层：`resolveChildAgentOptions` 先展开父路由、最后展开 `...requested`（subagent/src/child-agent.ts:68-83），两条进程内子代理路径都消费它。DSH 自身测试套件 runtime 覆盖该路径（continuation.spec.ts:2258「reapplies the descriptor model route on cold resume」）。在我们的组合下：T15 在真实栈上记录了子代理 descriptor（`agentProvider/agentModel`）与两个 agent 的 `request/header` 路由；T20 在 mock e2e 断言 `routePairDistinct`；T23 真模型冒烟实际执行父 `deepseek-official/deepseek-v4-pro` 对子 `deepseek/deepseek-v4-flash`，两者不同，委派链完整走完。 | [task-14 日志](../.omo/evidence/task-14-mvp-implementation.log) §P-2 evidence（源码链 + spec 引证）；[task-15 日志](../.omo/evidence/task-15-mvp-implementation.log)（descriptor + request/header 逐字 JSONL）；[task-20 日志](../.omo/evidence/task-20-mvp-implementation.log)（routePairDistinct）；[smoke-real verdict](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json)（ac5 各项全 true） | `resolveChildAgentOptions` 的合并顺序使显式请求胜出；descriptor 快照取自同一份已解析值，因此持久日志与实际执行路由在构造上必然一致。 | 不需要（假设成立）。诚实的剩余限制：验证范围为 mock + 剧本化 adapter + 一次真模型冒烟；不存在 fallback 链（§12.5），未知 model id 会在调用时以 `UNKNOWN_MODEL` 响亮失败。 | resolved-proven |
| P-3 | **假设成立。** `agent/pre-step` waterfall listener 语义（注册顺序 / waterfall 包裹 / authoritative 拒绝或 enter）与文档完全一致，仓库内全部三个已知使用者都是同一种 delegate-then-fold 形态。一个值得记录的文档化细节：在 pre-step listener 内调用 `agent.inject()` 会排队到**下一个** step 边界（"may miss a request whose pre-step already claimed its batch"），因此注入段落从子代理的**第二个** step 起才对模型可见；一次性单步子代理的回复永远不会携带它们。这是文档化行为，不是文档与实现不符，并且它直接塑造了 T20 的断言设计（剧本化子代理跑 ≥2 步）。 | [task-16 日志](../.omo/evidence/task-16-mvp-implementation.log) §1（file:line API 面）、§5（三项 MATCH 判定）、§5 design note；注入在 [task-19 日志](../.omo/evidence/task-19-mvp-implementation.log)（`hardBlocksInjectionObserved:true`）与 T23 真冒烟子会话中被实际观测 | 派发是 around-middleware 式 waterfall；最内层 `next` 就是内建 enter 行为；`inject` 在 next-step 边界切进 inbox 且不唤醒 driver。 | 不需要（MATCH）。对一次性子代理：接受第二 step 边界，或在需要首步覆盖时配对 `agent/session-start` + inject（官方 hooks-claude-code:206-212 形态）。 | resolved-proven（含文档化的 next-step 细节） |
| P-4 | **假设成立，并发现一颗跨平台地雷。** `toolFilter` 是**扁平**字段 `{allow, deny}`（无 wrapper）；deny 语义 = 从子代理模型可见面移除 + 派发层 `UNKNOWN_TOOL`，子作用域生效，每次 start 重新施加。地雷：deny 列表中的未知工具名会在子代理启动时在 `applyChildComposition` 内抛出（`tools.restrict() names unknown global tool "pwsh"`），而 `bash`/`pwsh` 是按平台条件启用的行，静态 deny 写错 shell 名会让委派在某一平台上直接坏掉。判定：保留 `deny: [write, edit]`（OMO 对齐、平台安全）；deny bash 会连带去掉 shell 读能力，相对 OMO 是能力削减。 | [task-12 日志](../.omo/evidence/task-12-mvp-implementation.log) §1 执行链、§2 判定 (a)、§4 QA-1…QA-4 逐字（happy / 剥离对照 / bogus 名 / linux 上 pwsh） | `tools.restrict()` 在子代理启动时对照**全局**注册表校验名字；tool-bash/tool-pwsh 行按平台条件 `disabled`，注册表本身随平台变化。 | 只 deny 平台稳定的名字（`write`、`edit`）；委派域加固已由进程内子代理的 `approvalPolicy: 'never'`、persona 的约束性只读声明与 T16 hard-blocks 注入兜底。 | resolved-proven |
| P-5 | **假设成立。** 深度上限是**扁平**字段 `maxDepth`（union `natural | "provider-managed"`，默认 3）；不存在 `policy` wrapper（PRD 的 `policy.maxDepth` 措辞已由 T11 的 schema 发现修正）。执行实证：cap 1 在**两条**启动路径（前台与 continuable）上都拒绝 depth-1 父级，逐字错误工具结果为 `Error: subagent depth 2 exceeds maxDepth 1`（isError=true）；工具在 cap 处仍对模型可见；depth-0 对照通过；缺省 maxDepth 生效为 3；`provider-managed` 不下发 cap。cap 是部署固定的（模型可见参数中没有深度参数），深度本身由系统打戳（`subagentDepth`/`delegationDepth`，单调）。 | [task-13 日志](../.omo/evidence/task-13-mvp-implementation.log) §1 链、§3 QA-1…QA-5 逐字、§4 P-5 判定 | `resolveChildDepth` 在两条启动路径上都先于任何子代理创建运行；工具运行时把抛出的 `SubagentDepthError` 转换为错误工具结果（README:28 契约）。 | 不需要（行为符合预期）。进程外 provider 用 `maxDepth: 'provider-managed'`；对没有 `depthLimit` 能力的 provider 配数值 cap 会在**挂载时**响亮失败。 | resolved-proven |
| P-6 | **假设被重构（concern 不成立，无故障）。** `build:lib:host` + `build:lib:client` 双 target 约定是**按包**的属性，服务于同时交付 Node 面与浏览器面的 split 包；纯 host 包根本没有 client 面（webserver 范例）。我们的插件经 Node 24 type-stripping 直接加载、无构建步骤（T4 证据 P-8.6 注记），做双 target emit 构建属于 cargo-culting。保留下来的持久价值：同名脚本下的两个 noEmit typecheck 面，其中 host 面**排除 DOM**。故障探针实证：host 代码里写 `window.innerWidth` 会让 `pnpm build` 失败（TS2304），而仓库根的 `pnpm typecheck` 门面（默认带 DOM lib）仍为绿，因此 host 面是更严格的闸门。 | [task-9 日志](../.omo/evidence/task-9-mvp-implementation.log) §0-§6（约定解读、判定、happy + failure 探针逐字） | DSH 按面拆分 tsconfig 聚合；workspace 门面 tsconfig 保留 TS 默认 DOM lib，浏览器全局泄漏对它不可见；浏览器全局在 dsh host 运行时本就是 `undefined`。 | 保留 `pnpm build`（host typecheck + 空转 client 面）作为 CI 边界闸门；在未新增真实 client 入口前**不要**移除 `-d src/client` 守卫。 | resolved-fallback（已交付双面 typecheck 闸门） |
| P-7 | **假设成立。** 会话 JSONL 已记录两个 agent 的已解析路由：continuable 子代理在首个 turn 前获得持久的 `subagent/descriptor` 事件（`agentProvider`/`agentModel`），且每个 agent loop 在首个请求时追加 `request/header`。细节：one-shot 的 descriptor schema **省略**路由字段；one-shot 子代理的路由仍由它自己的 `request/header` 记录。我们的行是 continuable，因此 AC-5 的观测半不需要自建 listener。 | [task-15 日志](../.omo/evidence/task-15-mvp-implementation.log)（判定 `logged`，逐字子 descriptor + request/header JSONL，用伪造的未记录日志做 failure QA） | `childSessionMeta`/`seedDescriptorTurn` 把已解析路由持久化进创建 seed；descriptor 快照与执行路由取自同一份已解析值（continuation.ts:413-414）。 | 不需要。若未来某行使用 `backgroundMode: 'one-shot'`，改从子代理的 `request/header` 读路由而非 descriptor。 | resolved-proven |
| P-8.1 | `--patch` 覆盖层中的**普通** `- id:/name:` 行会被**静默跳过**：`--dump-config` 退出码为 0，组合树中不存在该行，唯一的告警（`patch: entry "omo-agents" not found`）在真实启动时进入内存缓冲日志，终端上不可见。插件根本不会被挂载。 | [.omo/evidence/task-4-mvp-implementation.log](../.omo/evidence/task-4-mvp-implementation.log) §4-F1、§5 P-8.1 | `--patch` 接受的是**补丁列表**而非条目列表：对（始终为空的）profile 根而言，普通行是按 id 定向的覆盖，匹配不到任何目标。挂载**必须**使用 `- insert:` 形式。cordis-primer 文档从未写明这一区别。 | 新增行一律使用 `- insert:`；`scripts/cold-start.sh` 阶段 A 在真实启动前断言该行出现在 `--dump-config` 输出中。 | resolved-proven |
| P-8.2 | 标志**顺序**敏感：`dsh --profile web --port 0 --patch ./cordis.yml` 报 `error: unknown option '--patch'`（退出码 1）。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §5 P-8.2 | 一旦应用自身的标志开始出现，其后所有参数都被转发给应用，而 web 应用没有 `--patch`。根标志（`--profile`、`--patch`、`--dump-config`）必须放在最前。 | scripts/cold-start.sh 固定标志顺序 `--profile <name> --patch <file> … <app flags>`。 | resolved-proven |
| P-8.3 | `--profile <name>` 为**必填**：裸 `dsh --patch ./cordis.yml` 报 `error: --profile <name> is required`（退出码 1）；不存在默认 profile。`headless` 需要 LLM 凭据，无法用于无凭据冒烟。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §5 P-8.3 | 设计如此：dsh 没有默认 profile；`web` 是 `--profile web` 的别名。 | 始终传 `--profile web`；`web --port 0`（操作系统分配空闲端口）+ 就绪行 `dsh web: http://127.0.0.1:<port>` + SIGTERM（退出码 0）是干净的有界冷启动。 | resolved-proven |
| P-8.4 | 插件 `name` 从 **profile 目录**（`$DSH_HOME/profiles/<name>/`）解析，绝不从 cwd、也绝不从覆盖层所在目录解析。相对路径锚定 profile 目录（对仓库根下的覆盖层无用）；`workspace:` 协议不是合法说明符。无法解析的 name 会以 Node 原生未捕获拒绝使启动崩溃（`ERR_MODULE_NOT_FOUND … imported from /tmp/…/dsh/profiles/web/`），退出码 1。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §4-F3（逐字错误）、§5 P-8.4 | 裸说明符从 profile 目录起向上遍历 `node_modules`；模块可解析性只在启动时检查，`--dump-config` 不检查。 | 先把插件装进 profile：`dsh plugin --profile <name> add <dir>`（pnpm 转发；本地目录成为 `link:` 依赖；零依赖包可离线工作）。cold-start.sh 始终执行真实启动（阶段 B），绝不只信阶段 A。 | resolved-proven |
| P-8.5 | 补丁 schema 是**宽松**的：insert 行上的未知键（`bogusField: 123`）被静默接受并逐字回显进组合转储；启动正常。因此已知键的拼写错误会静默改变语义而不是报错。硬失败只有：文件不可读、YAML 解析失败、顶层非数组、id 重复（缺 `id` 则自动生成随机值）。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §4-F2、§5 P-8.5 | 手写的宽松解析；`PatchOptions` 带索引签名；覆盖层路径上没有任何针对未知键的 schema 校验。 | `--dump-config` 及其 stderr 是唯一随附的检查面；覆盖层改动按代码评审对待；cold-start.sh 阶段 A 断言钉住期望行的精确文本。 | wontfix |
| P-9 | **假设成立（未发现路径解析坑）。** 本地 markdown 段落加载经 `import.meta.url` 在 Node 真实模块系统下解析（单测断言绝对路径与相等性）；`dsh plugin add` 的 `link:` 依赖形态意味着不存在任何可能丢失 `system-sections/` 目录的拷贝/快照步骤；冷启动日志无 ENOENT/路径错误（grep 实证零命中）。omo-senpi 同类坑（调研 §11.4 issue #6794）在此加载路径下不复现。 | [task-7 日志](../.omo/evidence/task-7-mvp-implementation.log) §5 P-9 observations 1-5（TDD 红/绿、冷启动 PASS、ENOENT grep 零命中） | type-stripping 就地加载插件源码，md 目录物理上紧邻 `src/`；解析锚定模块 URL 而非 cwd。 | 不需要。保留单测中的路径断言；目录布局一旦移动它们会让测试套件失败。 | resolved-proven |
| P-10.1 | **T11 schema 三 deltas（三个不同 delta 记一行：同一根因、同一缓解）。** 对照计划预期读**已安装** rc.6 的 dsh-tool-subagent Config 发现：(a) 不存在 `policy` wrapper，深度上限是**扁平**字段 `maxDepth`；(b) 不存在 `description` 字段，模型可见的工具描述由 `provider.inheritsParentContext + backgroundMode` **生成**，因此 OMO task 工具式的契约描述在形态 A 静态 config 中**不可表达**（加 `description:` 只会成为被静默保留的死配置）；(c) 未知 config 键被 schemastery 静默**保留**（实证：`agentOption:` 拼写错误原样出现在校验后的值里），字段名拼错会静默改变行为（委派将带着继承的父级模型选项运行）。 | [task-11 日志](../.omo/evidence/task-11-mvp-implementation.log) §SCHEMA FINDINGS（rc.6 已安装 ≡ rc.7 源码，逐字段）、failure-mode 探针 CASE2/CASE3 逐字 | schemastery 对象字段除非 `.required()` 否则皆可选，未知键按设计保留，工具描述是 provider 派生的计算字符串而非 config 字段。 | 探针用 grep + 校验值断言钉死精确字段名，拼写在探针处失败，即使 dsh 保持沉默；契约式父级指引放在 omo-sisyphus system prompt（Delegation Discipline 段，T8）；真正的自定义描述需要上游 dsh-tool-subagent 特性或 wrapper 插件（已标记为 follow-up）。 | resolved-fallback（探针闸门 + prompt 层指引） |
| P-10.2 | **预设行校验是惰性的。** cordis `resolveConfig` 在行的 fiber 加载时才运行其 Config schema，而预设行的 fiber 加载点是 agent/session 组合时的 `mountPreset`，**不是启动时**（agent-presets/src/mount.ts:332）。坏行（如 `maxDepth: -1`、`persona: 123`、`toolFilter: {}`）启动完全正常，只在首次会话使用时抛出；bogus provider 名甚至永不抛出（工具只是永不注册，仅记录一行等待日志）。只做启动层闸门会把坏组合认证为好组合。 | [task-11 日志](../.omo/evidence/task-11-mvp-implementation.log) §SCHEMA FINDINGS 第 4 条 + failure-mode 探针 CASE1/CASE4/CASE5/CASE6 逐字；[task-12 日志](../.omo/evidence/task-12-mvp-implementation.log)（未知名抛错在子代理启动时浮现，与惰性校验一致） | 校验时机跟随 fiber 加载顺序；预设行没有启动期 fiber，schema 在启动时永不运行。 | 我们构建了** eager schema 闸门**：探针在探针时刻用已安装 dsh 自带的 dsh-tool-subagent Config（同一 js-yaml 方言、同一 schemastery schema，从 dsh 二进制的 node_modules 只读执行）校验物化行（每次启动打印 `T11-VALIDATE PASS`），为我们的行闭合了启动到会话的缺口。 | resolved-fallback（已交付 eager 探针闸门） |
| P-10.3 | **自伤、真实：真冒烟 driver 的首跑崩溃于我们自己代码里的顺序 bug。** `scripts/smoke-real.mjs` 在 `seedSandbox()` 创建沙箱目录**之前**就往 `sandbox.project` 写 README fixture，用户首跑在任何模型调用之前就死了。这段代码路径 agent 从未执行过（T23-prep 刻意不跑真 key run），因此 self-test 与 no-key precheck 闸门全绿，而 happy path 上躺着一次死写。修复：一行重排（commit 7473bcb）；复跑对真模型通过全部 AC-4/AC-5 检查。 | [.omo/evidence/task-23-mvp-implementation.md](../.omo/evidence/task-23-mvp-implementation.md)（首轮崩溃记录）；[.omo/evidence/smoke-real-2026-08-21T02-16-44-873Z/](../.omo/evidence/smoke-real-2026-08-21T02-16-44-873Z/)（崩溃 run 的证据目录，空）；[.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json)（复跑 PASS）；commit 7473bcb（`writeFileSync` 移到 `seedSandbox` 之后） | fixture 写入被排在它所依赖的建目录 setup 之前；这个从未用真 key 执行过的 driver 的盲区恰好落在其闸门够不到的地方（首个网络调用之前的一切只经 self-test 覆盖，而 self-test 伪造的是分析半、不是沙箱半）。 | 已在 7473bcb 修复。教训记录：一个从未执行过自己 happy path 的 driver，无论通过多少 precheck/self-test 闸门都是未验证的；任何 harness 的首次真实执行本身就是对 harness 的测试。 | resolved-proven（自伤；修于 7473bcb） |
| P-10.4 | **rc.6 的 `DSH_SNAPSHOT` 只支持 `replay` 模式。** 该环境变量只命中一条代码路径（`resolveConfigPath`：snapshotMode === 'replay' 时把 `cordis.yml` 换成 `cordis.snapshot.yml`）；它是启动配置重放开关，不是 PRD AC-3 措辞（`DSH_SNAPSHOT=record`）所假设的 prompt 捕获设施。没有 record 模式可驱动。 | [task-8 日志](../.omo/evidence/task-8-mvp-implementation.log) §DSH_SNAPSHOT investigation（对安装全量 grep，单一命中，`dsh_snapshot_usable = false`） | rc.6 的实际面比调研阶段的解读更窄；只有 replay 进入了 rc.6。 | 替代（计划允许）：AC-3 快照产物用 vitest 自带文件快照机制产出（`toMatchFileSnapshot('__snapshots__/sisyphus-system-prompt.md')`），签入仓库并带显式 marker 断言；T8 已做故障探针。 | resolved-fallback（已交付 vitest 文件快照） |

> 行数说明：T11 的三个 schema delta 记为**一行**（同一根因：schemastery 宽松/默认可选的
> 语义；同一缓解：探针的 eager 字段名闸门）；拆成三行会把同一次发现重复计三次。

## 2. V1–V4 结论（签章节，PRD §7 AC-9 + Sign-off 条件）

**V1（scratch 插件冷启动加载；协奏模式注册；e2e 真实启动）：验证通过。**
证据链：自 T4 起冷启动持续 PASS 且日志干净（[task-4 日志](../.omo/evidence/task-4-mvp-implementation.log)）；
协奏经 apply-time 创作在 roster 层注册，每次探针启动均可经 `POST /api/agentPreset.list` 观测
（[task-5](../.omo/evidence/task-5-mvp-implementation.md)、[task-6](../.omo/evidence/task-6-mvp-implementation.log)、
[task-16 日志](../.omo/evidence/task-16-mvp-implementation.log) §4 的 concerto-mode-probe 双启动 PASS）；
mock e2e 输出 `{"result":"PASS"}` 且 4 个 scenario 全过（[task-20 日志](../.omo/evidence/task-20-mvp-implementation.log)）；
T23 冒烟完成真模型启动 + 完整委派链（[verdict.json](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json)：
pluginLoaded、两个 provider 均 active、AC-4 链按序）。任何一层都没有证伪信号。

**V2（`agentOptions.{provider,model}` 在 runtime 覆盖父继承且路由可观测）：验证通过。**
证据链：`resolveChildAgentOptions` 的源码级合并顺序（child-agent.ts:68-83，请求胜过父级）；
DSH 自身 runtime 测试 continuation.spec.ts:2258（cold resume 按声明路由运行）；
T15 在真实栈上的 descriptor/request-header 记录（[task-15 日志](../.omo/evidence/task-15-mvp-implementation.log)）；
T20 的 e2e `routePairDistinct` 断言（[task-20 日志](../.omo/evidence/task-20-mvp-implementation.log)）；
T23 真模型冒烟实际执行父 `deepseek-official/deepseek-v4-pro` 对子 `deepseek/deepseek-v4-flash`，
两者不同且两个 provider 均 active（[verdict.json](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json)：ac5* 全 true）。
诚实的限制：验证范围为 mock + 剧本化 adapter + 一次真模型冒烟；deepseek 之外的模型行为未覆盖；
且不存在 fallback 链（§12.5），未知 model id 会在调用时响亮失败。

**V3（`agent/pre-step` waterfall listener 行为符合文档，且能向子代理上下文注入）：验证通过。**
证据链：T16 对注册顺序 / waterfall / authoritative 语义的三项 MATCH 判定（对照文档与仓库内
全部三个已知使用者，[task-16 日志](../.omo/evidence/task-16-mvp-implementation.log) §5）；
注入在真实子代理日志中被观测（`hardBlocksInjectionObserved:true`，[task-19 日志](../.omo/evidence/task-19-mvp-implementation.log)）
以及 T23 真冒烟的子会话中。诚实的细节：`agent.inject()` 在**下一个** step 边界落地，
一次性单步子代理的回复永远不携带注入段落（文档化行为，见 P-3 行）；MVP 的断言设计已围绕它展开
（剧本化子代理跑 ≥2 步）。

**V4（toolFilter 只读限制与深度上限是真实强制，而非 prompt 提示）：验证通过。**
证据链：T12 的真实执行负向证明（子代理可见面排除 write/edit，执行面报 `unknown tool`，父作用域
不受影响，剥离对照证明断言敏感；[task-12 日志](../.omo/evidence/task-12-mvp-implementation.log) QA-1/QA-2）；
T13 在**两条**启动路径上的逐字深度拒绝 `Error: subagent depth 2 exceeds maxDepth 1` 且对照通过
（[task-13 日志](../.omo/evidence/task-13-mvp-implementation.log) QA-1…QA-5）；
T20 的 e2e 抗幻觉 scenario（模型尝试被 deny 的 `write` 收到逐字 unknown-tool 错误；子代理尝试嵌套委派
收到逐字深度错误；[task-20 日志](../.omo/evidence/task-20-mvp-implementation.log) §4）。

**V1–V4 无一被证伪。** 按 PRD §7 的签章条件，AC-1…AC-9 全绿，每条 V 均给出「验证通过」判定并附
上述证据链。

## 3. rc 漂移声明（强制）

MVP 全部验证运行在 **DSH 0.1.0-rc.6**（已安装运行时，
`/home/linletian/.npm-global/lib/node_modules/@deepseek-ai/dsh/`，只读检查与执行）之上，并以
**rc.7 源码检出阅读**补全引证（`/home/linletian/GithubRepo/deepseek-harness`，只读；我们依赖的
表面上每一处引证都逐行核对过与已安装 rc.6 一致，例如 [task-12 日志](../.omo/evidence/task-12-mvp-implementation.log)
§1 与 [task-13 日志](../.omo/evidence/task-13-mvp-implementation.log) §1 记录了执行路径上 rc.6 ≡ rc.7）。
PRD 文本仍写 **rc.5**（成文于安装升级之前）。此漂移由决策 **D7**（pin minor `0.1.x`：任何
`0.1.x` 版本均满足 pin）批准，并按计划记录于此。CI 精确钉 **rc.6**。若 rc.7+ 发布，采用前先
重跑闸门链（`pnpm build && pnpm typecheck && pnpm vitest run && pnpm test:e2e &&
scripts/cold-start.sh && scripts/concerto-mode-probe.sh`）。

## 4. 后续指引（PRD §12）

V1–V4 全部验证通过，按 PRD §12 与 D11/Q-2 进入全量移植轨道，顺序如下：

1. **第一个 follow-up（Q-2 选项 B）：经 npm import 一个最小 OMO core 包**，端到端验证
   import + 双 license + typecheck 链路。这是剩余最便宜且卡后续一切的未验证前提。
2. 剩余 agent（另外 10 个 OMO agent）套用到已验证的协奏预设形态上。
3. hooks 批量翻译到 P-3 已验证的 `agent/pre-step` waterfall（及同类事件）上。
4. Team Mode，然后按可行性报告覆盖其余能力面。

MVP 产物全部保留并生长：仓库骨架 → 全量 patch 框架；mock e2e → 完整 L2 层；doctor-lite →
完整 doctor；本文档 → 持续累加的踩坑知识库。

> 给用户的一则说明（按任务约束**不登记**）：本次结项未发现必须新增决策（D13+）的事项。
> 若推进 rc.6→rc.7+ 升级或上游 `description` 字段特性请求（P-10.1(b)），这两项值得登记为候选；
> 是否登记由用户决定。

## 5. P-11（2026-08-29，dsh 0.1.2-alpha.1 bump 验证——经源码构建执行，npm 滞后）

> 2026-08-29 于 MVP 结项后追加，源自 dsh-012-review-sync 计划的 pin-bump 执行（T6-T9）。
> `dsh-v0.1.2-alpha.1` 目前只以 git tag 存在（npm registry 最高到 `0.1.1-rc.2`），因此本次 bump
> 验证针对**该 tag 的源码构建**（`pnpm install` + `pnpm run build` + `npm link`）在 0.1.2-alpha.1
> 构建与 rc.6 pin 两个运行时上执行；CI 翻转待 npm 发布解除阻塞（PRD §12）。
> 证据：`.omo/evidence/task-{7,8,9}-dsh-012-review-sync.log`。

- **P-11.1 官方 preset 搬迁 + `code`→`ptc`**——rc.6 `apps/cli/config/agent-presets/` → 0.1.2 `packages/preset/agent-presets/presets/`；本地化键 `ui-agent-preset/src/client/locales.ts:171-176` 同步更名，仍仅 `trust==='system'` 生效 → P-1.2 fallback 设计依然成立。
- **P-11.2 采纳的 5 项重派生 delta**（KEEP command-goal；`modelSelectionSettings: true` 仅加在通用 spawn 行——rc.6 上属静默保留的死配置、0.1.2 上生效；刷新 product-provider DROP 措辞；`tool-web fetch: false→true` 跟随上游；派生账本路径更新、保留 rc.6 注记）；18/18 个 diff 块全部有账本解释（42e1f84）。
- **P-11.3 e2e 逐字拒绝契约：0.1.2 上无字符串漂移**（`unknown tool "write"`、`subagent depth N exceeds maxDepth M`；深度错误类自 rc.6 child-agent.ts:48-56 上移至 0.1.2 :34）；真正的漂移是 web-RPC 传输层（token→cookie 认证；扁平端点 → Typert Remote）+ `CallId`→`ToolCallId` + descriptor v2→v3——harness 已传输自适应（105aa84, 3d949f1），两种运行时全绿。
- **P-11.4 npm 发布缺口**——仅 tag 发布；CI 翻转受阻；验证针对该 tag 的源码构建执行（doctor-lite 经 D7 pin-minor 接受）。
- **P-11.5 rc.8 依赖地雷**——今天全新执行 `npm i -g @deepseek-ai/dsh@0.1.0-rc.6` 会解析到 rc.8 的 DEPENDENCIES（`^` 范围；rc.8 于 2026-08-19 发布），破坏 T13 栈（`ctx.agents.get`）；已验证的依赖树 = rc.6 伞包 + rc.7-scheme 依赖，只能通过 `.omo/evidence/task-9-dsh-012-review-sync.log`（P3.5b-e/P5.11）记录的约 197 个显式 pin 的 `--no-save` 配方恢复。后续：锁定/shrinkwrap harness 的 dsh 依赖树。
- **P-11.6 未适配项**——`scripts/smoke-real.mjs` 仍走 rc.6 扁平 RPC（无真实凭据无法运行）；随 CI 翻转一并适配。

## 6. P-13~P-19（2026-09-04，当前 DSH 运行时移植）

> 把同一 PRD（FR-1~FR-8、V1–V4）在**当前 DSH 环境**（动态 Cordis 插件体系）重新实现并验证时
> 撞击的坑。完整实现、验证（最终 `concerto_verify` 22/22 PASS）与 Q-3 路由漂移见
> `docs/concerto-current-dsh_zh-CN.md`；运行时形态为动态插件 `conc-1`（源码归档
> `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js`）+ 持久化用户 preset
> `~/.dsh/.agent-presets/concerto/`（镜像 `patches/omo-dsh/omo-agents-current/preset/`）。

| # | 现象 | 根因 | fallback / 修复 | 状态 |
|---|---|---|---|---|
| P-13 | 子 agent 首轮死掉：`session event "subagent/descriptor" carries non-JSON-serializable data` | 装饰器 subagent provider 丢弃了 service 解析好的 `request.descriptor`，`attachDescriptorAppend` 把 `undefined` 追加为会话事件 | 原样转发 `descriptor`；子会话日志逐字佐证 | 已修复+验证 |
| P-14 | 5 个 system-sections 全部加载失败（`FsError: not found`） | `sandboxPolicy.workspaceRoot` 指向另一个 worktree，不是本会话 cwd | 以指挥 agent 持久 `session.header.cwd` 为权威路径 | 已修复+验证 |
| P-15 | 指挥路由被解析成 explore 的路由（v4-flash） | 本会话 `Agent.options.model` 与冻结请求配置（v4-pro）不一致，`options` 不可作路由真相源 | 指挥路由改由真实 `agent/request` 冻结配置跟踪 + `captures` 审计 | 已修复+验证 |
| P-16 | 子 agent 首次组装快照丢失（verify SKIP） | `exploreChildren` 登记（await start 之后）与子 agent 首轮组装竞态 | `agent/created`（发布于首轮之前）按 lineage+路由确定性登记 | 已修复+验证 |
| P-17 | 插件侧证据写盘失败/写错位置 | 沙箱后端 `sandboxPolicy.workspaceRoot` 与真实工作区不一致，插件 fs 写入被沙箱校验拒绝 | 证据以会话日志为持久权威，指挥会话（danger-full-access）物化 | 已记录（环境事实） |
| P-18 | `settings.update` 报 `must be a plain object` | 动态插件 Host 在 `node:vm` realm 求值，vm 对象过不了 host realm 的 `Object.getPrototypeOf===Object.prototype` 检查（sandbox 只补丁了 `instanceof`） | 磁盘写 settings.yaml + `dsh-settings-file` chokidar 热加载（官方路径） | 已绕过+验证（pi-ai 激活成功） |
| P-19 | 人工验证 6/7 步"成功"：写与嵌套委派未受限 | 限制绑定在**委派工具**而非会话/persona——经通用 `subagent` 工具派生的子 agent 是无限制完整 agent | preset 加固：DROP 通用 subagent/subagent_fork 行（唯一委派路径=call_omo_explore）；toolFilter 升级 `deny:[write,edit,call_omo_explore]` 物理移除子 agent 写与委派能力 | 已修复+验证（22/22） |

### 当前 DSH 版 V1–V4 结论

| # | 判定 | 依据 |
|---|---|---|
| V1 | 验证通过（register-branch） | 动态插件在运行中的 DSH 零修改 define/run/update；provider/tool/prompt 分节扩展面全公开 |
| V2 | 验证通过（register-branch） | 源码级：`resolveChildAgentOptions` 中 `requested` 最后展开；运行时：explore 走 pi-ai `deepseek`/v4-flash、指挥走 `deepseek-official`/v4-pro，四通道观测一致 |
| V3 | 验证通过 | persona 能力（order-0 影子）+ `system-prompt/assemble` 瀑布快照：`{persona:true, hardBlocks:true}` |
| V4 | 验证通过 | 子 agent 组装快照 `write/edit/call_omo_explore` 全缺席 + depth-2 拒绝原文（`subagent depth 2 exceeds maxDepth 1`） |

> 一条口径经验（P-19 衍生）：**负向探针必须落在被测对象上**——"write 是否可用"要测 explore
> 子 agent 而非指挥（指挥是完整 agent，write 存在是设计使然）；探针指令要打进委派任务文本，
> 并确认委派走的是 `call_omo_explore`（子会话 descriptor mode=one-shot 佐证）。

- **P-20（候选，未触发）**：插件/验证器用 `indexOf('## Hard Blocks')` 等字面标记探测注入内容——
  markdown 源微调（改标题/翻译）会静默失效。合规上成立（插件不内嵌 OMO 文本，attribution
  留在 `system-sections/*.md` 源文件），工程上属脆弱依赖；若未来升级 sections 文本，建议改为
  段落名/结构化元数据探测。

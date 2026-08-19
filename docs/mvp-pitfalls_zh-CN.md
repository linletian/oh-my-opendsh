# MVP 踩坑记录

> **正式交付物**（PRD AC-9，目标 G2「尽早踩雷」）。本文档是 MVP 持续累积的踩坑知识库：PRD
> 踩坑计划（§P-1…P-9）中每一条针对不稳定面的假设，无论验证通过还是被推翻，结论都记录在
> 这里。
>
> **记录约定**：每个*独立*坑占一行。当一次探针（P-#）发现多个不同的坑时，各自占用子编号行
> （如 P-8.1、P-8.2 …）。`证据` 列链接到 `.omo/evidence/` 下的原始记录（逐字日志，不接受转述
> 替代）。`状态` 取值：`open`（假设未验证）、`已判定 resolved`（已有结论/规避方案）、
> `wontfix`（确认为既有行为，设计上绕开）。
>
> 英文主文档：[`mvp-pitfalls.md`](./mvp-pitfalls.md)——两文逐行镜像。

| # | 现象 Phenomenon | 证据 Evidence | 根因 Root cause | fallback | 状态 Status |
|---|---|---|---|---|---|
| P-8.1 | `--patch` 覆盖层中的**普通** `- id:/name:` 行会被**静默跳过**：`--dump-config` 退出码为 0，组合树中不存在该行，唯一的告警（`patch: entry "omo-agents" not found`）在真实启动时进入内存缓冲日志，终端上不可见。插件根本不会被挂载。 | [.omo/evidence/task-4-mvp-implementation.log](../.omo/evidence/task-4-mvp-implementation.log) §4-F1、§5 P-8.1 | `--patch` 接受的是**补丁列表**而非条目列表：对（始终为空的）profile 根而言，普通行是按 id 定向的覆盖，匹配不到任何目标。挂载**必须**使用 `- insert:` 形式。cordis-primer 文档从未写明这一区别。 | 新增行一律使用 `- insert:`；`scripts/cold-start.sh` 阶段 A 在真实启动前断言该行出现在 `--dump-config` 输出中。 | 已判定 resolved |
| P-8.2 | 标志**顺序**敏感：`dsh --profile web --port 0 --patch ./cordis.yml` 报 `error: unknown option '--patch'`（退出码 1）。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §5 P-8.2 | 一旦应用自身的标志开始出现，其后所有参数都被转发给应用，而 web 应用没有 `--patch`。根标志（`--profile`、`--patch`、`--dump-config`）必须放在最前。 | scripts/cold-start.sh 固定标志顺序 `--profile <name> --patch <file> … <app flags>`。 | 已判定 resolved |
| P-8.3 | `--profile <name>` 为**必填**：裸 `dsh --patch ./cordis.yml` 报 `error: --profile <name> is required`（退出码 1）；不存在默认 profile。`headless` 需要 LLM 凭据，无法用于无凭据冒烟。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §5 P-8.3 | 设计如此：dsh 没有默认 profile；`web` 是 `--profile web` 的别名。 | 始终传 `--profile web`；`web --port 0`（操作系统分配空闲端口）+ 就绪行 `dsh web: http://127.0.0.1:<port>` + SIGTERM（退出码 0）是干净的有界冷启动。 | 已判定 resolved |
| P-8.4 | 插件 `name` 从 **profile 目录**（`$DSH_HOME/profiles/<name>/`）解析，绝不从 cwd、也绝不从覆盖层所在目录解析。相对路径锚定 profile 目录（对仓库根下的覆盖层无用）；`workspace:` 协议不是合法说明符。无法解析的 name 会以 Node 原生未捕获拒绝使启动崩溃（`ERR_MODULE_NOT_FOUND … imported from /tmp/…/dsh/profiles/web/`），退出码 1。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §4-F3（逐字错误）、§5 P-8.4 | 裸说明符从 profile 目录起向上遍历 `node_modules`；模块可解析性只在启动时检查，`--dump-config` 不检查。 | 先把插件装进 profile：`dsh plugin --profile <name> add <dir>`（pnpm 转发；本地目录成为 `link:` 依赖；零依赖包可离线工作）。cold-start.sh 始终执行真实启动（阶段 B），绝不只信阶段 A。 | 已判定 resolved |
| P-8.5 | 补丁 schema 是**宽松**的：insert 行上的未知键（`bogusField: 123`）被静默接受并逐字回显进组合转储；启动正常。因此已知键的拼写错误会静默改变语义而不是报错。硬失败只有：文件不可读、YAML 解析失败、顶层非数组、id 重复（缺 `id` 则自动生成随机值）。 | [task-4 日志](../.omo/evidence/task-4-mvp-implementation.log) §4-F2、§5 P-8.5 | 手写的宽松解析；`PatchOptions` 带索引签名；覆盖层路径上没有任何针对未知键的 schema 校验。 | `--dump-config` 及其 stderr 是唯一随附的检查面；覆盖层改动按代码评审对待；cold-start.sh 阶段 A 断言钉住期望行的精确文本。 | wontfix |
| P-1.1 | **假设成立（探针结论，非故障）。** 问题：scratch 插件能否在与官方 4 模式相同的层级注册第 5 个运行模式预设？在 rc.6 上实证为**能**：`--patch` 插件内调用 `ctx.agentPresets.copy('standard', 'concerto', …)` 落盘到 `$DSH_HOME/.agent-presets/concerto/`，且 `POST /api/agentPreset.list`（Web UI 选择器自用的接口）把 `concerto`（`trust:"user"`）与 standard/code/minimal/cordis（`trust:"system"`）列在同一个 roster 数组中。 | [task-5 证据](../.omo/evidence/task-5-mvp-implementation.md) §1 引证 1-7（逐字启动日志 + RPC 响应）；`scripts/p1-preset-probe.sh` PASS | 模式注册表是**开放**的：基于文件系统 root 的发现（`list()` 无缓存、`includeUserRoot` 默认 true 追加 `$DSH_HOME/.agent-presets`）+ 官方创作写口 `ctx.agentPresets.copy()`；客户端 roster 由数据驱动，不是硬编码枚举。 | 不需要——**判定：register-branch**。PRD §4.4 回退方案（omo profile + 启动脚本）**不执行**；T6 注册真实的第 5 模式。 | 已判定 resolved（register-branch） |
| P-1.2 | 官方 4 模式的本地化显示名是**客户端硬编码**的，仅覆盖 `system` 预设（`BUILT_IN_PRESET_KEYS` 恰好只有 standard/code/minimal/cordis）。插件注册的预设无法进入该语言表，只能用自己的 `preset.yml` 的 `name`/`description` 渲染（探针实证：`concerto` 显示为 `演奏模式 (Concerto P-1 spike)`）。 | [task-5 证据](../.omo/evidence/task-5-mvp-implementation.md) §1 引证 4 + 逐字 RPC 响应；`ui-agent-preset/src/client/locales.ts:169-174,186-191` | `presetDisplayText()` 仅当 `trust === 'system'` 且 id 属于 4 个内置项时才查本地化文案；其余一律按设计回退到 `preset.name ?? preset.id`。 | 在预设自带的 `preset.yml` 中提供显示名/描述（`copy(from, id, name?)` 创作调用会写入）——展示层优雅降级，能力面不受影响。 | 已判定 resolved（回退即设计） |

# dsh-topic-guard

Topic-Aware Workspace Memory for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：
将用户的会话上下文组织为**可版本化、可跨会话复用的 Topic 资产**，用规则级漂移检测 + 非阻塞 Inline Chip 实现"人机协同的上下文治理"。

[English](README.md) | 中文 | [使用手册](USAGE.zh.md)

## 背景与定位

Agent 上下文的瓶颈不是算力，而是缺乏语义拓扑：跨 Topic 的重复历史与无结构垃圾稀释了注意力、阻碍知识沉淀。
本插件把"Topic 管理"做成 Harness 的一等公民模块（不侵入 Agentic Loop）：

- **用户主权**：Topic 边界由用户确认（Chip 点选 / /t 命令），模型只给建议；
- **非阻塞交互**：漂移建议以 Inline Chip 展示（3 秒自动消失、不抢焦点），严禁阻塞式弹窗；
- **资产化**：Topic 及配套资料脱离 Session 生命周期，落盘为可提交 Git 的项目资产。

## 功能

### 数据层（Workspace Memory）

默认存储根 `~/.dsh/topics/`（config `rootDir` 可覆盖为项目目录以便 Git 提交）：

```
<root>/
├── index.json              # Topic 注册表 + 会话→Topic 映射
└── <topicId>/
    ├── topic.json          # id / domain / goal / status / edges / sessions
    ├── summary.md          # 用户确认的结构化摘要
    └── artifacts/
        └── manifest.json   # 关键文件引用 / 日志片段 / 决策记录
```

- `topic.json` 的 JSON Schema 见 `schema/topic.schema.json`（draft 2020-12）；
- 关联边支持 `causal`（因果）/ `hierarchical`（层级）；
- 全部写入为原子写（临时文件 + rename），id 白名单防路径穿越。

### 控制层（TopicManager）

**Drift Detector（规则级，非 LLM）**——实现为会话投影单元（key `topic-guard`），纯 fold 驱动、可断线重算：

| 信号 | 来源 | 权重（默认） |
|---|---|---|
| 关键词命中 | user/message 命中配置关键词 | 25/次（封顶 75） |
| 文件路径突变 | tool/call 参数路径族跳出已见簇 | 30 |
| 工具切换 | 工具族（code/shell/web/subagent/…）窗口内突变 | 20 |

总分 ≥ 阈值（默认 50）产出建议；同窗口只建议一次；用户显式动作（/t new|switch|ignore 等）重置冷却。

**Router（/t 命令族）**：

```
/t new <名称> [--domain <域>]      创建 Topic（Attributor 自动抓取资料）
/t switch <id>                     切换会话活跃 Topic
/t merge <a> <b> [--into <c>]      合并（b 归档，摘要拼接、资料去重、记 causal 边）
/t list                            列出全部 Topic（* = 当前会话）
/t show [id]                       查看详情（json/摘要/资料）
/t edit <id> <摘要文本...>         确认摘要（draft → active）
/t inject [id]                     把当前 Topic 摘要注入会话上下文（agent.inject）
/t link <a> <b> [--type causal|hierarchical]  建立关联边
/t dump [list|show <id>]            输出 JSON（客户端面板数据源）
/t ignore                          放弃当前漂移建议
/t rm <id>                         删除 Topic
```

**Attributor**——/t new 时扫描会话日志尾部，把关键文件路径与截断的工具输出片段结构化入资料抽屉（去重、限量）。

### 交互层（Inline Chip + 常驻 Topic 面板 + 资料抽屉）

客户端 bundle（`lib/client.js`）把漂移建议渲染在 `conversation.input.dock`（composer 卡片上方独立行）：

- "检测到可能的新话题：<候选>，[新建] [忽略]"，**3 秒自动消失**，不抢焦点；
- 桥接：服务端投影单元 → `session/projection` 帧实时推送（永不落盘、重连重算）；
- [新建] → `/t new <候选>`，[忽略] → `/t ignore`（经 `session.command` 回传，command/run 事件同时清除服务端建议）。

**常驻 Topic 面板（二期）**：

- **入口**：会话标题旁的 `◈ 当前Topic` 按钮，以及侧栏底部的 `Topics` 按钮；
- **列表视图**：全部 Topic（id/状态/目标，当前会话的带高亮），点击行进入详情；
- **详情视图（资料抽屉）**：域/目标/关联边 + 用户可编辑的摘要（保存即 /t edit）+ 关键文件引用 + 工具输出片段 + [设为当前][返回列表][删除]；
- **数据通道**：`/t dump list|show <id>` 输出单行 JSON，客户端经 mux 流配对 `command/done` 取回渲染（无需新增宿主 RPC）。

## 安装

### 1. 部署到 profile

``bash
# 构建（tsc + 客户端拷贝）
pnpm build            # 或 npm run build
# 部署到 web profile
cmd /c reinstall-topic-guard.cmd    # Windows
```

### 2. 挂载（`~/.dsh/profiles/web/cordis.patch.yml`）

``yaml
- insert:
    - id: topic-guard
      name: 'dsh-topic-guard'
      config:
        enabled: true
        # rootDir: 'C:/path/to/project/.harness'   # 可选：项目目录（随 Git 提交）
        drift:
          threshold: 50
          weights: { keyword: 25, pathJump: 30, toolSwitch: 20 }
          keywords:
            SQL优化: ['sql', '索引', '慢查询']
          cooldownMessages: 3
```

重启 `dsh web`（新增客户端 bundle 需重建引导图）。

## 配置项

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `rootDir` | string | `~/.dsh/topics` | 记忆存储根 |
| `enabled` | boolean | true | 总开关 |
| `drift.threshold` | number | 50 | 建议触发阈值 |
| `drift.weights.keyword` | number | 25 | 关键词命中权重 |
| `drift.weights.pathJump` | number | 30 | 路径族突变权重 |
| `drift.weights.toolSwitch` | number | 20 | 工具族切换权重 |
| `drift.keywords` | Record<string, string[]> | {} | 候选主题名 → 关键词列表 |
| `drift.cooldownMessages` | number | 3 | 建议冷却（条） |

## 工作原理

服务端为 cordis 插件（ESM + tsc），客户端为手写 classic script（`window.__ModuleLoader__.load` 注册，
无构建链依赖）。漂移检测是会话投影单元：订阅 `session/event`（user/message、tool/call、command/run），
规则级加权计分产出建议，经 `session/projection` 帧实时推给浏览器端 Chip。

### 上下文管理（三期）

- **上下文查看器**：面板「上下文」标签页展示当前会话发送给模型的上下文构成——用户输入/模型回复/工具调用/注入上下文（AGENTS、技能等）/压缩摘要的条数与估算 token、最近上下文预览；
- **话题关联**：面板「关联」标签页按"最近用户输入 + 工具调用"特征匹配已定义 Topic，显示命中得分，一键设为当前；
- **Topic 注入**：服务端在 agent 作用域注册 systemPrompt context——每次模型请求组装时自动注入当前活跃 Topic（id/域/目标/摘要前 600 字），`/t` 命令后刷新缓存。模型始终感知当前话题边界，聚焦相关目标。

> 边界：真正"按 Topic 裁剪历史消息"需要 harness 内核开放请求级 surface 修改钩子（当前第三方插件不可达）；本插件以"入口纪律 + Topic 注入聚焦 + 内核 compaction"组合逼近规格预期收益。

## 边界与路线图

- **"Agent 仅加载 Topic 摘要"是近似实现**：DSH 目前无按主题裁剪投影的内核机制，本插件以 `/t inject`（agent.inject 摘要）逼近；真正的裁剪属 harness 内核演进。
- **常驻 Topic 面板 / 资料抽屉**（规格 §3.1）已落地（二期）：会话标题旁 `◈` 按钮 + 侧栏底部 `Topics` 按钮 + 浮层面板。
- **投影校验器**：目标 profile 未装 zod，stateSchema/viewSchema 用形状校验器替代（仅 `.parse(v)`）；引入 zod 后可升级。
- **Chip 为渐进增强**：服务端（/t 命令 + 数据层）不依赖客户端；客户端加载失败不影响会话。

## 开发

``bash
pnpm install          # typescript + 类型依赖
pnpm build            # tsc（lib/*.js + d.ts）+ 拷贝客户端 bundle
pnpm verify-sync      # src/lib 漂移检查
pnpm smoke            # 核心逻辑冒烟（Node ≥24 原生类型剥离，无需构建）
```

## 许可证

MIT


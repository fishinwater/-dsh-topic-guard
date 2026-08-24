# dsh-topic-guard 使用手册

> Topic-Aware Workspace Memory：把会话上下文组织为可版本化、跨会话复用的 Topic 资产。
> 本文档描述当前版本（v0.2+，三期上下文管理）的实际功能与用法。

## 一、插件是什么

面向 DeepSeek Harness（dsh web）的插件，解决三个问题：

1. **上下文无结构**——会话内容线性堆积，知识无法沉淀；
2. **垃圾上下文**——跨话题的重复历史稀释注意力、浪费 token；
3. **黑盒压缩**——压缩机制只按预算裁剪，不理解语义。

方案：把"Topic（话题）"提升为一等公民——规则级漂移检测 + 非阻塞提示 + 用户确认 + 结构化资产 + 上下文注入。

## 二、安装部署

### 1. 部署到 profile

```bash
cd .dsh-plugins/dsh-topic-guard
pnpm build                    # tsc 服务端 + 客户端 bundle 拷贝
cmd /c reinstall-topic-guard.cmd   # 拷贝到 ~/.dsh/profiles/node_modules/dsh-topic-guard
```

### 2. 挂载（~/.dsh/profiles/web/cordis.patch.yml）

```yaml
- insert:
    - id: topic-guard
      name: dsh-topic-guard
      config:
        enabled: true
        # rootDir: C:/path/to/project/.harness   # 可选：改存储根（默认 ~/.dsh/topics）
        drift:
          threshold: 50
          weights: { keyword: 25, pathJump: 30, toolSwitch: 20 }
          keywords:
            数据库优化: [sql, 索引, 慢查询]
          cooldownMessages: 3
          autoSuggestAfterMessages: 3
```

### 3. 重启

**必须重启 dsh web 进程**（客户端 bundle 加入引导图）→ 浏览器**硬刷新**（Ctrl+F5）。

## 三、快速开始（日常用法）

### 场景 A：新会话自动引导（推荐）

1. 开一个新会话，正常聊天 **3 轮**（未手动创建 Topic）；
2. 输入框上方出现提示：`当前会话尚未绑定 Topic，建议创建：<会话标题>`；
3. 点 **[创建]** → 自动生成 Topic 并绑定当前会话（聊天里出现结果卡片）；
4. 提示**需你处理才消失**（点 [创建]/[忽略]）——不会自动消失；
5. 点 **[忽略]** → 提示消失，过冷却期后如仍未绑定会再次建议。

### 场景 B：手动创建

```
/t new 订单模块 --domain order
/t edit 订单模块 统一订单查询与状态机，核心是 order_service 重构
/t list
```

### 场景 C：面板管理（图形界面）

1. 侧栏底部 **Topics** 按钮，或会话标题旁 **◈ Topic** 按钮，打开面板；
2. 「话题」标签：全部 Topic 列表（当前会话的高亮）→ 点行进详情：
   - 编辑摘要（保存 = /t edit）
   - 关键文件引用、工具输出片段（Attributor 自动抓取）
   - [设为当前] [删除]
3. 「上下文」标签：当前会话**发送给模型的上下文构成**（用户输入/模型回复/工具调用/注入上下文/压缩摘要的条数与估算 token）+ 最近预览；
4. 「关联」标签：按当前上下文特征（最近用户输入+工具调用）匹配已定义 Topic，显示命中得分，一键 [设为当前]。

### 场景 D：漂移检测（跨话题切换）

同一个会话里话题明显切换（关键词命中、文件路径跳出、工具族变化）时，出现：
`检测到可能的新话题：<候选> [新建] [忽略]`——点 [新建] 即创建并绑定新 Topic。

## 四、命令参考（/t 命令族）

在聊天框输入（以 / 开头会被**本地执行**，不会发给模型）：

```
/t                       列出全部 Topic（* = 当前会话）
/t new <名称> [--domain <域>]    创建 Topic（Attributor 自动抓取文件/日志）
/t switch <id>           切换会话活跃 Topic
/t merge <a> <b> [--into <c>]    合并（b 归档：摘要拼接、资料去重、记 causal 边）
/t list                  列出全部
/t show [id]             查看详情（域/目标/关联边/摘要/资料）
/t edit <id> <摘要文本>   确认摘要（支持多行，draft → active）
/t inject [id]           把摘要注入当前会话上下文
/t link <a> <b> [--type causal|hierarchical]  建立关联边
/t dump [list|show <id>] 输出 JSON（客户端面板数据源）
/t ignore                放弃当前提示（chip 的 [忽略]）
/t rm <id>               删除 Topic
/t help                  用法
```

兼容命令：`/topic <标题>` 直接重命名会话标题（不弹窗）。

## 五、界面入口汇总

| 入口 | 位置 | 行为 |
|---|---|---|
| Inline Chip | 输入框上方 | 漂移建议 / 自动建议创建；需用户处理才消失 |
| ◈ Topic 按钮 | 会话标题旁（蓝色高亮） | 打开面板（当前会话） |
| Topics 按钮 | 侧栏底部 | 打开面板（当前会话） |
| 面板 | 浮层 | 话题 / 上下文 / 关联 三标签 |

## 六、配置项

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| rootDir | string | ~/.dsh/topics | 记忆存储根（可指向项目目录随 Git 提交） |
| enabled | boolean | true | 总开关 |
| drift.threshold | number | 50 | 漂移触发阈值 |
| drift.weights.keyword | number | 25 | 关键词命中权重 |
| drift.weights.pathJump | number | 30 | 路径族突变权重 |
| drift.weights.toolSwitch | number | 20 | 工具族切换权重 |
| drift.keywords | object | {} | 候选名 → 关键词列表（需按项目配置） |
| drift.cooldownMessages | number | 3 | 建议冷却（条） |
| drift.autoSuggestAfterMessages | number | 3 | 新会话未绑定 Topic 时自动建议的消息数阈值 |

## 七、数据存储（~/.dsh/topics/）

```
~/.dsh/topics/
├── index.json                # Topic 注册表 + 会话→Topic 映射
└── <topicId>/
    ├── topic.json            # id / domain / goal / status / edges / sessions（JSON Schema 见 schema/topic.schema.json）
    ├── summary.md            # 用户确认的结构化摘要
    └── artifacts/manifest.json  # 关键文件引用 / 工具输出片段
```

- 全部写入原子化（临时文件 + rename），topic id 白名单防路径穿越；
- 可把 rootDir 指向项目目录（如 `.harness`），随 Git 提交实现团队级知识沉淀。

## 八、自动注入（上下文管理）

绑定 Topic 后，**每次模型请求组装时自动注入**：

```
【当前 Topic：订单模块】（order）
目标：统一订单查询与状态机
摘要：...（前 600 字）
```

模型始终感知当前话题边界，聚焦相关目标（多会话隔离，互不污染）。

## 九、工作原理（简述）

1. **Drift Detector** = 会话投影单元（纯 fold）：订阅 user/message、tool/call、command/run、session/title 事件，规则级加权计分产出建议；
2. **建议推送** = session/projection 帧（实时、永不落盘、断线重算）；
3. **Chip 回传** = /t new|ignore 命令（本地执行，不进模型）；
4. **面板数据** = /t dump 单行 JSON（客户端经 remote.commands 直接取结果）；
5. **上下文注入** = agent 作用域 systemPrompt.context（每次请求组装时同步读取缓存）。

## 十、边界与已知限制

1. **"按 Topic 裁剪历史消息"暂不可达**：DSH 内核未开放请求级 surface 修改钩子；当前以"入口纪律（文件引用）+ Topic 注入聚焦 + 内核 compaction 预算压缩"组合逼近；
2. **关键词规则需按项目配置**：默认无关键词，漂移主要靠路径/工具族信号；auto-suggest 不依赖关键词；
3. **Chip 为渐进增强**：服务端（命令/数据层/注入）不依赖客户端；客户端加载失败不影响会话；
4. **多轮调优过的已知坑**（遇问题先看）：改代码需重启进程 + 硬刷新；面板/按钮问题先查 F12 Console 报错；/t 命令带参数需命令已注册且声明 input（已修复）。

## 十一、故障排查

| 现象 | 处理 |
|---|---|
| 无按钮/无 Chip | 重启 dsh web + 硬刷新；确认 profile 内 lib/client.js 为最新（字节数参考 30960） |
| 面板「上下文」空白 | 确认会话有内容；F12 Console 报错存 logs/error.txt |
| /t 命令无响应 | 聊天框直接输入（命令本地执行）；确认已重启加载新服务端 |
| 注入不生效 | /t new 或 /t switch 绑定 Topic 后下一次请求生效 |

## 十二、开发与测试

```bash
pnpm build            # 构建
pnpm smoke            # 核心逻辑冒烟（43 项，Node ≥ 24 原生类型剥离）
pnpm verify-sync      # src/lib 漂移检查
```

源码结构：src/memory（数据层）/ src/manager（drift/router/attributor）/ src/index.ts（装配）/ src/client.js（浏览器端）。



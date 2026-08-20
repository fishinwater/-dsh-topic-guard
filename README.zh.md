# dsh-topic-guard

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供会话主题确认：每 N 条用户消息弹窗确认当前会话主题，并注册全局 `/topic` 命令，随时设置或重命名会话主题。

[English](README.md) | 中文

## 功能

- **自动主题检查**——每 N 条真人消息（默认 `5`）弹窗询问会话是否已切换到新主题。
- **弹窗选项**——继续当前会话 / 重命名当前会话（输入新标题）/ 建议新建会话。
- **`/topic` 命令**——`/topic` 手动弹窗；`/topic 新标题` 直接改名。
- **非侵入**——15 秒去抖；`enabled: false` 可关闭；失败仅记日志，不打断 agent 循环。
- **仅真人触发**——只统计直接输入（`source.kind === 'user'`）；注入的上下文（文件通知、Skill、目标续跑）永不弹窗。

## 安装

需要 [dsh CLI](https://github.com/deepseek-ai/deepseek-harness)：

```bash
# 从 npm（发布后）
dsh plugin --profile web add dsh-topic-guard

# 或直接从 GitHub
dsh plugin --profile web add github:fishinwater/dsh-topic-guard
```

然后在 profile 的 `cordis.patch.yml` 中挂载：

```yaml
- insert:
    - id: topic-guard
      name: 'dsh-topic-guard'
      config:
        checkEvery: 5
        enabled: true
```

重启 `dsh web`（或依赖 profile patch 热重载）。

## 配置项

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `checkEvery` | number | 5 | 每多少条真人消息弹窗 |
| `enabled` | boolean | true | 自动弹窗总开关 |
| `topicQuestion` | string | 见源码 | 自动弹窗的问题文本 |
| `topicKeepLabel` | string | 见源码 | "继续当前会话"选项文案 |
| `topicRenameLabel` | string | 见源码 | "重命名会话"选项文案 |
| `topicNewLabel` | string | 见源码 | "建议新建会话"选项文案 |

## 使用

- 聊天中输入 `/topic` 打开确认弹窗。
- 输入 `/topic 订单模块优化` 直接重命名当前会话主题。

## 工作原理

插件监听根上下文 `session/event` 事件流（fire-and-forget，绝不阻塞 agent 循环），只统计真人直接输入，达到阈值时调用 `ctx.userQuestions.ask()`。选中的标题通过 `ctx.sessionTitle.rename()` 钉住。命令通过 `ctx.commands` 注册。

## 开发

```bash
pnpm install
pnpm build        # tsc: src/index.ts -> lib/index.js + lib/index.d.ts
pnpm verify-sync  # 粗略的 src/lib 漂移检查
```

## 许可证

MIT

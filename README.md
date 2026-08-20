# dsh-topic-guard

Topic confirmation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): pops a dialog to confirm the current session topic every N user messages, and registers the global `/topic` command to set or rename the session topic at any time.

English | [中文](README.zh.md)

## Features

- **Automatic topic check** — every N direct user messages (default `5`), a dialog asks whether the conversation has drifted to a new topic.
- **Dialog options** — keep going / rename this session (type a new title) / start a fresh session.
- **`/topic` command** — `/topic` pops the dialog manually; `/topic <title>` renames the session directly.
- **Non-intrusive** — 15-second debounce, `enabled: false` to disable, failures are logged without interrupting the agent loop.
- **Human-only trigger** — counts direct prompts (`source.kind === 'user'`); injected context (file notices, skills, goal continuations) never pops the dialog.

## Install

With the [dsh CLI](https://github.com/deepseek-ai/deepseek-harness) available:

```bash
# From npm (once published)
dsh plugin --profile web add dsh-topic-guard

# Or directly from GitHub
dsh plugin --profile web add github:fishinwater/dsh-topic-guard
```

Then mount it in your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: topic-guard
      name: 'dsh-topic-guard'
      config:
        checkEvery: 5
        enabled: true
```

Restart `dsh web` (or rely on the profile patch hot-reload).

## Configuration

| Key | Type | Default | Meaning |
|---|---|---|---|
| `checkEvery` | number | 5 | Pop the dialog after this many direct user messages |
| `enabled` | boolean | true | Master switch for the automatic dialog |
| `topicQuestion` | string | (see source) | Question text of the automatic dialog |
| `topicKeepLabel` | string | (see source) | Label of the "keep going" option |
| `topicRenameLabel` | string | (see source) | Label of the "rename session" option |
| `topicNewLabel` | string | (see source) | Label of the "start a fresh session" option |

## Usage

- Send `/topic` in the chat to open the confirmation dialog.
- Send `/topic 订单模块优化` to rename the current session topic directly.

## How it works

The plugin listens on the root `session/event` feed (fire-and-forget — it never blocks the agent loop), counts only direct human prompts, and calls `ctx.userQuestions.ask()` when the threshold is reached. Selected titles are pinned via `ctx.sessionTitle.rename()`. The command is registered through `ctx.commands`.

## Development

```bash
pnpm install
pnpm build        # tsc: src/index.ts -> lib/index.js + lib/index.d.ts
pnpm verify-sync  # heuristic src/lib drift check
```

## License

MIT

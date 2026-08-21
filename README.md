# dsh-topic-guard

Topic-Aware Workspace Memory for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
organize session context into versionable, cross-session-reusable **Topic assets** — with rule-based drift detection and a non-blocking Inline Chip for human-in-the-loop context governance.

English | [中文](README.zh.md)

## Positioning

The bottleneck of agent context is not compute but missing semantic topology: cross-topic repeated history and unstructured noise dilute attention and block knowledge accumulation.
This plugin promotes Topic management to a first-class module of the harness (never intruding on the agentic loop):

- **User agency** — topic boundaries are confirmed by the user (chip click / /t commands); the model only suggests;
- **Non-blocking UX** — drift suggestions render as an Inline Chip (auto-dismiss in 3s, no focus steal); blocking modals are forbidden;
- **Assetization** — topics and their artifacts outlive sessions, persisted as Git-committable project assets.

## Features

### Data layer (Workspace Memory)

Default root `~/.dsh/topics/` (override with config `rootDir`, e.g. a project dir for Git commits):

```
<root>/
├── index.json              # topic registry + session→topic mapping
└── <topicId>/
    ├── topic.json          # id / domain / goal / status / edges / sessions
    ├── summary.md          # user-confirmed structured summary
    └── artifacts/
        └── manifest.json   # key file references / log snippets / decisions
```

- JSON Schema for `topic.json`: `schema/topic.schema.json` (draft 2020-12);
- Edges support `causal` / `hierarchical`;
- All writes are atomic (tmp file + rename); topic ids are whitelisted against path traversal.

### Control layer (TopicManager)

**Drift Detector (rule-based, non-LLM)** — implemented as a session projection unit (key `topic-guard`), a pure fold, replay-safe:

| Signal | Source | Weight (default) |
|---|---|---|
| Keyword hit | user/message matches configured keywords | 25/hit (capped 75) |
| Path jump | tool/call argument path family leaves the seen cluster | 30 |
| Tool switch | tool family (code/shell/web/subagent/…) flips within a window | 20 |

Total ≥ threshold (default 50) produces a suggestion; at most one per window; explicit user actions (/t new|switch|ignore …) reset the cooldown.

**Router (/t command family)**:

```
/t new <name> [--domain <d>]      create topic (Attributor auto-captures artifacts)
/t switch <id>                    switch the session active topic
/t merge <a> <b> [--into <c>]     merge (b archived; summaries joined, artifacts deduped, causal edge recorded)
/t list                           list all topics (* = current session)
/t show [id]                      show details (json / summary / artifacts)
/t edit <id> <summary text...>    confirm the summary (draft → active)
/t inject [id]                    inject the topic summary into the session context (agent.inject)
/t link <a> <b> [--type causal|hierarchical]  add an edge
/t dump [list|show <id>]            emit JSON (client panel data source)
/t ignore                         drop the pending drift suggestion
/t rm <id>                        delete a topic
```

**Attributor** — on /t new, scans the session log tail and structures key file paths + truncated tool output snippets into the artifacts manifest (deduped, capped).

### Interaction layer (Inline Chip + persistent Topic panel + Context drawer)

The client bundle (`lib/client.js`) renders drift suggestions into `conversation.input.dock` (the strip above the composer card):

- "Possible new topic: <candidate> — [Create] [Ignore]", **auto-dismiss in 3s**, never steals focus;
- Bridge: server projection unit → `session/projection` frames (live push, never persisted, replay-safe);
- [Create] → `/t new <candidate>`; [Ignore] → `/t ignore` (submitted via `session.command`; the `command/run` event also clears the server-side suggestion).

**Persistent Topic panel (phase 2)**:

- **Entries**: the `◈ <current topic>` button beside the session title, and the `Topics` button at the sidebar foot;
- **List view**: all topics (id / status / goal; the current session's is highlighted), click a row to open details;
- **Detail view (Context drawer)**: domain / goal / edges + an editable summary (save = /t edit) + key file references + tool output snippets + [Set active] [Back] [Delete];
- **Data channel**: `/t dump list|show <id>` emits single-line JSON; the client pairs `command/done` over the mux stream to fetch it for rendering (no new host RPC needed).

## Install

### 1. Deploy to the profile

```bash
pnpm build            # tsc + client bundle copy
cmd /c reinstall-topic-guard.cmd    # Windows: copy into ~/.dsh/profiles/node_modules/dsh-topic-guard
```

### 2. Mount (`~/.dsh/profiles/web/cordis.patch.yml`)

```yaml
- insert:
    - id: topic-guard
      name: dsh-topic-guard
      config:
        enabled: true
        # rootDir: C:/path/to/project/.harness   # optional: project dir (Git-committable)
        drift:
          threshold: 50
          weights: { keyword: 25, pathJump: 30, toolSwitch: 20 }
          keywords:
            SQL优化: [sql, 索引, 慢查询]
          cooldownMessages: 3
```

Restart `dsh web` (a new client bundle requires the boot graph to be recomposed).

## Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `rootDir` | string | `~/.dsh/topics` | memory store root |
| `enabled` | boolean | true | master switch |
| `drift.threshold` | number | 50 | suggestion threshold |
| `drift.weights.keyword` | number | 25 | keyword weight |
| `drift.weights.pathJump` | number | 30 | path-jump weight |
| `drift.weights.toolSwitch` | number | 20 | tool-switch weight |
| `drift.keywords` | Record<string, string[]> | {} | candidate → keywords |
| `drift.cooldownMessages` | number | 3 | suggestion cooldown (messages) |

## How it works

Server side is a cordis plugin (ESM + tsc); the client is a hand-written classic script (`window.__ModuleLoader__.load` registration, no build-chain dependency). Drift detection is a session projection unit: it subscribes to `session/event` (user/message, tool/call, command/run), scores signals by rules, and pushes suggestions to the browser chip over `session/projection` frames.

## Boundaries & roadmap

- **"Agent loads only the topic summary" is an approximation**: DSH has no kernel-level topic-scoped projection today; this plugin approximates with `/t inject` (agent.inject). Real pruning belongs to harness core evolution.
- **Persistent Topic panel / Context drawer** (spec §3.1) are shipped (phase 2): `◈` header button + `Topics` sidebar-foot button + floating panel.
- **Projection validators**: the target profile ships no zod; stateSchema/viewSchema use shape validators (only `.parse(v)` is called). Upgrade to strict schemas when zod is available.
- **The Chip is progressive enhancement**: the server half (/t commands + data layer) works without the client; a client failure never blocks sessions.

## Development

```bash
pnpm install          # typescript + type deps
pnpm build            # tsc (lib/*.js + d.ts) + client bundle copy
pnpm verify-sync      # src/lib drift check
pnpm smoke            # core logic smoke (Node ≥ 24 native type stripping, no build needed)
```

## License

MIT


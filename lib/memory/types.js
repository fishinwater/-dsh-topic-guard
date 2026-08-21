/**
 * Topic-Aware Workspace Memory — data-layer types.
 *
 * Mirrors the spec's `.harness/topics/` layout:
 *
 *   <root>/
 *   ├── index.json          # topic registry + session→topic mapping
 *   └── <topicId>/
 *       ├── topic.json      # id / domain / goal / status / edges / sessions
 *       ├── summary.md      # user-confirmed structured summary
 *       └── artifacts/
 *           └── manifest.json  # key file references / log snippets / decisions
 *
 * Per user decision the root defaults to the global `~/.dsh/topics/` (config
 * `rootDir` overridable to a project directory for the Git-commit use case).
 */
export {};

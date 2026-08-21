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

/** 关联边类型：Causal（因果）/ Hierarchical（层级） */
export type TopicEdgeType = 'causal' | 'hierarchical';

export interface TopicEdge {
  /** 边类型。 */
  type: TopicEdgeType;
  /** 目标 topic id。 */
  target: string;
}

export type TopicStatus = 'draft' | 'active' | 'archived';

/** topic.json 结构。 */
export interface Topic {
  /** kebab-case id（允许 CJK，见 memory/paths.ts slugId）。 */
  id: string;
  /** 业务域（如 db / frontend / infra）。 */
  domain: string;
  /** 目标描述。 */
  goal: string;
  /** draft=已创建未确认摘要；active=摘要已确认；archived=已合并/归档。 */
  status: TopicStatus;
  /** 关联边（Causal/Hierarchical）。 */
  edges: TopicEdge[];
  /** 关联过的会话 id（跨会话资产化的证据）。 */
  sessionIds: string[];
  /** 创建时间（epoch ms）。 */
  createdAt: number;
  /** 更新时间（epoch ms）。 */
  updatedAt: number;
}

/** index.json 结构。 */
export interface TopicIndex {
  version: 1;
  /** topicId → Topic（全量注册表）。 */
  topics: Record<string, Topic>;
  /** sessionId → topicId（会话活跃主题映射，跨会话复用）。 */
  sessionTopics: Record<string, string>;
}

/** artifacts/manifest.json 条目类型。 */
export type ArtifactKind = 'file' | 'log' | 'decision';

export interface ArtifactEntry {
  /** file=关键文件引用；log=工具输出片段；decision=决策记录。 */
  kind: ArtifactKind;
  /** file 的文件路径；log 的来源标识（如 tool callId）。 */
  path?: string;
  /** log 的截断片段；decision 的记录文本。 */
  snippet?: string;
  /** 来源事件 seq（用于去重与回溯）。 */
  seq?: number;
  /** 捕获时间（epoch ms）。 */
  capturedAt: number;
}

export interface ArtifactManifest {
  version: 1;
  entries: ArtifactEntry[];
}

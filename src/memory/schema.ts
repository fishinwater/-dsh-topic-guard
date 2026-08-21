/**
 * topic.json JSON Schema（draft 2020-12）。
 *
 * 权威版本维护在仓库顶层 `schema/topic.schema.json`（可提交 Git，供外部工具校验）；
 * 本文件导出同一份结构，供 store 写入前做基础形状校验。
 */

/** JSON Schema：topic.json。 */
export const TOPIC_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/fishinwater/-dsh-topic-guard/schema/topic.schema.json',
  title: 'Topic',
  description: 'dsh-topic-guard 主题资产 topic.json',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'domain', 'goal', 'status', 'edges', 'sessionIds', 'createdAt', 'updatedAt'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[a-z0-9\\u4e00-\\u9fff][a-z0-9\\u4e00-\\u9fff-]{0,63}$',
      description: 'kebab-case id，允许 CJK',
    },
    domain: { type: 'string', description: '业务域' },
    goal: { type: 'string', description: '目标描述' },
    status: { type: 'string', enum: ['draft', 'active', 'archived'] },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'target'],
        properties: {
          type: { type: 'string', enum: ['causal', 'hierarchical'] },
          target: { type: 'string' },
        },
      },
    },
    sessionIds: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'number', description: 'epoch ms' },
    updatedAt: { type: 'number', description: 'epoch ms' },
  },
} as const;

/**
 * 轻量运行时校验器。返回 `.parse` 兼容对象（投影注册表的 stateSchema/viewSchema
 * 只调用 `.parse(v)`，而目标 profile 未装 zod——用形状检查替代，避免新增不可解析的依赖）。
 * 失败抛错，成功原样返回。
 */
export function jsonSchemaValidator<T>(label: string, check: (value: unknown) => boolean): {
  parse: (value: unknown) => T;
} {
  return {
    parse(value: unknown): T {
      if (!check(value)) throw new Error(`topic-guard: ${label} 校验失败`);
      return value as T;
    },
  };
}

/** topic.json 形状检查。 */
export function isTopic(value: unknown): value is import('./types.ts').Topic {
  const t = value as Record<string, unknown>;
  return (
    typeof t === 'object' &&
    t !== null &&
    typeof t.id === 'string' &&
    typeof t.domain === 'string' &&
    typeof t.goal === 'string' &&
    (t.status === 'draft' || t.status === 'active' || t.status === 'archived') &&
    Array.isArray(t.edges) &&
    Array.isArray(t.sessionIds) &&
    typeof t.createdAt === 'number' &&
    typeof t.updatedAt === 'number'
  );
}

/** drift 投影状态形状检查（持久化缓存回读安全）。 */
export function isDriftState(value: unknown): boolean {
  const s = value as Record<string, unknown>;
  return (
    typeof s === 'object' &&
    s !== null &&
    (s.suggestion === null || typeof s.suggestion === 'object') &&
    (s.activeTopicId === null || typeof s.activeTopicId === 'string') &&
    typeof s.messageCount === 'number' &&
    typeof s.suggestedAtMessage === 'number' &&
    Array.isArray(s.clusterFamilies) &&
    (s.lastToolFamily === null || typeof s.lastToolFamily === 'string') &&
    typeof s.windowEvents === 'number'
  );
}

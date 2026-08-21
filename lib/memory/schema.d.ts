/**
 * topic.json JSON Schema（draft 2020-12）。
 *
 * 权威版本维护在仓库顶层 `schema/topic.schema.json`（可提交 Git，供外部工具校验）；
 * 本文件导出同一份结构，供 store 写入前做基础形状校验。
 */
/** JSON Schema：topic.json。 */
export declare const TOPIC_JSON_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://github.com/fishinwater/-dsh-topic-guard/schema/topic.schema.json";
    readonly title: "Topic";
    readonly description: "dsh-topic-guard 主题资产 topic.json";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["id", "domain", "goal", "status", "edges", "sessionIds", "createdAt", "updatedAt"];
    readonly properties: {
        readonly id: {
            readonly type: "string";
            readonly pattern: "^[a-z0-9\\u4e00-\\u9fff][a-z0-9\\u4e00-\\u9fff-]{0,63}$";
            readonly description: "kebab-case id，允许 CJK";
        };
        readonly domain: {
            readonly type: "string";
            readonly description: "业务域";
        };
        readonly goal: {
            readonly type: "string";
            readonly description: "目标描述";
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["draft", "active", "archived"];
        };
        readonly edges: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["type", "target"];
                readonly properties: {
                    readonly type: {
                        readonly type: "string";
                        readonly enum: readonly ["causal", "hierarchical"];
                    };
                    readonly target: {
                        readonly type: "string";
                    };
                };
            };
        };
        readonly sessionIds: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly createdAt: {
            readonly type: "number";
            readonly description: "epoch ms";
        };
        readonly updatedAt: {
            readonly type: "number";
            readonly description: "epoch ms";
        };
    };
};
/**
 * 轻量运行时校验器。返回 `.parse` 兼容对象（投影注册表的 stateSchema/viewSchema
 * 只调用 `.parse(v)`，而目标 profile 未装 zod——用形状检查替代，避免新增不可解析的依赖）。
 * 失败抛错，成功原样返回。
 */
export declare function jsonSchemaValidator<T>(label: string, check: (value: unknown) => boolean): {
    parse: (value: unknown) => T;
};
/** topic.json 形状检查。 */
export declare function isTopic(value: unknown): value is import('./types.ts').Topic;
/** drift 投影状态形状检查（持久化缓存回读安全）。 */
export declare function isDriftState(value: unknown): boolean;

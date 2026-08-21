/** 默认根：`~/.dsh/topics`（全局固定目录，用户决策 2）。 */
export declare function defaultRoot(): string;
/** 解析存储根：配置优先，回退默认。 */
export declare function resolveRoot(configured?: string): string;
/**
 * 把任意名称 slug 成安全的 topic id：小写、允许 CJK、连字符分隔。
 * 保证可用于文件系统路径与 JSON Schema pattern。
 */
export declare function slugId(name: string): string;
/** 校验一个既存 topic id 是否合法（防止路径穿越）。 */
export declare function isSafeId(id: string): boolean;

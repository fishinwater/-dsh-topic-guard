/**
 * Root resolution and topic-id sanitization for the workspace memory store.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 默认根：`~/.dsh/topics`（全局固定目录，用户决策 2）。 */
export function defaultRoot(): string {
  const home = process.env.DSH_HOME ?? homedir();
  return join(home, '.dsh', 'topics');
}

/** 解析存储根：配置优先，回退默认。 */
export function resolveRoot(configured?: string): string {
  return configured?.trim() ? configured.trim() : defaultRoot();
}

/**
 * 把任意名称 slug 成安全的 topic id：小写、允许 CJK、连字符分隔。
 * 保证可用于文件系统路径与 JSON Schema pattern。
 */
export function slugId(name: string): string {
  const slug = name
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug.length > 0 ? slug : 'topic';
}

/** 校验一个既存 topic id 是否合法（防止路径穿越）。 */
export function isSafeId(id: string): boolean {
  return /^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]{0,63}$/.test(id);
}

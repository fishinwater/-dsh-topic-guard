/**
 * Attributor — 把上下文中的文件、日志、决策结构化存入资料抽屉（规格 §3.2）。
 *
 * 在 /t new（或 /t switch）时调用：扫描会话日志尾部，提取
 * - file：tool/call 参数中的文件路径（去重）
 * - log：tool/result 的截断输出片段（限量）
 * 决策记录由用户通过 /t edit 写 summary.md 沉淀（规格：用户确认摘要）。
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
import type { ArtifactEntry } from '../memory/types.ts';
export interface AttributionOptions {
    /** 只提取 seq > sinceSeq 的事件（默认取会话开头）。 */
    sinceSeq?: number;
    /** file 条目上限。默认 30。 */
    maxFiles?: number;
    /** log 条目上限。默认 10。 */
    maxLogs?: number;
    /** 日志片段截断字符数。默认 400。 */
    snippetChars?: number;
}
/** 从事件序列提取资料条目（同步、纯函数，便于测试）。 */
export declare function attribute(events: readonly SessionEvent[], opts?: AttributionOptions): ArtifactEntry[];

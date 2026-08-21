/**
 * Attributor — 把上下文中的文件、日志、决策结构化存入资料抽屉（规格 §3.2）。
 *
 * 在 /t new（或 /t switch）时调用：扫描会话日志尾部，提取
 * - file：tool/call 参数中的文件路径（去重）
 * - log：tool/result 的截断输出片段（限量）
 * 决策记录由用户通过 /t edit 写 summary.md 沉淀（规格：用户确认摘要）。
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
import { extractPaths } from './drift.ts';
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

const DEFAULT_OPTS: Required<AttributionOptions> = {
  sinceSeq: -1,
  maxFiles: 30,
  maxLogs: 10,
  snippetChars: 400,
};

/** 提取工具结果文本块（ToolResultMessage 的 content[0]）。 */
function textOfResult(event: SessionEvent & { type: 'tool/result' }): string {
  try {
    const message = (event.data as { message?: unknown }).message as
      | { content?: unknown[] }
      | undefined;
    const block = message?.content?.[0];
    if (typeof block === 'string') return block;
    if (block && typeof block === 'object') {
      const b = block as Record<string, unknown>;
      if (typeof b.text === 'string') return b.text;
    }
    return JSON.stringify(block ?? null);
  } catch {
    return '';
  }
}

/** 从事件序列提取资料条目（同步、纯函数，便于测试）。 */
export function attribute(events: readonly SessionEvent[], opts: AttributionOptions = {}): ArtifactEntry[] {
  const o: Required<AttributionOptions> = { ...DEFAULT_OPTS, ...opts };
  const entries: ArtifactEntry[] = [];
  const seenFiles = new Set<string>();
  const now = Date.now();

  for (const event of events) {
    if (event.seq <= o.sinceSeq) continue;
    if (event.type === 'tool/call') {
      const call = event.data as { name?: string; arguments?: string };
      if (!call?.name) continue;
      for (const raw of extractPaths(call.arguments ?? '')) {
        if (seenFiles.has(raw)) continue;
        seenFiles.add(raw);
        if (entries.filter((e) => e.kind === 'file').length >= o.maxFiles) break;
        entries.push({ kind: 'file', path: raw, seq: event.seq, capturedAt: now });
      }
    } else if (event.type === 'tool/result' && entries.filter((e) => e.kind === 'log').length < o.maxLogs) {
      const text = textOfResult(event as SessionEvent & { type: 'tool/result' });
      if (text && text.trim().length > 0) {
        const snippet = text.length > o.snippetChars ? text.slice(0, o.snippetChars) + '…' : text;
        const callId = (event.data as { message?: { toolCallId?: string } }).message?.toolCallId;
        entries.push({
          kind: 'log',
          path: callId,
          snippet,
          seq: event.seq,
          capturedAt: now,
        });
      }
    }
  }
  return entries;
}

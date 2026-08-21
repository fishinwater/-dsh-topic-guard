import { extractPaths } from "./drift.js";
const DEFAULT_OPTS = {
    sinceSeq: -1,
    maxFiles: 30,
    maxLogs: 10,
    snippetChars: 400,
};
/** 提取工具结果文本块（ToolResultMessage 的 content[0]）。 */
function textOfResult(event) {
    try {
        const message = event.data.message;
        const block = message?.content?.[0];
        if (typeof block === 'string')
            return block;
        if (block && typeof block === 'object') {
            const b = block;
            if (typeof b.text === 'string')
                return b.text;
        }
        return JSON.stringify(block ?? null);
    }
    catch {
        return '';
    }
}
/** 从事件序列提取资料条目（同步、纯函数，便于测试）。 */
export function attribute(events, opts = {}) {
    const o = { ...DEFAULT_OPTS, ...opts };
    const entries = [];
    const seenFiles = new Set();
    const now = Date.now();
    for (const event of events) {
        if (event.seq <= o.sinceSeq)
            continue;
        if (event.type === 'tool/call') {
            const call = event.data;
            if (!call?.name)
                continue;
            for (const raw of extractPaths(call.arguments ?? '')) {
                if (seenFiles.has(raw))
                    continue;
                seenFiles.add(raw);
                if (entries.filter((e) => e.kind === 'file').length >= o.maxFiles)
                    break;
                entries.push({ kind: 'file', path: raw, seq: event.seq, capturedAt: now });
            }
        }
        else if (event.type === 'tool/result' && entries.filter((e) => e.kind === 'log').length < o.maxLogs) {
            const text = textOfResult(event);
            if (text && text.trim().length > 0) {
                const snippet = text.length > o.snippetChars ? text.slice(0, o.snippetChars) + '…' : text;
                const callId = event.data.message?.toolCallId;
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

/** 工具名 → 工具族。 */
const TOOL_FAMILIES = {
    read: 'code',
    write: 'code',
    edit: 'code',
    'str-replace-editor': 'code',
    grep: 'code',
    glob: 'code',
    pwsh: 'shell',
    bash: 'shell',
    terminal: 'shell',
    web_search: 'web',
    'web-search': 'web',
    subagent: 'subagent',
    subagent_fork: 'subagent',
    workflow: 'workflow',
    'tool-workflow': 'workflow',
    goal: 'goal',
    'tool-goal': 'goal',
    ralph: 'ralph',
    // 本 harness 实际暴露的工具名（run_code 承载全部代码执行）
    run_code: 'code',
    'tool-bash': 'shell',
    'tool-pwsh': 'shell',
    'tool-web': 'web',
    'tool-subagent': 'subagent',
};
const FAMILY_LABEL = {
    code: '代码编辑',
    shell: 'Shell 命令',
    web: '网络检索',
    subagent: '子代理',
    workflow: '工作流',
    goal: '目标管理',
    ralph: 'Ralph 循环',
    other: '其他工具',
};
function familyOf(tool) {
    return TOOL_FAMILIES[tool] ?? 'other';
}
/** 从工具参数 JSON 中提取文件路径（file_path/path/workdir/file 字段）。 */
export function extractPaths(argsJson) {
    try {
        const args = JSON.parse(argsJson);
        if (typeof args !== 'object' || args === null || Array.isArray(args))
            return [];
        const out = [];
        for (const key of ['file_path', 'path', 'workdir', 'file']) {
            const value = args[key];
            if (typeof value === 'string' && value.trim().length > 0)
                out.push(value);
        }
        return out;
    }
    catch {
        return [];
    }
}
/**
 * 路径 → 路径族 key。统一处理相对/绝对路径：去盘符、去文件名的最后两段目录。
 * 例：'src/foo/bar.ts' → 'src/foo'；'C:/a/b/c/d.ts' → 'c/d'。
 */
export function familyOfPath(raw) {
    const normalized = raw.replace(/\\/g, '/').trim();
    if (!normalized)
        return null;
    const segments = normalized.split('/').filter((s) => s.length > 0 && s !== '.');
    // 去掉盘符/根标记后的"有意义段"
    const meaningful = segments.filter((s, i) => !(i === 0 && /^[a-zA-Z]:$/.test(s)));
    if (meaningful.length === 0)
        return null;
    // 去掉末段如果是文件名（含扩展名或已知文件后缀）
    let dirs = meaningful;
    const last = meaningful[meaningful.length - 1];
    if (/\.[a-zA-Z0-9]{1,8}$/.test(last))
        dirs = meaningful.slice(0, -1);
    if (dirs.length === 0)
        return null;
    return dirs.slice(-2).join('/');
}
/** 候选名：优先路径族末段，其次工具族标签。 */
function candidateFrom(family, toolFamily) {
    const last = family.split('/').pop();
    if (last && last.length > 0)
        return last;
    return toolFamily ? FAMILY_LABEL[toolFamily] ?? toolFamily : '新任务';
}
function same(a, b) {
    return a === b;
}
export function initDriftState() {
    return {
        suggestion: null,
        activeTopicId: null,
        sessionTitle: null,
        messageCount: 0,
        suggestedAtMessage: -1,
        clusterFamilies: [],
        lastToolFamily: null,
        windowEvents: 0,
    };
}
/** 关键词命中：返回 [候选, 命中次数, 命中词列表]。 */
function keywordHit(content, cfg) {
    const lower = content.toLowerCase();
    let best = null;
    for (const [candidate, words] of Object.entries(cfg.keywords)) {
        let hits = 0;
        const hitWords = [];
        for (const word of words) {
            if (lower.includes(word.toLowerCase())) {
                hits += 1;
                hitWords.push(word);
            }
        }
        if (hits > 0 && (best === null || hits > best[1]))
            best = [candidate, hits, hitWords];
    }
    return best;
}
/** 解析 /t 命令参数，返回 [verb, arg]。 */
function parseTArgs(args) {
    if (!args)
        return ['', ''];
    const match = args.trim().match(/^(new|switch|merge|list|show|edit|inject|ignore|link|help|rm)\s+(.*)$/s);
    if (!match)
        return ['', ''];
    return [match[1], match[2].trim()];
}
/** 命令事件是否属于本插件（/t 家族 + /topic 兼容）。 */
function isOwnCommand(name) {
    return name === 't' || name === 'topic' || name === 'topic-guard';
}
/**
 * 纯 fold：state + 一个已提交事件 → 下一状态。
 * 无关事件返回同一引用（零下游工作）。
 */
export function applyDrift(state, event, cfg) {
    switch (event.type) {
        case 'user/message': {
            const msg = event.data;
            if (msg?.source?.kind !== 'user')
                return state; // 注入上下文不计
            const next = {
                ...state,
                messageCount: state.messageCount + 1,
                windowEvents: 0,
                lastToolFamily: null,
            };
            // 新指令 → 重置建议窗口；但 auto-suggest（"建议创建 Topic"）需用户显式干预
            // （[创建]/[忽略]）才消失——发新消息不清除，提示持续显示。
            next.suggestion =
                state.suggestion && Array.isArray(state.suggestion.reasons) && state.suggestion.reasons.includes('auto-suggest')
                    ? state.suggestion
                    : null;
            const content = textOf(msg.content);
            const hit = keywordHit(content, cfg);
            if (hit) {
                const score = Math.min(hit[1], 3) * cfg.weights.keyword;
                if (score >= cfg.threshold &&
                    (next.suggestedAtMessage === -1 || next.messageCount >= next.suggestedAtMessage + cfg.cooldownMessages)) {
                    next.suggestion = {
                        candidate: hit[0],
                        score,
                        reasons: [`keyword: ${hit[2].join('/')}`],
                        nonce: `s${event.seq}`,
                        atSeq: event.seq,
                    };
                    next.suggestedAtMessage = next.messageCount;
                }
            }
            // 自动建议：新会话累计 N 条用户消息仍未绑定 Topic → 建议创建（不依赖漂移信号）
            if (next.suggestion === null &&
                next.activeTopicId === null &&
                next.messageCount >= cfg.autoSuggestAfterMessages &&
                (next.suggestedAtMessage === -1 || next.messageCount >= next.suggestedAtMessage + cfg.cooldownMessages)) {
                next.suggestion = {
                    candidate: next.sessionTitle && next.sessionTitle.trim().length > 0 ? next.sessionTitle.trim() : '新会话主题',
                    score: cfg.threshold,
                    reasons: ['auto-suggest'],
                    nonce: `s${event.seq}`,
                    atSeq: event.seq,
                };
                next.suggestedAtMessage = next.messageCount;
            }
            return next;
        }
        case 'tool/call': {
            const call = event.data;
            const tool = call?.name ?? '';
            const toolFamily = familyOf(tool);
            const next = { ...state, windowEvents: state.windowEvents + 1 };
            let score = 0;
            const reasons = [];
            let jumpedFamily = null;
            // 信号 2：路径族突变
            for (const raw of extractPaths(call?.arguments ?? '')) {
                const family = familyOfPath(raw);
                if (family === null)
                    continue;
                if (next.clusterFamilies.length === 0) {
                    // 冷启动：首个路径族静默入簇（不视为漂移）
                    next.clusterFamilies = [family];
                    break;
                }
                if (!next.clusterFamilies.includes(family)) {
                    jumpedFamily = family;
                    next.clusterFamilies = [...next.clusterFamilies, family];
                    score += cfg.weights.pathJump;
                    reasons.push(`path-jump: ${family}`);
                    break; // 一条消息窗口内只计一次路径突变
                }
            }
            // 信号 3：工具族切换（窗口内首个事件不算切换）
            if (next.lastToolFamily !== null && next.lastToolFamily !== toolFamily && next.windowEvents > 1) {
                score += cfg.weights.toolSwitch;
                reasons.push(`tool-switch: ${FAMILY_LABEL[next.lastToolFamily] ?? next.lastToolFamily} → ${FAMILY_LABEL[toolFamily] ?? toolFamily}`);
            }
            next.lastToolFamily = toolFamily;
            // 阈值触发（仅在无待确认建议时）
            if (next.suggestion === null &&
                score >= cfg.threshold &&
                (next.suggestedAtMessage === -1 || next.messageCount >= next.suggestedAtMessage + cfg.cooldownMessages)) {
                const candidate = jumpedFamily !== null ? candidateFrom(jumpedFamily, toolFamily) : '新任务';
                next.suggestion = {
                    candidate,
                    score,
                    reasons,
                    nonce: `s${event.seq}`,
                    atSeq: event.seq,
                };
                next.suggestedAtMessage = next.messageCount;
            }
            return same(state, next) ? state : next;
        }
        case 'session/title': {
            const d = event.data;
            if (!d || typeof d.title !== 'string')
                return state;
            const next = { ...state, sessionTitle: d.title };
            return next;
        }
        case 'command/run': {
            const cmd = event.data;
            if (!cmd?.name || !isOwnCommand(cmd.name))
                return state;
            const [verb, arg] = parseTArgs(cmd.args);
            // 用户显式动作（new/switch/ignore/…）→ 重置冷却，允许下一次强信号立即建议
            const next = { ...state, suggestion: null, suggestedAtMessage: -1 };
            if (verb === 'new') {
                next.activeTopicId = arg.length > 0 ? slugArg(arg) : null;
            }
            else if (verb === 'switch') {
                next.activeTopicId = arg.length > 0 ? arg.split(/\s+/)[0] : null;
            }
            else if (verb === 'merge') {
                // 目标为第一个参数（合并 into 语义），第二个是归档方
                const parts = arg.split(/\s+/).filter(Boolean);
                if (parts.length >= 2 && parts[0] !== parts[1])
                    next.activeTopicId = parts[0];
            }
            else if (verb === 'rm') {
                if (next.activeTopicId !== null && arg.split(/\s+/)[0] === next.activeTopicId)
                    next.activeTopicId = null;
            }
            return next;
        }
        default:
            return state;
    }
}
/** 从事件内容块提取纯文本。 */
function textOf(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .map((block) => {
            if (typeof block === 'string')
                return block;
            if (block && typeof block === 'object') {
                const b = block;
                return typeof b.text === 'string' ? b.text : '';
            }
            return '';
        })
            .join('\n');
    }
    return '';
}
/** /t new 参数 → topic id（与 memory/paths slugId 一致；此处避免循环依赖直接内联）。 */
function slugArg(name) {
    return (name
        .normalize('NFKC')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'topic');
}
/** 组装会话投影视图（wire）。 */
export function viewOf(state) {
    return { suggestion: state.suggestion, activeTopicId: state.activeTopicId };
}

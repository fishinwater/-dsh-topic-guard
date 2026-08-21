/**
 * Drift Detector — 规则级（非 LLM）主题漂移检测，实现为会话投影单元的纯 fold。
 *
 * 三大信号（规格 §3.2）：
 * 1. 关键词（keyword）——user/message 命中配置关键词规则 → 直接产出候选；
 * 2. 文件路径突变（pathJump）——tool/call 参数中的路径族跳出当前主题已见路径族；
 * 3. 工具切换（toolSwitch）——工具族（code/shell/web/subagent/…）在一条消息窗口内突变。
 *
 * 加权计分，超过阈值产出 {candidate, score, reasons, nonce}；建议不弹窗，
 * 只进入投影状态 → 客户端以 Inline Chip 非阻塞展示（3 秒自动消失）。
 *
 * 纯函数约束（投影注册表要求）：apply 必须同步、确定、state 为 plain JSON，
 * 只依赖事件序列 + 插件加载时的静态配置。
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
// 类型增广：'command/run' 会话事件由 dsh-commands 声明（SessionEventMap 可扩展）
import type {} from '@deepseek-ai/dsh-commands';
import type { DriftSuggestion } from './drift-types.ts';

export interface DriftConfig {
  /** 建议触发阈值（分）。默认 50。 */
  threshold: number;
  /** 三大信号权重。 */
  weights: {
    /** 关键词命中单次分值。默认 25。 */
    keyword: number;
    /** 新路径族出现分值。默认 30。 */
    pathJump: number;
    /** 工具族切换分值。默认 20。 */
    toolSwitch: number;
  };
  /** 关键词规则：候选主题名 → 关键词列表（小写匹配）。 */
  keywords: Record<string, string[]>;
  /** 建议冷却：距离上次建议至少间隔多少条用户消息才再次建议。默认 3。 */
  cooldownMessages: number;
}

export interface DriftState {
  /** 当前待确认的建议（客户端 chip 数据源）。 */
  suggestion: DriftSuggestion | null;
  /** 当前活跃 topic id（由 /t new|switch 的 command/run 事件驱动）。 */
  activeTopicId: string | null;
  /** 已见用户消息数。 */
  messageCount: number;
  /** 上次产出建议时的 messageCount（冷却依据）。 */
  suggestedAtMessage: number;
  /** 已见路径族（首段聚类，用于路径突变判定）。 */
  clusterFamilies: string[];
  /** 上一条工具族。 */
  lastToolFamily: string | null;
  /** 本消息窗口内的事件计数（首事件不判工具切换）。 */
  windowEvents: number;
}

/** 工具名 → 工具族。 */
const TOOL_FAMILIES: Record<string, string> = {
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
};

const FAMILY_LABEL: Record<string, string> = {
  code: '代码编辑',
  shell: 'Shell 命令',
  web: '网络检索',
  subagent: '子代理',
  workflow: '工作流',
  goal: '目标管理',
  ralph: 'Ralph 循环',
  other: '其他工具',
};

function familyOf(tool: string): string {
  return TOOL_FAMILIES[tool] ?? 'other';
}

/** 从工具参数 JSON 中提取文件路径（file_path/path/workdir/file 字段）。 */
export function extractPaths(argsJson: string): string[] {
  try {
    const args: unknown = JSON.parse(argsJson);
    if (typeof args !== 'object' || args === null || Array.isArray(args)) return [];
    const out: string[] = [];
    for (const key of ['file_path', 'path', 'workdir', 'file']) {
      const value = (args as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim().length > 0) out.push(value);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 路径 → 路径族 key。统一处理相对/绝对路径：去盘符、去文件名的最后两段目录。
 * 例：'src/foo/bar.ts' → 'src/foo'；'C:/a/b/c/d.ts' → 'c/d'。
 */
export function familyOfPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/').trim();
  if (!normalized) return null;
  const segments = normalized.split('/').filter((s) => s.length > 0 && s !== '.');
  // 去掉盘符/根标记后的"有意义段"
  const meaningful = segments.filter((s, i) => !(i === 0 && /^[a-zA-Z]:$/.test(s)));
  if (meaningful.length === 0) return null;
  // 去掉末段如果是文件名（含扩展名或已知文件后缀）
  let dirs = meaningful;
  const last = meaningful[meaningful.length - 1];
  if (/\.[a-zA-Z0-9]{1,8}$/.test(last)) dirs = meaningful.slice(0, -1);
  if (dirs.length === 0) return null;
  return dirs.slice(-2).join('/');
}

/** 候选名：优先路径族末段，其次工具族标签。 */
function candidateFrom(family: string, toolFamily: string | null): string {
  const last = family.split('/').pop();
  if (last && last.length > 0) return last;
  return toolFamily ? FAMILY_LABEL[toolFamily] ?? toolFamily : '新任务';
}

function same(a: DriftState, b: DriftState): boolean {
  return a === b;
}

export function initDriftState(): DriftState {
  return {
    suggestion: null,
    activeTopicId: null,
    messageCount: 0,
    suggestedAtMessage: -1,
    clusterFamilies: [],
    lastToolFamily: null,
    windowEvents: 0,
  };
}

/** 关键词命中：返回 [候选, 命中次数, 命中词列表]。 */
function keywordHit(content: string, cfg: DriftConfig): [string, number, string[]] | null {
  const lower = content.toLowerCase();
  let best: [string, number, string[]] | null = null;
  for (const [candidate, words] of Object.entries(cfg.keywords)) {
    let hits = 0;
    const hitWords: string[] = [];
    for (const word of words) {
      if (lower.includes(word.toLowerCase())) {
        hits += 1;
        hitWords.push(word);
      }
    }
    if (hits > 0 && (best === null || hits > best[1])) best = [candidate, hits, hitWords];
  }
  return best;
}

/** 解析 /t 命令参数，返回 [verb, arg]。 */
function parseTArgs(args: string | undefined): [string, string] {
  if (!args) return ['', ''];
  const match = args.trim().match(/^(new|switch|merge|list|show|edit|inject|ignore|link|help|rm)\s+(.*)$/s);
  if (!match) return ['', ''];
  return [match[1], match[2].trim()];
}

/** 命令事件是否属于本插件（/t 家族 + /topic 兼容）。 */
function isOwnCommand(name: string): boolean {
  return name === 't' || name === 'topic' || name === 'topic-guard';
}

/**
 * 纯 fold：state + 一个已提交事件 → 下一状态。
 * 无关事件返回同一引用（零下游工作）。
 */
export function applyDrift(state: DriftState, event: SessionEvent, cfg: DriftConfig): DriftState {
  switch (event.type) {
    case 'user/message': {
      const msg = event.data as { source?: { kind?: string }; content?: unknown };
      if (msg?.source?.kind !== 'user') return state; // 注入上下文不计
      const next: DriftState = {
        ...state,
        messageCount: state.messageCount + 1,
        windowEvents: 0,
        lastToolFamily: null,
      };
      // 新指令 → 重置建议窗口
      next.suggestion = null;
      const content = textOf(msg.content);
      const hit = keywordHit(content, cfg);
      if (hit) {
        const score = Math.min(hit[1], 3) * cfg.weights.keyword;
        if (
          score >= cfg.threshold &&
          (next.suggestedAtMessage === -1 || next.messageCount >= next.suggestedAtMessage + cfg.cooldownMessages)
        ) {
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
      return next;
    }
    case 'tool/call': {
      const call = event.data as { name?: string; arguments?: string };
      const tool = call?.name ?? '';
      const toolFamily = familyOf(tool);
      const next: DriftState = { ...state, windowEvents: state.windowEvents + 1 };

      let score = 0;
      const reasons: string[] = [];
      let jumpedFamily: string | null = null;

      // 信号 2：路径族突变
      for (const raw of extractPaths(call?.arguments ?? '')) {
        const family = familyOfPath(raw);
        if (family === null) continue;
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
      if (
        next.suggestion === null &&
        score >= cfg.threshold &&
        (next.suggestedAtMessage === -1 || next.messageCount >= next.suggestedAtMessage + cfg.cooldownMessages)
      ) {
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
    case 'command/run': {
      const cmd = event.data as { name?: string; args?: string };
      if (!cmd?.name || !isOwnCommand(cmd.name)) return state;
      const [verb, arg] = parseTArgs(cmd.args);
      // 用户显式动作（new/switch/ignore/…）→ 重置冷却，允许下一次强信号立即建议
      const next: DriftState = { ...state, suggestion: null, suggestedAtMessage: -1 };
      if (verb === 'new') {
        next.activeTopicId = arg.length > 0 ? slugArg(arg) : null;
      } else if (verb === 'switch') {
        next.activeTopicId = arg.length > 0 ? arg.split(/\s+/)[0] : null;
      } else if (verb === 'merge') {
        // 目标为第一个参数（合并 into 语义），第二个是归档方
        const parts = arg.split(/\s+/).filter(Boolean);
        if (parts.length >= 2 && parts[0] !== parts[1]) next.activeTopicId = parts[0];
      } else if (verb === 'rm') {
        if (next.activeTopicId !== null && arg.split(/\s+/)[0] === next.activeTopicId) next.activeTopicId = null;
      }
      return next;
    }
    default:
      return state;
  }
}

/** 从事件内容块提取纯文本。 */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>;
          return typeof b.text === 'string' ? b.text : '';
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

/** /t new 参数 → topic id（与 memory/paths slugId 一致；此处避免循环依赖直接内联）。 */
function slugArg(name: string): string {
  return (
    name
      .normalize('NFKC')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'topic'
  );
}

/** 组装会话投影视图（wire）。 */
export function viewOf(state: DriftState): { suggestion: DriftSuggestion | null; activeTopicId: string | null } {
  return { suggestion: state.suggestion, activeTopicId: state.activeTopicId };
}

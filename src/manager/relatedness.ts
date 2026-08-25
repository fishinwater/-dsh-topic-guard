/**
 * Relatedness - 主题关联度（规则级，非 LLM）。
 *
 * 用途（主题插件核心：按关联度注入上下文）：
 * 1. 主题→主题：relatedTopics() 消费显式边（causal/hierarchical）+ 抽屉路径族 / factKey /
 *    会话共现 / 关键词 / 摘要词元信号，输出带 reasons 的关联主题排序；
 * 2. 会话→主题：matchSessionToTopics() 用"最近用户输入 + 工具调用"特征匹配已定义 Topic，
 *    服务端升级客户端 renderMatchView 的弱匹配（供 /t match）。
 *
 * 全部为确定性集合/加权运算，零 LLM 调用；reasons 可解释、权重可配置。
 */
import { extractPaths, familyOfPath } from './drift.ts';
import type { ArtifactEntry, TopicIndex } from '../memory/types.ts';
import type { WorkspaceMemoryStore } from '../memory/store.ts';
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';

export interface RelatednessWeights {
  /** 显式 causal 边基础分。默认 1.0。 */
  edgeCausal: number;
  /** 显式 hierarchical 边基础分。默认 0.6。 */
  edgeHierarchical: number;
  /** 边每跳衰减系数。默认 0.5。 */
  edgeDecay: number;
  /** 抽屉 file 路径族 Jaccard 权重。默认 0.8。 */
  pathFamily: number;
  /** 共享 active factKey 每个加分。默认 0.5。 */
  factKey: number;
  /** 共享会话每个加分。默认 0.3。 */
  sessionCo: number;
  /** 关键词/词元命中每个加分（封顶 3）。默认 0.2。 */
  keyword: number;
  /** 摘要词元 Jaccard 权重。默认 0.4。 */
  summary: number;
}

export interface RelatednessConfig {
  enabled: boolean;
  /** 返回/注入的关联主题数。默认 3。 */
  topK: number;
  /** 最低得分（低于不计）。默认 1.0。 */
  minScore: number;
  /** edges BFS 最大跳数。默认 2。 */
  maxHops: number;
  weights: RelatednessWeights;
}

export const DEFAULT_RELATEDNESS: RelatednessConfig = {
  enabled: true,
  topK: 3,
  minScore: 0.5,
  maxHops: 2,
  weights: {
    edgeCausal: 1.0,
    edgeHierarchical: 0.6,
    edgeDecay: 0.5,
    pathFamily: 0.8,
    factKey: 0.5,
    sessionCo: 0.3,
    keyword: 0.2,
    summary: 0.4,
  },
};

export interface RelatedResult {
  topicId: string;
  score: number;
  reasons: string[];
}

export interface SessionFeatures {
  /** 最近用户输入文本（截断）。 */
  texts: string[];
  /** 最近工具名。 */
  toolNames: string[];
  /** 最近工具调用路径。 */
  paths: string[];
  /** 当前会话主题抽屉的 active factKey（匹配时使用）。 */
  factKeys: string[];
}

/** 文本词元：拉丁单词 + CJK 2-gram（确定性、无外部依赖）。 */
export function tokenizeText(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  for (const m of lower.match(/[a-z0-9][a-z0-9._-]{1,}/g) ?? []) tokens.push(m);
  const cjk = lower.replace(/[^\u4e00-\u9fff]/g, '');
  for (let i = 0; i + 1 < cjk.length; i++) tokens.push(cjk.slice(i, i + 2));
  return tokens;
}

/** Jaccard 相似度（集合运算）。 */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 抽屉 file 条目 → 路径族集合（复用 drift 的 familyOfPath）。 */
export function pathFamiliesOf(entries: ArtifactEntry[]): Set<string> {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'file' || !e.path) continue;
    const f = familyOfPath(e.path);
    if (f) set.add(f);
  }
  return set;
}

/** 抽屉 fact 条目 → factKey 集合（默认只取 active）。 */
export function factKeysOf(entries: ArtifactEntry[], activeOnly = true): Set<string> {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'fact' || !e.factKey) continue;
    if (activeOnly && e.status !== 'active') continue;
    set.add(e.factKey);
  }
  return set;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface EdgeInfo {
  id: string;
  score: number;
  via: string;
}

/** edges 无向邻接 → 从 fromId 出发 BFS（≤ maxHops，逐跳衰减）。 */
function collectEdgeCandidates(index: TopicIndex, fromId: string, cfg: RelatednessConfig): Map<string, EdgeInfo> {
  const adj = new Map<string, Map<string, string>>();
  for (const t of Object.values(index.topics)) {
    for (const e of t.edges) {
      let m = adj.get(t.id);
      if (!m) { m = new Map(); adj.set(t.id, m); }
      m.set(e.target, e.type);
      let m2 = adj.get(e.target);
      if (!m2) { m2 = new Map(); adj.set(e.target, m2); }
      m2.set(t.id, e.type);
    }
  }
  const out = new Map<string, EdgeInfo>();
  const queue: Array<{ id: string; score: number; hops: number; via: string }> = [{ id: fromId, score: 0, hops: 0, via: 'self' }];
  const visited = new Set<string>([fromId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [target, type] of adj.get(cur.id) ?? new Map()) {
      if (visited.has(target)) continue;
      const hop = cur.hops + 1;
      if (hop > cfg.maxHops) continue;
      const w = type === 'causal' ? cfg.weights.edgeCausal : cfg.weights.edgeHierarchical;
      const score = (cur.score + w) * cfg.weights.edgeDecay;
      visited.add(target);
      out.set(target, { id: target, score: round1(score), via: type });
      queue.push({ id: target, score, hops: hop, via: type });
    }
  }
  return out;
}

function resolveConfig(opts?: Partial<RelatednessConfig>): RelatednessConfig {
  return {
    enabled: opts?.enabled ?? DEFAULT_RELATEDNESS.enabled,
    topK: opts?.topK ?? DEFAULT_RELATEDNESS.topK,
    minScore: opts?.minScore ?? DEFAULT_RELATEDNESS.minScore,
    maxHops: opts?.maxHops ?? DEFAULT_RELATEDNESS.maxHops,
    weights: { ...DEFAULT_RELATEDNESS.weights, ...opts?.weights },
  };
}

/**
 * 主题→主题关联度（非 LLM）。
 * 依次叠加：显式边（BFS 衰减）→ 路径族 Jaccard → factKey 共享 → 会话共现 → 关键词 → 摘要 Jaccard。
 * 返回按得分降序、过 minScore 阈值、截断 topK 的结果。
 */
export async function relatedTopics(
  store: WorkspaceMemoryStore,
  fromId: string,
  opts?: Partial<RelatednessConfig>,
): Promise<RelatedResult[]> {
  const cfg = resolveConfig(opts);
  if (!cfg.enabled) return [];
  const index = await store.loadIndex();
  const from = index.topics[fromId];
  if (!from) return [];

  const edgeCands = collectEdgeCandidates(index, fromId, cfg);
  const fromArtifacts = await store.readArtifacts(fromId);
  const fromSummary = await store.readSummary(fromId);
  const fromFamilies = pathFamiliesOf(fromArtifacts.entries);
  const fromFacts = factKeysOf(fromArtifacts.entries);
  const fromTokens = new Set(tokenizeText([from.id, from.domain, from.goal, fromSummary].join(' ')));

  const results: RelatedResult[] = [];
  for (const to of Object.values(index.topics)) {
    if (to.id === fromId || to.status === 'archived') continue;
    const edge = edgeCands.get(to.id);
    const toArtifacts = await store.readArtifacts(to.id);
    const toSummary = await store.readSummary(to.id);

    let score = edge ? edge.score : 0;
    const reasons: string[] = [];
    if (edge) reasons.push(`edge:${edge.via}`);

    const toFamilies = pathFamiliesOf(toArtifacts.entries);
    const pj = jaccard(fromFamilies, toFamilies);
    if (pj > 0) { score += cfg.weights.pathFamily * pj; reasons.push(`path:${pj.toFixed(2)}`); }

    const toFacts = factKeysOf(toArtifacts.entries);
    const sharedFacts = [...fromFacts].filter((k) => toFacts.has(k));
    if (sharedFacts.length > 0) { score += cfg.weights.factKey * sharedFacts.length; reasons.push(`fact:${sharedFacts.length}`); }

    const sharedSessions = from.sessionIds.filter((s) => to.sessionIds.includes(s));
    if (sharedSessions.length > 0) { score += cfg.weights.sessionCo * sharedSessions.length; reasons.push(`session:${sharedSessions.length}`); }

    const toTokens = new Set(tokenizeText([to.id, to.domain, to.goal, toSummary].join(' ')));
    let kw = 0;
    for (const t of toTokens) if (fromTokens.has(t)) kw++;
    if (kw > 0) { score += Math.min(kw, 3) * cfg.weights.keyword; reasons.push(`kw:${kw}`); }

    const sj = jaccard(new Set(tokenizeText(fromSummary)), new Set(tokenizeText(toSummary)));
    if (sj > 0) { score += cfg.weights.summary * sj; reasons.push(`sum:${sj.toFixed(2)}`); }

    if (score > 0) results.push({ topicId: to.id, score: round1(score), reasons });
  }
  results.sort((a, b) => b.score - a.score);
  return results.filter((r) => r.score >= cfg.minScore).slice(0, cfg.topK);
}

/** 会话→主题匹配（服务端升级客户端 renderMatchView）。 */
export async function matchSessionToTopics(
  store: WorkspaceMemoryStore,
  features: SessionFeatures,
  opts?: Partial<RelatednessConfig>,
): Promise<RelatedResult[]> {
  const cfg = resolveConfig(opts);
  if (!cfg.enabled) return [];
  const index = await store.loadIndex();
  const textTokens = tokenizeText(features.texts.join(' '));
  const featureFamilies = new Set(features.paths.map((p) => familyOfPath(p)).filter((x): x is string => x !== null));

  const results: RelatedResult[] = [];
  for (const topic of Object.values(index.topics)) {
    if (topic.status === 'archived') continue;
    const artifacts = await store.readArtifacts(topic.id);
    const summary = await store.readSummary(topic.id);
    let score = 0;
    const reasons: string[] = [];

    const hay = new Set(tokenizeText([topic.id, topic.domain, topic.goal, summary].join(' ')));
    const hitTokens = new Set<string>();
    for (const t of textTokens) if (hay.has(t)) hitTokens.add(t);
    if (hitTokens.size > 0) {
      score += Math.min(hitTokens.size, 3) * cfg.weights.keyword;
      reasons.push(`kw:${[...hitTokens].slice(0, 3).join('/')}`);
    }

    const topicFamilies = pathFamiliesOf(artifacts.entries);
    const pj = jaccard(featureFamilies, topicFamilies);
    if (pj > 0) { score += cfg.weights.pathFamily * pj; reasons.push(`path:${pj.toFixed(2)}`); }

    const topicFacts = factKeysOf(artifacts.entries);
    const sharedFacts = features.factKeys.filter((k) => topicFacts.has(k));
    if (sharedFacts.length > 0) { score += cfg.weights.factKey * sharedFacts.length; reasons.push(`fact:${sharedFacts.length}`); }

    if (score > 0) results.push({ topicId: topic.id, score: round1(score), reasons });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, cfg.topK);
}

/** 从会话日志尾部提取匹配特征（最近用户输入 + 工具调用）。 */
export function collectSessionFeatures(session: { log?: SessionEvent[] }, limit = 400): SessionFeatures {
  const features: SessionFeatures = { texts: [], toolNames: [], paths: [], factKeys: [] };
  const events = (session.log ?? []).slice(-limit);
  const seenPaths = new Set<string>();
  for (const event of events) {
    if (event.type === 'user/message') {
      const msg = event.data as { source?: { kind?: string }; content?: unknown } | undefined;
      if (msg?.source?.kind !== 'user') continue;
      const text = textOfContent(msg.content);
      if (text && features.texts.length < 8) features.texts.push(text.slice(0, 400));
    } else if (event.type === 'tool/call') {
      const call = event.data as { name?: string; arguments?: string } | undefined;
      if (call?.name && !features.toolNames.includes(call.name)) features.toolNames.push(call.name);
      for (const raw of extractPaths(call?.arguments ?? '')) {
        if (!seenPaths.has(raw)) { seenPaths.add(raw); features.paths.push(raw); }
      }
    }
  }
  return features;
}

/** 从事件内容块提取纯文本（与 drift 的 textOf 等价，独立实现避免导出私有函数）。 */
function textOfContent(content: unknown): string {
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

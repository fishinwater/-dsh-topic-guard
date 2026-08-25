import type { ArtifactEntry } from '../memory/types.ts';
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
export declare const DEFAULT_RELATEDNESS: RelatednessConfig;
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
export declare function tokenizeText(text: string): string[];
/** Jaccard 相似度（集合运算）。 */
export declare function jaccard<T>(a: Set<T>, b: Set<T>): number;
/** 抽屉 file 条目 → 路径族集合（复用 drift 的 familyOfPath）。 */
export declare function pathFamiliesOf(entries: ArtifactEntry[]): Set<string>;
/** 抽屉 fact 条目 → factKey 集合（默认只取 active）。 */
export declare function factKeysOf(entries: ArtifactEntry[], activeOnly?: boolean): Set<string>;
/**
 * 主题→主题关联度（非 LLM）。
 * 依次叠加：显式边（BFS 衰减）→ 路径族 Jaccard → factKey 共享 → 会话共现 → 关键词 → 摘要 Jaccard。
 * 返回按得分降序、过 minScore 阈值、截断 topK 的结果。
 */
export declare function relatedTopics(store: WorkspaceMemoryStore, fromId: string, opts?: Partial<RelatednessConfig>): Promise<RelatedResult[]>;
/** 会话→主题匹配（服务端升级客户端 renderMatchView）。 */
export declare function matchSessionToTopics(store: WorkspaceMemoryStore, features: SessionFeatures, opts?: Partial<RelatednessConfig>): Promise<RelatedResult[]>;
/** 从会话日志尾部提取匹配特征（最近用户输入 + 工具调用）。 */
export declare function collectSessionFeatures(session: {
    log?: SessionEvent[];
}, limit?: number): SessionFeatures;

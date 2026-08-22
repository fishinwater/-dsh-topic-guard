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
    /** 新会话未绑定 Topic 时，累计多少条用户消息后自动建议创建。默认 3。 */
    autoSuggestAfterMessages: number;
}
export interface DriftState {
    /** 当前待确认的建议（客户端 chip 数据源）。 */
    suggestion: DriftSuggestion | null;
    /** 当前活跃 topic id（由 /t new|switch 的 command/run 事件驱动）。 */
    activeTopicId: string | null;
    /** 最近会话标题（session/title 事件；auto-suggest 的候选名来源）。 */
    sessionTitle: string | null;
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
/** 从工具参数 JSON 中提取文件路径（file_path/path/workdir/file 字段）。 */
export declare function extractPaths(argsJson: string): string[];
/**
 * 路径 → 路径族 key。统一处理相对/绝对路径：去盘符、去文件名的最后两段目录。
 * 例：'src/foo/bar.ts' → 'src/foo'；'C:/a/b/c/d.ts' → 'c/d'。
 */
export declare function familyOfPath(raw: string): string | null;
export declare function initDriftState(): DriftState;
/**
 * 纯 fold：state + 一个已提交事件 → 下一状态。
 * 无关事件返回同一引用（零下游工作）。
 */
export declare function applyDrift(state: DriftState, event: SessionEvent, cfg: DriftConfig): DriftState;
/** 组装会话投影视图（wire）。 */
export declare function viewOf(state: DriftState): {
    suggestion: DriftSuggestion | null;
    activeTopicId: string | null;
};

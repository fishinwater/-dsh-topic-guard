import { WorkspaceMemoryStore } from '../memory/store.ts';
import { type RelatednessConfig } from './relatedness.ts';
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
export interface CommandResult {
    kind: 'success' | 'error';
    text: string;
}
/** 会话对象的最小接口（handler 里拿到的 agent.session）。 */
export interface SessionLike {
    id: string;
    log?: SessionEvent[];
}
export declare class TopicRouter {
    private readonly store;
    private readonly logger;
    /** 关联度配置（非 LLM 规则级；注入 /t related|match 使用）。 */
    private readonly relatedness;
    /** 事实变更回调（topic-guard 侧用于通知 spill 输出池主动维护）。 */
    private readonly onFactsChanged?;
    constructor(store: WorkspaceMemoryStore, logger?: {
        warn?: (msg: string) => void;
    }, opts?: {
        relatedness?: RelatednessConfig;
        onFactsChanged?: (topicId: string) => void;
    });
    /** 处理 /t <sub> <args...>。 */
    handle(raw: string, session: SessionLike): Promise<CommandResult>;
    private create;
    private switchTo;
    private merge;
    private dump;
    private list;
    private show;
    private edit;
    private inject;
    private link;
    private related;
    private match;
    private fact;
    private remove;
    private help;
}

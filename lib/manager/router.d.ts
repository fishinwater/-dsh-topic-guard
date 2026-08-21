import { WorkspaceMemoryStore } from '../memory/store.ts';
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
    constructor(store: WorkspaceMemoryStore, logger?: {
        warn?: (msg: string) => void;
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
    private remove;
    private help;
}

import type { ArtifactManifest, Topic, TopicEdgeType, TopicIndex } from './types.ts';
export declare class WorkspaceMemoryStore {
    private readonly root;
    constructor(root: string);
    private indexPath;
    private topicDir;
    private topicFile;
    private summaryFile;
    private artifactsFile;
    private assertSafeId;
    private atomicWrite;
    private readJson;
    init(): Promise<void>;
    loadIndex(): Promise<TopicIndex>;
    saveIndex(idx: TopicIndex): Promise<void>;
    loadTopic(id: string): Promise<Topic | null>;
    saveTopic(topic: Topic): Promise<void>;
    /** 创建 topic（draft），绑定可选会话，落盘注册表 + 目录骨架。 */
    createTopic(input: {
        id: string;
        domain?: string;
        goal?: string;
        sessionId?: string;
    }): Promise<Topic>;
    /** 删除 topic（含目录），并清理注册表与会话映射。 */
    removeTopic(id: string): Promise<void>;
    setSessionTopic(sessionId: string, topicId: string): Promise<void>;
    activeTopicFor(sessionId: string): Promise<Topic | null>;
    readSummary(id: string): Promise<string>;
    /** 写入摘要并翻转状态 draft → active（"用户确认摘要"步骤）。 */
    writeSummary(id: string, text: string): Promise<void>;
    readArtifacts(id: string): Promise<ArtifactManifest>;
    saveArtifacts(id: string, manifest: ArtifactManifest): Promise<void>;
    appendArtifacts(id: string, entries: ArtifactManifest['entries']): Promise<ArtifactManifest>;
    /**
     * 追加事实条目并执行冲突替换（"后者为准"原则）：
     * - 同 factKey 且值一致 → 跳过（强化语义由调用方记录）；
     * - 同 factKey 且值不同 → 冲突：旧条目 status=superseded + supersededBy 指向新条目，新条目 active 追加；
     * - 新 factKey → 直接追加（active）。
     * 全部原子写；superseded 条目保留在历史中（审计留痕），不参与召回。
     */
    appendFacts(id: string, facts: Array<{
        factKey: string;
        value: string;
        source?: import('./types.ts').FactSource;
    }>): Promise<ArtifactManifest>;
    /** 当前有效事实（status=active 的 fact 条目）。 */
    activeFacts(id: string): Promise<ArtifactManifest['entries']>;
    linkTopics(a: string, b: string, type: TopicEdgeType): Promise<void>;
    /**
     * 合并 from → into：摘要追加小节、资料去重合并、记录关联边、from 归档。
     * 返回合并后的 into。
     */
    mergeTopics(from: string, into: string): Promise<Topic>;
    /** 存储根（调试/展示用）。 */
    get rootPath(): string;
}

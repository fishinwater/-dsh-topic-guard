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
    linkTopics(a: string, b: string, type: TopicEdgeType): Promise<void>;
    /**
     * 合并 from → into：摘要追加小节、资料去重合并、记录关联边、from 归档。
     * 返回合并后的 into。
     */
    mergeTopics(from: string, into: string): Promise<Topic>;
    /** 存储根（调试/展示用）。 */
    get rootPath(): string;
}

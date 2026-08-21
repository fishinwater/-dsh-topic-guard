/**
 * WorkspaceMemoryStore — 读写 `.harness/topics/` 布局（根目录见 memory/paths.ts）。
 *
 * 约定：
 * - 全部写入走"临时文件 + rename"的原子写，避免半截文件；
 * - topic id 写入前经 isSafeId 校验，防止路径穿越；
 * - index.json 是注册表权威；topic 目录内 topic.json 与 index 条目保持一致。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isSafeId } from './paths.ts';
import { isTopic } from './schema.ts';
import type { ArtifactManifest, Topic, TopicEdgeType, TopicIndex } from './types.ts';

const INDEX_FILE = 'index.json';

function emptyIndex(): TopicIndex {
  return { version: 1, topics: {}, sessionTopics: {} };
}

export class WorkspaceMemoryStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  // ---- 基础路径 ----
  private indexPath(): string {
    return join(this.root, INDEX_FILE);
  }
  private topicDir(id: string): string {
    return join(this.root, id);
  }
  private topicFile(id: string): string {
    return join(this.topicDir(id), 'topic.json');
  }
  private summaryFile(id: string): string {
    return join(this.topicDir(id), 'summary.md');
  }
  private artifactsFile(id: string): string {
    return join(this.topicDir(id), 'artifacts', 'manifest.json');
  }

  private assertSafeId(id: string): void {
    if (!isSafeId(id)) throw new Error(`topic-guard: 非法 topic id: ${JSON.stringify(id)}`);
  }

  // ---- 原子读写 ----
  private async atomicWrite(file: string, content: string): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const tmp = join(dirname(file), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(tmp, content, 'utf8');
    try {
      await rename(tmp, file);
    } catch (error) {
      // Windows 下 rename 覆盖已存在文件可能失败：先删后换
      try {
        await import('node:fs/promises').then((m) => m.rm(file, { force: true }));
        await rename(tmp, file);
      } catch (second) {
        throw second;
      }
    }
  }

  private async readJson<T>(file: string, fallback: () => T): Promise<T> {
    try {
      const raw = await readFile(file, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback();
    }
  }

  // ---- 注册表 ----
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const idx = await this.loadIndex();
    await this.saveIndex(idx);
  }

  async loadIndex(): Promise<TopicIndex> {
    const idx = await this.readJson<TopicIndex>(this.indexPath(), emptyIndex);
    if (!idx || typeof idx !== 'object' || !idx.topics || !idx.sessionTopics) return emptyIndex();
    return { version: 1, topics: idx.topics, sessionTopics: idx.sessionTopics };
  }

  async saveIndex(idx: TopicIndex): Promise<void> {
    await this.atomicWrite(this.indexPath(), JSON.stringify(idx, null, 2) + '\n');
  }

  // ---- Topic CRUD ----
  async loadTopic(id: string): Promise<Topic | null> {
    this.assertSafeId(id);
    const t = await this.readJson<Topic | null>(this.topicFile(id), () => null);
    return t && isTopic(t) ? t : null;
  }

  async saveTopic(topic: Topic): Promise<void> {
    this.assertSafeId(topic.id);
    await this.atomicWrite(this.topicFile(topic.id), JSON.stringify(topic, null, 2) + '\n');
    // 同步注册表
    const idx = await this.loadIndex();
    idx.topics[topic.id] = topic;
    await this.saveIndex(idx);
  }

  /** 创建 topic（draft），绑定可选会话，落盘注册表 + 目录骨架。 */
  async createTopic(input: { id: string; domain?: string; goal?: string; sessionId?: string }): Promise<Topic> {
    this.assertSafeId(input.id);
    const now = Date.now();
    const topic: Topic = {
      id: input.id,
      domain: input.domain?.trim() ?? '',
      goal: input.goal?.trim() ?? '',
      status: 'draft',
      edges: [],
      sessionIds: input.sessionId ? [input.sessionId] : [],
      createdAt: now,
      updatedAt: now,
    };
    const idx = await this.loadIndex();
    idx.topics[input.id] = topic;
    if (input.sessionId) idx.sessionTopics[input.sessionId] = input.id;
    await this.atomicWrite(this.topicFile(input.id), JSON.stringify(topic, null, 2) + '\n');
    await this.atomicWrite(this.summaryFile(input.id), ''); // 空摘要占位
    await this.atomicWrite(this.artifactsFile(input.id), JSON.stringify({ version: 1, entries: [] }, null, 2) + '\n');
    await this.saveIndex(idx);
    return topic;
  }

  /** 删除 topic（含目录），并清理注册表与会话映射。 */
  async removeTopic(id: string): Promise<void> {
    this.assertSafeId(id);
    const idx = await this.loadIndex();
    delete idx.topics[id];
    for (const [sid, tid] of Object.entries(idx.sessionTopics)) {
      if (tid === id) delete idx.sessionTopics[sid];
    }
    await this.saveIndex(idx);
    await import('node:fs/promises').then((m) => m.rm(this.topicDir(id), { recursive: true, force: true }));
  }

  // ---- 会话 ↔ 主题 ----
  async setSessionTopic(sessionId: string, topicId: string): Promise<void> {
    this.assertSafeId(topicId);
    const idx = await this.loadIndex();
    if (!idx.topics[topicId]) throw new Error(`topic-guard: topic 不存在: ${topicId}`);
    idx.sessionTopics[sessionId] = topicId;
    const topic = idx.topics[topicId];
    if (!topic.sessionIds.includes(sessionId)) topic.sessionIds.push(sessionId);
    topic.updatedAt = Date.now();
    await this.saveIndex(idx);
  }

  async activeTopicFor(sessionId: string): Promise<Topic | null> {
    const idx = await this.loadIndex();
    const id = idx.sessionTopics[sessionId];
    if (!id) return null;
    return idx.topics[id] ?? null;
  }

  // ---- 摘要 ----
  async readSummary(id: string): Promise<string> {
    this.assertSafeId(id);
    try {
      return await readFile(this.summaryFile(id), 'utf8');
    } catch {
      return '';
    }
  }

  /** 写入摘要并翻转状态 draft → active（"用户确认摘要"步骤）。 */
  async writeSummary(id: string, text: string): Promise<void> {
    this.assertSafeId(id);
    await this.atomicWrite(this.summaryFile(id), text);
    const topic = await this.loadTopic(id);
    if (topic) {
      topic.status = topic.status === 'archived' ? 'archived' : 'active';
      topic.updatedAt = Date.now();
      await this.saveTopic(topic);
    }
  }

  // ---- 资料抽屉 ----
  async readArtifacts(id: string): Promise<ArtifactManifest> {
    this.assertSafeId(id);
    const m = await this.readJson<ArtifactManifest | null>(this.artifactsFile(id), () => null);
    return m && Array.isArray(m.entries) ? m : { version: 1, entries: [] };
  }

  async saveArtifacts(id: string, manifest: ArtifactManifest): Promise<void> {
    this.assertSafeId(id);
    await this.atomicWrite(this.artifactsFile(id), JSON.stringify(manifest, null, 2) + '\n');
  }

  async appendArtifacts(id: string, entries: ArtifactManifest['entries']): Promise<ArtifactManifest> {
    if (entries.length === 0) return this.readArtifacts(id);
    const manifest = await this.readArtifacts(id);
    const seen = new Set(manifest.entries.map((e) => JSON.stringify([e.kind, e.path ?? '', e.seq ?? 0])));
    for (const entry of entries) {
      const key = JSON.stringify([entry.kind, entry.path ?? '', entry.seq ?? 0]);
      if (!seen.has(key)) {
        manifest.entries.push(entry);
        seen.add(key);
      }
    }
    await this.saveArtifacts(id, manifest);
    return manifest;
  }

  // ---- 关联边 ----
  async linkTopics(a: string, b: string, type: TopicEdgeType): Promise<void> {
    this.assertSafeId(a);
    this.assertSafeId(b);
    if (a === b) throw new Error('topic-guard: 不能自关联');
    const idx = await this.loadIndex();
    const ta = idx.topics[a];
    const tb = idx.topics[b];
    if (!ta || !tb) throw new Error(`topic-guard: 关联的 topic 不存在 (${a}, ${b})`);
    const has = (edges: Topic['edges'], target: string) => edges.some((e) => e.target === target);
    if (!has(ta.edges, b)) ta.edges.push({ type, target: b });
    ta.updatedAt = Date.now();
    await this.saveTopic(ta);
  }

  // ---- 合并 ----
  /**
   * 合并 from → into：摘要追加小节、资料去重合并、记录关联边、from 归档。
   * 返回合并后的 into。
   */
  async mergeTopics(from: string, into: string): Promise<Topic> {
    this.assertSafeId(from);
    this.assertSafeId(into);
    if (from === into) throw new Error('topic-guard: 不能合并自身');
    const idx = await this.loadIndex();
    const tFrom = idx.topics[from];
    const tInto = idx.topics[into];
    if (!tFrom || !tInto) throw new Error(`topic-guard: 合并的 topic 不存在 (${from}, ${into})`);

    const fromSummary = await this.readSummary(from);
    const intoSummary = await this.readSummary(into);
    const combined = intoSummary.trim().length > 0 ? `${intoSummary.trim()}\n\n## 合并自：${from} (${tFrom.goal || tFrom.domain || '无目标'})\n\n${fromSummary.trim()}\n` : fromSummary;
    await this.atomicWrite(this.summaryFile(into), combined);

    const fromArtifacts = await this.readArtifacts(from);
    const intoArtifacts = await this.readArtifacts(into);
    const seen = new Set(intoArtifacts.entries.map((e) => JSON.stringify([e.kind, e.path ?? '', e.seq ?? 0])));
    for (const entry of fromArtifacts.entries) {
      const key = JSON.stringify([entry.kind, entry.path ?? '', entry.seq ?? 0]);
      if (!seen.has(key)) {
        intoArtifacts.entries.push(entry);
        seen.add(key);
      }
    }
    await this.atomicWrite(this.artifactsFile(into), JSON.stringify(intoArtifacts, null, 2) + '\n');

    // 关联边：into 记录 causal → from；from 归档
    if (!tInto.edges.some((e) => e.target === from)) tInto.edges.push({ type: 'causal', target: from });
    tFrom.status = 'archived';
    tFrom.updatedAt = Date.now();
    tInto.status = tInto.status === 'draft' && combined.trim().length > 0 ? 'active' : tInto.status;
    tInto.updatedAt = Date.now();
    await this.atomicWrite(this.topicFile(from), JSON.stringify(tFrom, null, 2) + '\n');
    await this.atomicWrite(this.topicFile(into), JSON.stringify(tInto, null, 2) + '\n');

    // 会话映射：原 from 会话改指向 into
    for (const [sid, tid] of Object.entries(idx.sessionTopics)) {
      if (tid === from) idx.sessionTopics[sid] = into;
    }
    await this.saveIndex(idx);
    return tInto;
  }

  /** 存储根（调试/展示用）。 */
  get rootPath(): string {
    return this.root;
  }
}

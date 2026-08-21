/**
 * Router — /t 命令族（规格 §3.2）：管理 Topic 生命周期。
 *
 *   /t new <名称> [--domain <域>]      创建 Topic（Attributor 自动抓取资料）
 *   /t switch <id>                     切换会话活跃 Topic
 *   /t merge <a> <b> [--into <c>]      合并 b 入 a（或 c），b 归档
 *   /t list                            列出全部 Topic
 *   /t show [id]                       查看 Topic 详情（json/摘要/资料）
 *   /t edit <id> <文本...>             写入用户确认的摘要（draft → active）
 *   /t inject [id]                     把当前 Topic 摘要注入会话上下文
 *   /t link <a> <b> [--type causal|hierarchical]  建立关联边
 *   /t ignore                          放弃当前漂移建议（chip 的 [忽略]）
 *   /t rm <id>                         删除 Topic
 *   /t help                            用法
 *
 * 每个命令执行都会产生 command/run 会话事件 → Drift fold 自动清除待确认建议。
 */
import type { Topic } from '../memory/types.ts';
import { slugId } from '../memory/paths.ts';
import { WorkspaceMemoryStore } from '../memory/store.ts';
import { attribute } from './attributor.ts';
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

export class TopicRouter {
  private readonly store: WorkspaceMemoryStore;
  private readonly logger: { warn?: (msg: string) => void };

  constructor(store: WorkspaceMemoryStore, logger: { warn?: (msg: string) => void } = {}) {
    this.store = store;
    this.logger = logger;
  }

  /** 处理 /t <sub> <args...>。 */
  async handle(raw: string, session: SessionLike): Promise<CommandResult> {
    const trimmed = raw.trim();
    if (!trimmed) return this.list(session);
    const [verb, ...rest] = trimmed.split(/\s+/);
    const restText = rest.join(' ').trim();
    switch (verb) {
      case 'new': return this.create(restText, session);
      case 'switch': return this.switchTo(restText, session);
      case 'merge': return this.merge(restText);
      case 'list': return this.list(session);
      case 'show': return this.show(restText, session);
      case 'edit': return this.edit(restText, session);
      case 'inject': return this.inject(restText, session);
      case 'link': return this.link(restText);
      case 'ignore': return { kind: 'success', text: '已忽略漂移建议' };
      case 'rm': return this.remove(restText);
      case 'help': default: return this.help();
    }
  }

  // ---- new ----
  private async create(args: string, session: SessionLike): Promise<CommandResult> {
    if (!args) return { kind: 'error', text: '用法：/t new <名称> [--domain <域>]' };
    const match = args.match(/^(.+?)(?:\s+--domain\s+(\S+))?$/s);
    if (!match) return { kind: 'error', text: '用法：/t new <名称> [--domain <域>]' };
    const name = match[1].trim();
    const domain = (match[2] ?? '').trim();
    if (!name) return { kind: 'error', text: '名称不能为空' };
    const id = slugId(name);
    const existing = await this.store.loadTopic(id);
    if (existing) {
      await this.store.setSessionTopic(session.id, id);
      return { kind: 'success', text: `Topic 已存在，已切换：${id}（可用 /t edit ${id} <摘要> 补摘要）` };
    }
    const topic = await this.store.createTopic({ id, domain, goal: '', sessionId: session.id });
    // Attributor：抓取会话日志尾部的文件/日志片段
    const events = (session.log ?? []).slice(-400);
    const entries = attribute(events, { sinceSeq: -1 });
    if (entries.length > 0) await this.store.appendArtifacts(id, entries);
    return {
      kind: 'success',
      text: `已创建 Topic：${id}${domain ? `（域：${domain}）` : ''}，${entries.length} 条资料已入抽屉（/t edit ${id} <摘要> 确认摘要，/t show ${id} 查看）`,
    };
  }

  // ---- switch ----
  private async switchTo(arg: string, session: SessionLike): Promise<CommandResult> {
    const id = arg.trim();
    if (!id) return { kind: 'error', text: '用法：/t switch <id>' };
    const topic = await this.store.loadTopic(id);
    if (!topic) return { kind: 'error', text: `Topic 不存在：${id}（/t list 查看）` };
    await this.store.setSessionTopic(session.id, id);
    return { kind: 'success', text: `已切换到 Topic：${id}（${topic.goal || topic.domain || '无目标'}）` };
  }

  // ---- merge ----
  private async merge(args: string): Promise<CommandResult> {
    const match = args.match(/^(\S+)\s+(\S+)(?:\s+--into\s+(\S+))?$/);
    if (!match) return { kind: 'error', text: '用法：/t merge <a> <b> [--into <c>]' };
    const [, a, b] = match;
    const into = match[3] ?? a;
    const tFrom = await this.store.loadTopic(b);
    const tInto = await this.store.loadTopic(into);
    if (!tFrom || !tInto) return { kind: 'error', text: '合并失败：两个 Topic 必须都存在' };
    if (b === into) return { kind: 'error', text: '不能把归档方合并进自身' };
    await this.store.mergeTopics(b, into);
    return {
      kind: 'success',
      text: `已合并：${b} → ${into}（摘要拼接、资料去重、causal 边 ${into}→${b}，${b} 归档；/t show ${into} 查看）`,
    };
  }

  // ---- list ----
  private async list(session: SessionLike): Promise<CommandResult> {
    const idx = await this.store.loadIndex();
    const rows = Object.values(idx.topics).sort((x, y) => y.updatedAt - x.updatedAt);
    if (rows.length === 0) return { kind: 'success', text: '还没有 Topic。/t new <名称> 创建第一个' };
    const active = idx.sessionTopics[session.id];
    const lines = rows.map((t: Topic) => {
      const marker = t.id === active ? ' *' : '';
      const edge = t.edges.length > 0 ? ` [${t.edges.length}边]` : '';
      const sessions = t.sessionIds.length > 0 ? ` (${t.sessionIds.length}会话)` : '';
      return `${t.id}${marker} — ${t.status}${edge}${sessions} ${t.goal || t.domain || ''}`.trim();
    });
    return { kind: 'success', text: `Topic 清单（* = 当前会话）：\n${lines.join('\n')}` };
  }

  // ---- show ----
  private async show(arg: string, session: SessionLike): Promise<CommandResult> {
    let id = arg.trim();
    if (!id) {
      const active = await this.store.activeTopicFor(session.id);
      id = active?.id ?? '';
    }
    if (!id) return { kind: 'error', text: '当前会话未绑定 Topic。/t show <id> 或 /t new <名称>' };
    const topic = await this.store.loadTopic(id);
    if (!topic) return { kind: 'error', text: `Topic 不存在：${id}` };
    const summary = await this.store.readSummary(id);
    const artifacts = await this.store.readArtifacts(id);
    const edgeText = topic.edges.length > 0 ? topic.edges.map((e) => `${e.type}→${e.target}`).join(', ') : '无';
    const files = artifacts.entries.filter((e) => e.kind === 'file').map((e) => e.path).join(', ');
    const logs = artifacts.entries.filter((e) => e.kind === 'log').length;
    return {
      kind: 'success',
      text: [
        `Topic：${topic.id}（${topic.status}）`,
        `域：${topic.domain || '未设置'}｜目标：${topic.goal || '未设置'}`,
        `关联边：${edgeText}`,
        `摘要：${summary.trim() ? summary.trim().slice(0, 200) : `（未确认，/t edit ${topic.id} <摘要>）`}`,
        `资料：${files.length > 0 ? files.slice(0, 120) : '无'}${logs > 0 ? `（+ ${logs} 条日志片段）` : ''}`,
      ].join('\n'),
    };
  }

  // ---- edit（用户确认摘要，draft → active）----
  private async edit(args: string, session: SessionLike): Promise<CommandResult> {
    const match = args.match(/^(\S+)\s+([\s\S]+)$/);
    if (!match) {
      const active = await this.store.activeTopicFor(session.id);
      if (active) {
        const current = await this.store.readSummary(active.id);
        return {
          kind: 'success',
          text: `用法：/t edit <id> <摘要文本...>\n当前 ${active.id} 摘要：${current.trim() ? '\n' + current.trim() : '（空）'}`,
        };
      }
      return { kind: 'error', text: '用法：/t edit <id> <摘要文本...>' };
    }
    const [, id, text] = match;
    if (!(await this.store.loadTopic(id))) return { kind: 'error', text: `Topic 不存在：${id}` };
    const summary = text.trim();
    await this.store.writeSummary(id, summary);
    return { kind: 'success', text: `摘要已确认，Topic ${id} 状态 → active
${summary.slice(0, 200)}` };
  }

  // ---- inject（Agent 仅加载 Topic 摘要的近似实现）----
  private async inject(arg: string, session: SessionLike): Promise<CommandResult> {
    let id = arg.trim();
    if (!id) {
      const active = await this.store.activeTopicFor(session.id);
      id = active?.id ?? '';
    }
    if (!id) return { kind: 'error', text: '当前会话未绑定 Topic：/t inject <id> 或先 /t new' };
    const topic = await this.store.loadTopic(id);
    if (!topic) return { kind: 'error', text: `Topic 不存在：${id}` };
    const summary = await this.store.readSummary(id);
    if (!summary.trim()) return { kind: 'error', text: `Topic ${id} 摘要为空，先 /t edit ${id} <摘要>` };
    // 真正的 agent.inject 在 index.ts 的命令处理器里执行（需要 invocation.agent）
    return {
      kind: 'success',
      text: `Topic 摘要：${id}
${summary.trim().slice(0, 200)}`,
    };
  }

  // ---- link ----
  private async link(args: string): Promise<CommandResult> {
    const match = args.match(/^(\S+)\s+(\S+)(?:\s+--type\s+(causal|hierarchical))?$/);
    if (!match) return { kind: 'error', text: '用法：/t link <a> <b> [--type causal|hierarchical]' };
    const [, a, b] = match;
    const type = (match[3] ?? 'causal') as 'causal' | 'hierarchical';
    try {
      await this.store.linkTopics(a, b, type);
      return { kind: 'success', text: `已建立关联边：${a} --${type}--> ${b}` };
    } catch (error) {
      return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
    }
  }

  // ---- rm ----
  private async remove(arg: string): Promise<CommandResult> {
    const id = arg.trim();
    if (!id) return { kind: 'error', text: '用法：/t rm <id>' };
    if (!(await this.store.loadTopic(id))) return { kind: 'error', text: `Topic 不存在：${id}` };
    await this.store.removeTopic(id);
    return { kind: 'success', text: `已删除 Topic：${id}` };
  }

  private help(): CommandResult {
    return {
      kind: 'success',
      text: [
        'Topic 管理（/t）：',
        '  /t new <名称> [--domain <域>]    创建 Topic 并抓取资料',
        '  /t switch <id>                   切换活跃 Topic',
        '  /t merge <a> <b> [--into <c>]    合并（b 归档）',
        '  /t list                          列出全部',
        '  /t show [id]                     查看详情',
        '  /t edit <id> <摘要>              确认摘要（draft→active）',
        '  /t inject [id]                   注入摘要到上下文',
        '  /t link <a> <b> [--type causal|hierarchical]  关联边',
        '  /t ignore                        放弃漂移建议',
        '  /t rm <id>                       删除',
        '数据目录：' + this.store.rootPath,
      ].join('\n'),
    };
  }
}

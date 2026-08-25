import { slugId } from "../memory/paths.js";
import { WorkspaceMemoryStore } from "../memory/store.js";
import { attribute } from "./attributor.js";
import { collectSessionFeatures, matchSessionToTopics, relatedTopics, } from "./relatedness.js";
export class TopicRouter {
    store;
    logger;
    /** 关联度配置（非 LLM 规则级；注入 /t related|match 使用）。 */
    relatedness;
    constructor(store, logger = {}, opts = {}) {
        this.store = store;
        this.logger = logger;
        this.relatedness = opts.relatedness ?? { enabled: true, topK: 3, minScore: 0.5, maxHops: 2, weights: { edgeCausal: 1.0, edgeHierarchical: 0.6, edgeDecay: 0.5, pathFamily: 0.8, factKey: 0.5, sessionCo: 0.3, keyword: 0.2, summary: 0.4 } };
    }
    /** 处理 /t <sub> <args...>。 */
    async handle(raw, session) {
        const trimmed = raw.trim();
        if (!trimmed)
            return this.list(session);
        const [verb, ...rest] = trimmed.split(/\s+/);
        const restText = rest.join(' ').trim();
        switch (verb) {
            case 'new': return this.create(restText, session);
            case 'switch': return this.switchTo(restText, session);
            case 'merge': return this.merge(restText);
            case 'list': return this.list(session);
            case 'dump': return this.dump(restText, session);
            case 'show': return this.show(restText, session);
            case 'edit': return this.edit(restText, session);
            case 'inject': return this.inject(restText, session);
            case 'link': return this.link(restText);
            case 'related': return this.related(restText, session);
            case 'match': return this.match(restText, session);
            case 'fact': return this.fact(restText, session);
            case 'ignore': return { kind: 'success', text: '已忽略漂移建议' };
            case 'rm': return this.remove(restText);
            case 'help':
            default: return this.help();
        }
    }
    // ---- new ----
    async create(args, session) {
        if (!args)
            return { kind: 'error', text: '用法：/t new <名称> [--domain <域>]' };
        const match = args.match(/^(.+?)(?:\s+--domain\s+(\S+))?$/s);
        if (!match)
            return { kind: 'error', text: '用法：/t new <名称> [--domain <域>]' };
        const name = match[1].trim();
        const domain = (match[2] ?? '').trim();
        if (!name)
            return { kind: 'error', text: '名称不能为空' };
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
        if (entries.length > 0)
            await this.store.appendArtifacts(id, entries);
        return {
            kind: 'success',
            text: `已创建 Topic：${id}${domain ? `（域：${domain}）` : ''}，${entries.length} 条资料已入抽屉（/t edit ${id} <摘要> 确认摘要，/t show ${id} 查看）`,
        };
    }
    // ---- switch ----
    async switchTo(arg, session) {
        const id = arg.trim();
        if (!id)
            return { kind: 'error', text: '用法：/t switch <id>' };
        const topic = await this.store.loadTopic(id);
        if (!topic)
            return { kind: 'error', text: `Topic 不存在：${id}（/t list 查看）` };
        await this.store.setSessionTopic(session.id, id);
        return { kind: 'success', text: `已切换到 Topic：${id}（${topic.goal || topic.domain || '无目标'}）` };
    }
    // ---- merge ----
    async merge(args) {
        const match = args.match(/^(\S+)\s+(\S+)(?:\s+--into\s+(\S+))?$/);
        if (!match)
            return { kind: 'error', text: '用法：/t merge <a> <b> [--into <c>]' };
        const [, a, b] = match;
        const into = match[3] ?? a;
        const tFrom = await this.store.loadTopic(b);
        const tInto = await this.store.loadTopic(into);
        if (!tFrom || !tInto)
            return { kind: 'error', text: '合并失败：两个 Topic 必须都存在' };
        if (b === into)
            return { kind: 'error', text: '不能把归档方合并进自身' };
        await this.store.mergeTopics(b, into);
        return {
            kind: 'success',
            text: `已合并：${b} → ${into}（摘要拼接、资料去重、causal 边 ${into}→${b}，${b} 归档；/t show ${into} 查看）`,
        };
    }
    // ---- dump（客户端面板数据源：单行 JSON，供 TopicPanel 解析渲染）----
    async dump(args, session) {
        const trimmed = args.trim();
        if (trimmed.startsWith('show')) {
            let id = trimmed.replace(/^show\s*/, '').trim();
            if (!id) {
                const active = await this.store.activeTopicFor(session.id);
                id = active?.id ?? '';
            }
            if (!id)
                return { kind: 'success', text: JSON.stringify({ error: 'no-topic' }) };
            const topic = await this.store.loadTopic(id);
            if (!topic)
                return { kind: 'success', text: JSON.stringify({ error: 'not-found', id }) };
            const summary = await this.store.readSummary(id);
            const artifacts = await this.store.readArtifacts(id);
            return { kind: 'success', text: JSON.stringify({ topic, summary, artifacts }) };
        }
        const idx = await this.store.loadIndex();
        return {
            kind: 'success',
            text: JSON.stringify({
                activeTopicId: idx.sessionTopics[session.id] ?? null,
                topics: Object.values(idx.topics).sort((a, b) => b.updatedAt - a.updatedAt),
            }),
        };
    }
    // ---- list ----
    async list(session) {
        const idx = await this.store.loadIndex();
        const rows = Object.values(idx.topics).sort((x, y) => y.updatedAt - x.updatedAt);
        if (rows.length === 0)
            return { kind: 'success', text: '还没有 Topic。/t new <名称> 创建第一个' };
        const active = idx.sessionTopics[session.id];
        const lines = rows.map((t) => {
            const marker = t.id === active ? ' *' : '';
            const edge = t.edges.length > 0 ? ` [${t.edges.length}边]` : '';
            const sessions = t.sessionIds.length > 0 ? ` (${t.sessionIds.length}会话)` : '';
            return `${t.id}${marker} — ${t.status}${edge}${sessions} ${t.goal || t.domain || ''}`.trim();
        });
        return { kind: 'success', text: `Topic 清单（* = 当前会话）：\n${lines.join('\n')}` };
    }
    // ---- show ----
    async show(arg, session) {
        let id = arg.trim();
        if (!id) {
            const active = await this.store.activeTopicFor(session.id);
            id = active?.id ?? '';
        }
        if (!id)
            return { kind: 'error', text: '当前会话未绑定 Topic。/t show <id> 或 /t new <名称>' };
        const topic = await this.store.loadTopic(id);
        if (!topic)
            return { kind: 'error', text: `Topic 不存在：${id}` };
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
    async edit(args, session) {
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
        if (!(await this.store.loadTopic(id)))
            return { kind: 'error', text: `Topic 不存在：${id}` };
        const summary = text.trim();
        await this.store.writeSummary(id, summary);
        return { kind: 'success', text: `摘要已确认，Topic ${id} 状态 → active
${summary.slice(0, 200)}` };
    }
    // ---- inject（Agent 仅加载 Topic 摘要的近似实现）----
    async inject(arg, session) {
        let id = arg.trim();
        if (!id) {
            const active = await this.store.activeTopicFor(session.id);
            id = active?.id ?? '';
        }
        if (!id)
            return { kind: 'error', text: '当前会话未绑定 Topic：/t inject <id> 或先 /t new' };
        const topic = await this.store.loadTopic(id);
        if (!topic)
            return { kind: 'error', text: `Topic 不存在：${id}` };
        const summary = await this.store.readSummary(id);
        if (!summary.trim())
            return { kind: 'error', text: `Topic ${id} 摘要为空，先 /t edit ${id} <摘要>` };
        // 真正的 agent.inject 在 index.ts 的命令处理器里执行（需要 invocation.agent）
        return {
            kind: 'success',
            text: `Topic 摘要：${id}
${summary.trim().slice(0, 200)}`,
        };
    }
    // ---- link ----
    async link(args) {
        const match = args.match(/^(\S+)\s+(\S+)(?:\s+--type\s+(causal|hierarchical))?$/);
        if (!match)
            return { kind: 'error', text: '用法：/t link <a> <b> [--type causal|hierarchical]' };
        const [, a, b] = match;
        const type = (match[3] ?? 'causal');
        try {
            await this.store.linkTopics(a, b, type);
            return { kind: 'success', text: `已建立关联边：${a} --${type}--> ${b}` };
        }
        catch (error) {
            return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
        }
    }
    // ---- related（主题→主题关联度，非 LLM）----
    async related(arg, session) {
        const json = /--json/.test(arg);
        let id = arg.replace(/--json/g, '').trim();
        if (!id) {
            const active = await this.store.activeTopicFor(session.id);
            id = active?.id ?? '';
        }
        if (!id)
            return { kind: 'error', text: '当前会话未绑定 Topic：/t related <id> [--json]' };
        if (!(await this.store.loadTopic(id)))
            return { kind: 'error', text: `Topic 不存在：${id}` };
        const rels = await relatedTopics(this.store, id, this.relatedness);
        if (json)
            return { kind: 'success', text: JSON.stringify({ topicId: id, related: rels }) };
        if (rels.length === 0)
            return { kind: 'success', text: `Topic ${id} 暂无关联主题（得分 ≥ ${this.relatedness.minScore}）。可用 /t link 建立显式关联边，或 /t edit 补摘要后重试。` };
        const lines = rels.map((r2) => `  ${r2.topicId}（得分 ${r2.score}：${r2.reasons.join('; ')}）`);
        return { kind: 'success', text: [`Topic ${id} 的关联主题（规则级，非 LLM）：`, ...lines].join('\n') };
    }
    // ---- match（会话→主题匹配，服务端升级客户端弱匹配）----
    async match(arg, session) {
        const json = /--json/.test(arg);
        const active = await this.store.activeTopicFor(session.id);
        const features = collectSessionFeatures(session);
        if (active) {
            const facts = await this.store.activeFacts(active.id);
            features.factKeys = facts.map((f) => f.factKey ?? '').filter(Boolean);
        }
        const hits = await matchSessionToTopics(this.store, features, this.relatedness);
        if (json)
            return { kind: 'success', text: JSON.stringify({ activeTopicId: active?.id ?? null, matches: hits }) };
        if (hits.length === 0)
            return { kind: 'success', text: '未命中已定义 Topic。可用 /t new <名称> 为当前上下文创建话题' };
        const lines = hits.map((h) => `  ${h.topicId}（得分 ${h.score}：${h.reasons.join('; ')}）`);
        return { kind: 'success', text: ['上下文命中话题（最近用户输入 + 工具调用特征）：', ...lines].join('\n') };
    }
    // ---- fact（事实条目管理，含冲突替换）----
    async fact(arg, session) {
        const [sub, ...rest] = arg.trim().split(/\s+/);
        if (sub === 'add') {
            const m = rest.join(' ').match(/^(\S+)\s+(\S+)\s+([\s\S]+)$/);
            if (!m)
                return { kind: 'error', text: '用法：/t fact add <topicId> <factKey> <value>' };
            const [, id, factKey, value] = m;
            if (!(await this.store.loadTopic(id)))
                return { kind: 'error', text: `Topic 不存在：${id}` };
            const before = await this.store.activeFacts(id);
            const manifest = await this.store.appendFacts(id, [{ factKey, value, source: { turn: 'cli', tool: 'fact' } }]);
            const after = await this.store.activeFacts(id);
            const replaced = before.find((f) => f.factKey === factKey && f.value !== value);
            if (replaced) {
                return { kind: 'success', text: `冲突替换：${id} 的 ${factKey} ${replaced.value} → ${value}（旧条目 superseded，后者为准）` };
            }
            return { kind: 'success', text: `已记录事实：${id} ${factKey} = ${value}（抽屉共 ${manifest.entries.length} 条）` };
        }
        // show / active（默认当前会话主题）
        let id = rest.join(' ').trim();
        if (!id) {
            const active = await this.store.activeTopicFor(session.id);
            id = active?.id ?? '';
        }
        if (!id)
            return { kind: 'error', text: '当前会话未绑定 Topic：/t fact show [topicId]' };
        const facts = await this.store.activeFacts(id);
        if (facts.length === 0)
            return { kind: 'success', text: `Topic ${id} 暂无 active 事实（/t fact add ${id} <factKey> <value>）` };
        const lines = facts.map((f) => `  ${f.factKey} = ${f.value}`);
        return { kind: 'success', text: [`Topic ${id} 当前有效事实：`, ...lines].join('\n') };
    }
    // ---- rm ----
    async remove(arg) {
        const id = arg.trim();
        if (!id)
            return { kind: 'error', text: '用法：/t rm <id>' };
        if (!(await this.store.loadTopic(id)))
            return { kind: 'error', text: `Topic 不存在：${id}` };
        await this.store.removeTopic(id);
        return { kind: 'success', text: `已删除 Topic：${id}` };
    }
    help() {
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
                '  /t related [id] [--json]          主题关联度（非 LLM）',
                '  /t match [--json]                 会话→主题匹配（服务端）',
                '  /t fact add <id> <key> <value>    记录事实（冲突后者为准）',
                '  /t fact show [id]                 查看 active 事实',
                '  /t dump [list|show <id>]          输出 JSON（客户端面板数据源）',
                '  /t ignore                        放弃漂移建议',
                '  /t rm <id>                       删除',
                '数据目录：' + this.store.rootPath,
            ].join('\n'),
        };
    }
}

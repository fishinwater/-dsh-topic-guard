/**
 * dsh-topic-guard v0.2.0 — Topic-Aware Workspace Memory for DeepSeek Harness.
 *
 * 三层架构（规格 §3）：
 * - 数据层 memory/：.harness/topics/ 布局（topic.json + summary.md + artifacts/），
 *   默认根 ~/.dsh/topics/（config rootDir 可覆盖为项目目录以便 Git 提交）。
 * - 控制层 manager/：Drift Detector（规则级投影 fold）+ Router（/t 命令族）+ Attributor。
 * - 交互层 client/：非阻塞 Inline Chip（客户端 bundle，conversation.input.dock 槽位）。
 *
 * 桥接：漂移建议通过会话投影单元（key 'topic-guard'）实时推给客户端（session/projection 帧，
 * 永不落盘、断线重连由宿主重算）；chip 的 [新建]/[忽略] 通过 /t new|ignore 命令回传（command/run
 * 事件同时驱动 fold 清除建议）。
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { WorkspaceMemoryStore } from "./memory/store.js";
import { resolveRoot } from "./memory/paths.js";
import { TopicRouter } from "./manager/router.js";
import { applyDrift, initDriftState, viewOf, } from "./manager/drift.js";
import { jsonSchemaValidator, isDriftState } from "./memory/schema.js";
export const name = 'topic-guard';
// 配置校验：与 DSH 内置插件一致使用 schemastery 普通 schema（缺省由构造器兜底，
// 不做 .optional() 链——cordis 对缺失键宽容，与旧版 topic-guard 行为一致）。
const thresholdSchema = z.number().min(1);
const weightSchema = z.number().min(0);
export class TopicGuard extends Service {
    static inject = ['commands', 'sessionTitle', 'agents'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static Config = z.object({
        /** 记忆存储根；缺省 ~/.dsh/topics（用户决策 2：全局固定目录）。 */
        rootDir: z.string(),
        /** 总开关。 */
        enabled: z.boolean(),
        /** 漂移检测参数（规则级，非 LLM）。 */
        drift: z.object({
            threshold: thresholdSchema,
            weights: z.object({
                keyword: weightSchema,
                pathJump: weightSchema,
                toolSwitch: weightSchema,
            }),
            /** 关键词规则：候选主题名 → 关键词列表。 */
            keywords: z.dict(z.array(z.string())),
            cooldownMessages: z.number().min(1),
            /** 新会话未绑定 Topic 时，累计多少条用户消息后自动建议创建。默认 3。 */
            autoSuggestAfterMessages: z.number().min(1),
        }),
    });
    store;
    router;
    /** sessionId → 注入文本（systemPrompt context 的同步数据源；/t 命令后刷新）。 */
    topicCache = new Map();
    constructor(ctx, config = {}) {
        super(ctx, 'topic-guard');
        const drift = (config.drift ?? {});
        const weights = (drift.weights ?? {});
        this.config = {
            rootDir: typeof config.rootDir === 'string' ? config.rootDir : undefined,
            enabled: config.enabled !== false,
            drift: {
                threshold: typeof drift.threshold === 'number' ? drift.threshold : 50,
                weights: {
                    keyword: typeof weights.keyword === 'number' ? weights.keyword : 25,
                    pathJump: typeof weights.pathJump === 'number' ? weights.pathJump : 30,
                    toolSwitch: typeof weights.toolSwitch === 'number' ? weights.toolSwitch : 20,
                },
                keywords: drift.keywords ?? {},
                cooldownMessages: typeof drift.cooldownMessages === 'number' ? drift.cooldownMessages : 3,
                autoSuggestAfterMessages: typeof drift.autoSuggestAfterMessages === 'number' ? drift.autoSuggestAfterMessages : 3,
            },
        };
        this.store = new WorkspaceMemoryStore(resolveRoot(this.config.rootDir));
        this.router = new TopicRouter(this.store, ctx.logger ?? {});
        void this.store.init().catch((error) => {
            ctx.logger?.warn?.(`topic-guard: 初始化记忆目录失败: ${error instanceof Error ? error.message : String(error)}`);
        });
        this.registerProjection();
        this.registerCommands();
        this.registerTopicCompatCommand();
        this.registerTopicInjection();
    }
    /**
     * 会话投影单元：Drift Detector 作为纯 fold 运行，建议经 session/projection 帧
     * 实时推给浏览器端 chip（key 'topic-guard'）。
     */
    registerProjection() {
        const cfg = this.config;
        const ctx = this.ctx;
        // 无投影注册表的装配（headless 等）降级：命令与存储仍可用
        ctx.inject(['sessionProjections'], (sub) => {
            // stateSchema/viewSchema 的 zod 类型在目标 profile 不可解析（未装 zod）：
            // 用形状校验器替代（仅被调用 .parse(v)），定义整体断言为 any。
            const definition = {
                key: 'topic-guard',
                stateSchema: jsonSchemaValidator('drift-state', isDriftState),
                init: () => initDriftState(),
                apply: (state, event) => applyDrift(state, event, cfg.drift),
                wire: {
                    viewSchema: jsonSchemaValidator('drift-view', (v) => v !== null && typeof v === 'object'),
                    view: (state) => viewOf(state),
                },
                stateVersion: 1,
            };
            sub.sessionProjections.register(definition);
        });
    }
    /** 注册 /t 命令族。 */
    registerCommands() {
        const ctx = this.ctx;
        const router = this.router;
        const store = this.store;
        // 直接注册（与内置 dsh-command-goal 一致：commands.register 内部用 layers.effect 管理生命周期，
        // 不可再包 ctx.effect/generator，否则 generator 惰性导致命令从未注册）。
        ctx.commands.register({
            name: 't',
            description: 'Topic 管理：new/switch/merge/list/show/edit/inject/link/ignore/rm',
            // 必须声明 input：DSH 的 slash 裁决对"无 input 声明 + 带参数"的命令会放弃认领，
            // 把整行当作普通消息发给 LLM（用户主权被破坏）。声明后 /t xxx 一律本地执行。
            input: { hint: 'new|switch|merge|list|show|edit|inject|link|ignore|rm [<args>]' },
            handler: async (invocation) => {
                const raw = (invocation.rawInput ?? '').trim();
                const session = invocation.agent.session;
                if (raw.startsWith('inject')) {
                    return await injectSummary(store, invocation.agent, raw);
                }
                const result = await router.handle(raw, session);
                // /t 命令可能变更活跃 Topic/摘要 → 刷新上下文注入缓存
                void this.refreshTopicContext(session.id);
                return { kind: result.kind, text: result.text };
            },
        });
    }
    /**
     * 刷新一个会话的 Topic 注入缓存（异步读 store）。
     * 无活跃 Topic → 清空（provider 返回空字符串，不贡献上下文）。
     */
    async refreshTopicContext(sessionId) {
        try {
            const topic = await this.store.activeTopicFor(sessionId);
            if (!topic) {
                this.topicCache.delete(sessionId);
                return;
            }
            const summary = await this.store.readSummary(topic.id);
            const goalText = topic.goal || topic.domain || '';
            const summaryText = summary.trim().slice(0, 600);
            const lines = [
                `【当前 Topic：${topic.id}】${topic.domain ? `（${topic.domain}）` : ''}`,
                goalText ? `目标：${goalText}` : '',
                summaryText ? `摘要：${summaryText}` : '',
            ];
            this.topicCache.set(sessionId, lines.filter(Boolean).join('\n'));
        }
        catch (error) {
            this.topicCache.delete(sessionId);
        }
    }
    /**
     * 在 agent 作用域注册 systemPrompt context：每次模型请求组装时同步注入当前 Topic。
     * scoped 注册（agent.ctx）保证只对该 agent 的组装生效（多会话互不污染）。
     */
    attachTopicContext(agent) {
        try {
            const sessionId = agent?.session?.id;
            if (!sessionId || typeof agent.ctx?.inject !== 'function')
                return;
            agent.ctx.inject(['systemPrompt'], (sub) => {
                sub.systemPrompt.context({
                    name: 'topic-guard',
                    order: 300,
                    text: () => this.topicCache.get(sessionId) ?? '',
                });
            });
        }
        catch (error) {
            this.ctx.logger?.warn?.(`topic-guard: attachTopicContext failed: ${String(error)}`);
        }
    }
    /**
     * 覆盖已有 agent + 监听未来 agent：
     * 插件加载时 agent 可能已创建（agent/created 不会重放），需主动扫描 roots。
     */
    registerTopicInjection() {
        const ctx = this.ctx;
        try {
            const roots = typeof ctx.agents?.roots === 'function' ? ctx.agents.roots() : [];
            for (const agent of roots)
                this.attachTopicContext(agent);
        }
        catch (error) {
            ctx.logger?.warn?.(`topic-guard: scan existing agents failed: ${String(error)}`);
        }
        ctx.on('agent/created', ({ agent }) => {
            this.attachTopicContext(agent);
        });
        ctx.on('agent/disposed', ({ agent }) => {
            const sessionId = agent?.session?.id;
            if (sessionId)
                this.topicCache.delete(sessionId);
        });
    }
    /** 兼容旧版：/topic <标题> 直接重命名会话标题（不弹窗）。 */
    registerTopicCompatCommand() {
        const ctx = this.ctx;
        ctx.commands.register({
            name: 'topic',
            description: '设置/重命名当前会话主题标题',
            input: { hint: '<新标题>' },
            handler: async (invocation) => {
                const raw = (invocation.rawInput ?? '').trim();
                const session = invocation.agent.session;
                if (!raw)
                    return { kind: 'error', text: '用法：/topic <标题>（或用 /t 管理 Topic 资产）' };
                try {
                    ctx.sessionTitle.rename(session, raw);
                    return { kind: 'success', text: `会话主题已设为：${raw}` };
                }
                catch (error) {
                    return { kind: 'error', text: `设置主题失败：${error instanceof Error ? error.message : String(error)}` };
                }
            },
        });
    }
}
/** /t inject 实现：把当前 Topic 摘要以 agent.inject 注入会话上下文。 */
async function injectSummary(store, agent, raw) {
    const arg = raw.replace(/^inject/, '').trim();
    let id = arg;
    if (!id) {
        const session = agent?.session;
        if (session) {
            const active = await store.activeTopicFor(session.id);
            id = active?.id ?? '';
        }
    }
    if (!id)
        return { kind: 'error', text: '当前会话未绑定 Topic：/t inject <id> 或先 /t new' };
    const topic = await store.loadTopic(id);
    if (!topic)
        return { kind: 'error', text: `Topic 不存在：${id}` };
    const summary = await store.readSummary(id);
    if (!summary.trim())
        return { kind: 'error', text: `Topic ${id} 摘要为空，先 /t edit ${id} <摘要>` };
    if (!agent || typeof agent.inject !== 'function') {
        return { kind: 'success', text: `（无可用 agent，未注入）Topic ${id} 摘要：
${summary.trim().slice(0, 300)}` };
    }
    try {
        const { createMessage } = await import('@deepseek-ai/dsh-llm');
        const message = createMessage({
            role: 'user',
            source: {
                kind: 'plugin',
                plugin: 'dsh-topic-guard',
                form: 'snapshot',
                sections: [{ name: `Topic:${id}`, text: summary }],
            },
            content: [{ type: 'text', text: `【当前 Topic 摘要：${id}】
${summary}` }],
        });
        agent.inject(message);
        return { kind: 'success', text: `已注入 Topic 摘要到会话上下文：${id}` };
    }
    catch (error) {
        return { kind: 'error', text: `注入失败：${error instanceof Error ? error.message : String(error)}` };
    }
}
export default TopicGuard;

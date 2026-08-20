import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

/**
 * dsh-topic-guard: human-confirmed session topic management.
 *
 * - Every N direct user messages (config `checkEvery`, default 5), pops a
 *   topic-confirmation dialog via `ctx.userQuestions.ask()`.
 * - Options: keep going / rename this session (custom title input) / suggest a
 *   fresh session.
 * - Registers the global `/topic` command: `/topic` pops the dialog;
 *   `/topic <title>` renames the current session directly.
 *
 * Listens on the root context's `session/event` feed (fire-and-forget, never
 * blocks the agent loop) and counts only direct human prompts
 * (source.kind === 'user'), so injected context (file notices, skills,
 * goal continuations) never triggers a dialog.
 */
const name = "topic-guard";

const checkEverySchema = z.number().step(1).min(1);
const enabledSchema = z.boolean();
const topicQuestionSchema = z.string();
const topicKeepLabelSchema = z.string();
const topicRenameLabelSchema = z.string();
const topicNewLabelSchema = z.string();

class TopicGuard extends Service {
  static inject = ["userQuestions", "sessionTitle", "commands", "agents"];

  static Config = z.object({
    /** Pop the topic dialog after this many direct user messages. Default 5. */
    checkEvery: checkEverySchema,
    /** Master switch for the automatic dialog. Default true. */
    enabled: enabledSchema,
    /** Question text shown in the automatic dialog. */
    topicQuestion: topicQuestionSchema,
    /** Label of the "keep going" option. */
    topicKeepLabel: topicKeepLabelSchema,
    /** Label of the "rename session" option. */
    topicRenameLabel: topicRenameLabelSchema,
    /** Label of the "suggest a fresh session" option. */
    topicNewLabel: topicNewLabelSchema,
  });

  constructor(ctx, config = {}) {
    super(ctx);
    this.config = {
      checkEvery: 5,
      enabled: true,
      topicQuestion: "当前会话似乎积累了不少内容，确认一下主题？",
      topicKeepLabel: "主题未变，继续当前会话",
      topicRenameLabel: "重命名当前会话（输入新主题）",
      topicNewLabel: "本会话混入了多个主题，建议新建会话",
      ...config,
    };
    /** session -> direct-user-message counter */
    this.counters = new WeakMap();
    /** session -> timestamp of last dialog (ms), to avoid double-pops */
    this.lastAskAt = new WeakMap();

    this.registerSessionFeed();
    this.registerTopicCommand();
  }

  /** Count direct human messages on the root session feed. */
  registerSessionFeed() {
    this.ctx.on("session/event", (session, event) => {
      if (!this.config.enabled) return;
      if (event.type !== "user/message") return;
      const msg = event.data;
      if (msg?.source?.kind !== "user") return; // injected context is not a human prompt
      const count = (this.counters.get(session) ?? 0) + 1;
      this.counters.set(session, count);
      if (count >= this.config.checkEvery) {
        this.counters.set(session, 0);
        const now = Date.now();
        const last = this.lastAskAt.get(session) ?? 0;
        if (now - last < 15_000) return; // debounce: at most one pop per 15s
        this.lastAskAt.set(session, now);
        void this.askTopic(session);
      }
    });
  }

  /** Build the shared topic question payload. */
  buildQuestion(session) {
    const current = this.ctx.sessionTitle.get(session);
    return [
      {
        id: "topic",
        question: this.config.topicQuestion,
        detail: current ? `当前会话标题：${current.title}` : undefined,
        options: [
          { label: this.config.topicKeepLabel, description: "主题未变，继续讨论" },
          { label: this.config.topicRenameLabel, description: "输入新主题作为会话标题" },
          { label: this.config.topicNewLabel, description: "避免旧主题上下文污染新任务" },
        ],
      },
    ];
  }

  /** Handle one dialog answer. Returns a short human-readable outcome. */
  handleAnswer(session, answer) {
    const item = answer?.answers?.[0];
    const label = item?.selected?.[0];
    if (!label) return "主题确认已取消";
    if (label === this.config.topicRenameLabel) {
      const title = item.custom?.trim();
      if (!title) return "未输入新主题，会话标题保持不变";
      try {
        this.ctx.sessionTitle.rename(session, title);
        return `会话主题已设为：${title}`;
      } catch (error) {
        return `设置主题失败：${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (label === this.config.topicNewLabel) {
      return "建议新建一个会话处理当前主题，避免上下文混杂";
    }
    return "继续当前会话";
  }

  /** Pop the topic dialog for one session (fire-and-forget, never throws). */
  async askTopic(session) {
    try {
      const agent = this.findAgent(session);
      const answer = await this.ctx.userQuestions.ask({
        questions: this.buildQuestion(session),
        ...(agent ? { agent } : {}),
      });
      this.handleAnswer(session, answer);
    } catch (error) {
      this.ctx.logger?.warn?.(`topic-guard: dialog failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Match the live root agent driving a session, when one exists. */
  findAgent(session) {
    try {
      return this.ctx.agents.roots().find((agent) => agent.session.id === session.id);
    } catch {
      return undefined;
    }
  }

  /** Register the global /topic command. */
  registerTopicCommand() {
    const ctx = this.ctx;
    const self = this;
    ctx.effect(function* () {
      yield ctx.commands.register({
        name: "topic",
        description: "确认或设置当前会话主题",
        handler: async (invocation) => {
          const raw = invocation.rawInput.trim();
          const session = invocation.agent.session;
          if (raw) {
            try {
              ctx.sessionTitle.rename(session, raw);
              return { kind: "success", text: `会话主题已设为：${raw}` };
            } catch (error) {
              return { kind: "error", text: `设置主题失败：${error instanceof Error ? error.message : String(error)}` };
            }
          }
          try {
            const answer = await ctx.userQuestions.ask({
              agent: invocation.agent,
              questions: self.buildQuestion(session),
              signal: invocation.signal,
            });
            return { kind: "success", text: self.handleAnswer(session, answer) };
          } catch (error) {
            if (invocation.signal?.aborted) return { kind: "error", text: "主题确认已取消" };
            return { kind: "error", text: `主题确认失败：${error instanceof Error ? error.message : String(error)}` };
          }
        },
      });
    }, "topic-guard lifecycle");
  }
}

export { TopicGuard, TopicGuard as default, name };

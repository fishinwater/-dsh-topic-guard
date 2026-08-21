/**
 * dsh-topic-guard client bundle (browser half).
 * 非阻塞 Inline Chip：漂移建议经会话投影 key 'topic-guard'（session/projection 帧）实时到达；
 * Chip 渲染在 conversation.input.dock（composer 卡片上方独立行），3 秒自动消失、不抢焦点；
 * [新建]→/t new，[忽略]→/t ignore（经 session.command 回传，command/run 事件同时驱动服务端 fold 清除建议）。
 *
 * 手写 classic script（window.__ModuleLoader__.load 注册），不依赖构建链；
 * 纯 React.createElement（无 JSX 变换），内联 CSS（与内置 bundle 相同的注入约定）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-topic-guard',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const React = require('react');
    const { useState, useEffect } = React;

    const CSS_ID = 'dsh-topic-guard/TopicDriftChip.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-topic-guard';
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = [
        '.dsh-tg-dock{box-sizing:border-box;display:flex;align-items:center;gap:8px;margin:0 auto;width:calc(100% - 32px);max-width:calc(var(--dsh-composer-card-max-width, 720px) - 4 * var(--dsh-composer-dock-inset, 8px));min-height:30px;padding:4px 8px 4px 12px;border:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1));border-radius:10px;background:var(--dsw-specific-tip, rgba(0,0,0,.03));font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary, inherit)}',
        '.dsh-tg-text{color:var(--dsw-alias-label-secondary, inherit)}',
        '.dsh-tg-candidate{font-weight:600;margin-right:auto;color:var(--dsw-alias-label-primary, inherit)}',
        '.dsh-tg-btn{flex:none;border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15));background:var(--dsw-alias-bg-base, #fff);color:var(--dsw-alias-label-primary, inherit);border-radius:6px;padding:2px 10px;font-size:12px;line-height:20px;cursor:pointer}',
        '.dsh-tg-btn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06))}',
        '.dsh-tg-create{border-color:var(--dsw-alias-state-business-primary, #2f7cf6);color:var(--dsw-alias-state-business-primary, #2f7cf6)}',
      ].join('');
      document.head.appendChild(tag);
    }
    const dismissed = new Map(); // sessionId -> Set<nonce>
    const CHIP_TTL_MS = 3000;
    function isDismissed(sessionId, nonce) {
      const set = dismissed.get(sessionId);
      return set ? set.has(nonce) : false;
    }
    function markDismissed(sessionId, nonce) {
      let set = dismissed.get(sessionId);
      if (!set) { set = new Set(); dismissed.set(sessionId, set); }
      set.add(nonce);
    }
    function TopicDriftChip(props) {
      const sessionId = props.sessionId;
      const inject = props.inject;
      const [suggestion, setSuggestion] = useState(() => inject.getSuggestion());
      useEffect(() => {
        return inject.subscribe(() => setSuggestion(inject.getSuggestion()));
      }, [inject]);
      useEffect(() => {
        if (!suggestion) return undefined;
        const nonce = suggestion.nonce;
        const timer = setTimeout(() => {
          markDismissed(sessionId, nonce);
          setSuggestion(null);
        }, CHIP_TTL_MS);
        return () => clearTimeout(timer);
      }, [suggestion ? suggestion.nonce : null, sessionId]);
      if (!suggestion || isDismissed(sessionId, suggestion.nonce)) return null;
      const dismissNow = () => {
        markDismissed(sessionId, suggestion.nonce);
        setSuggestion(null);
      };
      const onCreate = () => {
        const line = '/t new ' + suggestion.candidate;
        dismissNow();
        void inject.runCommand(line);
      };
      const onIgnore = () => {
        dismissNow();
        void inject.runCommand('/t ignore');
      };
      return React.createElement('div', { className: 'dsh-tg-dock', 'data-topic-guard-chip': true },
        React.createElement('span', { className: 'dsh-tg-text' }, '检测到可能的新话题：'),
        React.createElement('strong', { className: 'dsh-tg-candidate' }, suggestion.candidate),
        React.createElement('button', { type: 'button', className: 'dsh-tg-btn dsh-tg-create', onClick: onCreate }, '新建'),
        React.createElement('button', { type: 'button', className: 'dsh-tg-btn', onClick: onIgnore }, '忽略'),
      );
    }
    const NS = 'topic-guard';
    const PROJECTION_KEY = 'topic-guard';
    const inject = ['slots', 'sessions', 'connection'];

    function apply(ctx) {
      const sessions = ctx.sessions;
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: NS,
        order: 5,
        inject: (sessionId) => {
          const binding = sessions.binding ? sessions.binding(sessionId) : undefined;
          const face = binding && binding.session && binding.session.projections
            ? binding.session.projections.faceOf(PROJECTION_KEY)
            : undefined;
          return {
            getSuggestion: () => {
              const snap = face && typeof face.getSnapshot === 'function' ? face.getSnapshot() : null;
              return snap ? snap.suggestion || null : null;
            },
            subscribe: (fn) => (face && typeof face.subscribe === 'function' ? face.subscribe(fn) : () => {}),
            runCommand: async (line) => {
              try {
                const session = binding && binding.session ? binding.session : undefined;
                if (session && typeof session.command === 'function') {
                  const result = await session.command(line);
                  return Boolean(result && result.ok && result.value && result.value.matched);
                }
              } catch (error) {
                /* best-effort */
              }
              return false;
            },
          };
        },
      }, TopicDriftChip));
    }

    exports.name = 'topic-guard-client';
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});

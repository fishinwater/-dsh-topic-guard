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
    const { useState, useEffect, useSyncExternalStore } = React;

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
    // ---- Topic 面板 CSS ----
    const PANEL_CSS_ID = 'dsh-topic-guard/TopicPanel.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + PANEL_CSS_ID + '"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-topic-guard';
      tag.dataset.pluginCss = PANEL_CSS_ID;
      tag.textContent = [
        '.dsh-tg-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.18);z-index:9000}',
        '.dsh-tg-panel{position:fixed;top:56px;right:16px;width:420px;max-width:calc(100vw - 32px);max-height:calc(100vh - 90px);overflow:auto;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.18);z-index:9001;padding:14px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,inherit)}',
        '.dsh-tg-ph{display:flex;align-items:center;gap:8px;margin-bottom:10px}',
        '.dsh-tg-pt{font-weight:600;font-size:14px;flex:1}',
        '.dsh-tg-x{border:none;background:transparent;cursor:pointer;font-size:16px;color:var(--dsw-alias-label-tertiary,inherit);padding:2px 6px;border-radius:6px}',
        '.dsh-tg-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
        '.dsh-tg-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer}',
        '.dsh-tg-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
        '.dsh-tg-row.active{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.07))}',
        '.dsh-tg-id{font-weight:600;white-space:nowrap}',
        '.dsh-tg-badge{flex:none;font-size:11px;padding:0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-secondary,inherit)}',
        '.dsh-tg-goal{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,inherit)}',
        '.dsh-tg-sec{margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));font-weight:600}',
        '.dsh-tg-sum{width:100%;box-sizing:border-box;min-height:90px;margin:6px 0;padding:8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));border-radius:8px;font-size:12px;line-height:18px;font-family:inherit;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,inherit)}',
        '.dsh-tg-file{display:block;padding:2px 0;color:var(--dsw-alias-state-business-primary,#2f7cf6);word-break:break-all}',
        '.dsh-tg-log{padding:4px 8px;margin:3px 0;background:var(--dsw-specific-tip,rgba(0,0,0,.03));border-radius:6px;font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-secondary,inherit)}',
        '.dsh-tg-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}',
        '.dsh-tg-abtn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,inherit);border-radius:8px;padding:3px 12px;font-size:12px;cursor:pointer}',
        '.dsh-tg-abtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
        '.dsh-tg-abtn.primary{border-color:var(--dsw-alias-state-business-primary,#2f7cf6);color:var(--dsw-alias-state-business-primary,#2f7cf6)}',
        '.dsh-tg-abtn.danger{border-color:var(--dsw-alias-state-error-primary,#d64545);color:var(--dsw-alias-state-error-primary,#d64545)}',
        '.dsh-tg-hbtn{border:none;background:transparent;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font-size:12px;padding:2px 8px;border-radius:6px;white-space:nowrap}',
        '.dsh-tg-hbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
        '.dsh-tg-empty{color:var(--dsw-alias-label-caption,inherit);padding:8px 4px}',
        '.dsh-tg-err{color:var(--dsw-alias-state-error-primary,#d64545);padding:8px 4px}',
        '.dsh-tg-load{color:var(--dsw-alias-label-caption,inherit);padding:8px 4px}',
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
      const inject = props;
      const [suggestion, setSuggestion] = useState(() => inject.getSuggestion());
      useEffect(() => {
        return inject.subscribe(() => setSuggestion(inject.getSuggestion()));
      }, [inject.getSuggestion, inject.subscribe]);
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
    // ---- Topic 面板：数据通道（mux 监听 /t 命令的 command/run + command/done 配对）----
    const pendingDumps = [];
    let dumpStarted = false;
    let dumpAbort = null;
    function startDumpChannel(api) {
      if (dumpStarted || !api || !api.events || typeof api.events.mux !== 'function') return;
      dumpStarted = true;
      dumpAbort = new AbortController();
      (async () => {
        try {
          const rpc = { rpcId: 'topic-guard-panel', payload: {} };
          for await (const frame of api.events.mux(rpc, dumpAbort.signal)) {
            if (!frame || frame.type !== 'session/event') continue;
            const ev = frame.event;
            if (!ev) continue;
            if (ev.type === 'command/run') {
              const d = ev.data || {};
              if (d.name !== 't') continue;
              const args = typeof d.args === 'string' ? d.args : '';
              if (!/^\s*dump\b/.test(args)) continue;
              const item = pendingDumps.find(function (x) { return x.state === 'run' && x.sessionId === frame.sessionId; });
              if (item) { item.commandId = d.commandId; item.state = 'wait'; }
            } else if (ev.type === 'command/done') {
              const d = ev.data || {};
              const idx = pendingDumps.findIndex(function (x) { return x.state === 'wait' && x.commandId === d.commandId; });
              if (idx >= 0) {
                const item = pendingDumps[idx];
                pendingDumps.splice(idx, 1);
                clearTimeout(item.timer);
                item.resolve({ kind: d.kind, text: typeof d.text === 'string' ? d.text : '' });
              }
            }
          }
        } catch (error) { /* 流中断/断开：静默降级 */ }
      })();
    }
    function dumpRequest(sessionId, session, line) {
      if (!session || typeof session.command !== 'function') return Promise.resolve(null);
      return new Promise(function (resolve) {
        const item = { sessionId: sessionId, state: 'run', commandId: null, resolve: resolve, timer: null };
        pendingDumps.push(item);
        item.timer = setTimeout(function () {
          const i = pendingDumps.indexOf(item);
          if (i >= 0) { pendingDumps.splice(i, 1); resolve(null); }
        }, 8000);
        session.command(line).catch(function () {
          const i = pendingDumps.indexOf(item);
          if (i >= 0) { pendingDumps.splice(i, 1); clearTimeout(item.timer); resolve(null); }
        });
      });
    }

    // ---- 面板状态（模块级单例，按钮与面板共享）----
    const panel = { open: false, sessionId: null, view: 'list', selectedId: null, list: null, detail: null, error: null, listeners: new Set(), cached: null };
    // useSyncExternalStore 要求 getSnapshot 返回稳定引用：store 变化时重建快照缓存，
    // 否则每次渲染新对象会触发无限更新（React #185）。
    function panelSnapshot() {
      if (panel.cached === null) {
        panel.cached = { open: panel.open, sessionId: panel.sessionId, view: panel.view, selectedId: panel.selectedId, list: panel.list, detail: panel.detail, error: panel.error };
      }
      return panel.cached;
    }
    function panelPatch(patch) {
      Object.assign(panel, patch);
      panel.cached = null;
      panel.listeners.forEach(function (fn) { fn(); });
    }
    function panelSubscribe(fn) { panel.listeners.add(fn); return function () { panel.listeners.delete(fn); }; }
    function openPanel(sessionId) {
      panelPatch({ open: true, sessionId: sessionId || null, view: 'list', selectedId: null, list: null, detail: null, error: null });
    }
    function closePanel() { panelPatch({ open: false }); }

    // ---- Topic 面板组件（浮层）----
    function TopicPanel(props) {
      const sessionId = props.sessionId;
      const sessions = props.sessions;
      const snap = useSyncExternalStore(panelSubscribe, panelSnapshot);
      const [summaryDraft, setSummaryDraft] = useState('');
      const [busy, setBusy] = useState(false);
      const binding = sessions && sessions.binding ? sessions.binding(sessionId) : undefined;
      const session = binding && binding.session ? binding.session : undefined;
      useEffect(function () {
        if (!snap.open || !session) {
          if (snap.open) panelPatch({ error: 'no-session' });
          return undefined;
        }
        panelPatch({ error: null, list: null, detail: null });
        dumpRequest(sessionId, session, '/t dump list').then(function (res) {
          if (!res) { panelPatch({ error: 'dump-failed' }); return; }
          let data = null;
          try { data = JSON.parse(res.text); } catch (e) { data = null; }
          panelPatch({ list: data && Array.isArray(data.topics) ? data : null, error: data ? null : 'bad-dump' });
        });
        return undefined;
      }, [snap.open, sessionId]);
      useEffect(function () {
        if (!snap.open || snap.view !== 'detail' || !snap.selectedId || !session) return undefined;
        panelPatch({ detail: null });
        dumpRequest(sessionId, session, '/t dump show ' + snap.selectedId).then(function (res) {
          if (!res) { panelPatch({ error: 'dump-failed' }); return; }
          let data = null;
          try { data = JSON.parse(res.text); } catch (e) { data = null; }
          panelPatch({ detail: data || null, error: data ? null : 'bad-dump' });
          setSummaryDraft(data && data.summary ? data.summary : '');
        });
        return undefined;
      }, [snap.open, snap.view, snap.selectedId, sessionId]);
      if (!snap.open) return null;
      const run = function (line, then) {
        if (!session || busy) return;
        setBusy(true);
        session.command(line).finally(function () { setBusy(false); if (then) then(); });
      };
      const back = function () { panelPatch({ view: 'list', detail: null, selectedId: null }); };
      const openDetail = function (id) { panelPatch({ view: 'detail', selectedId: id }); };
      const refreshList = function () {
        dumpRequest(sessionId, session, '/t dump list').then(function (res) {
          if (!res) return;
          try { panelPatch({ list: JSON.parse(res.text) }); } catch (e) { /* ignore */ }
        });
      };
      const switchTo = function (id) { run('/t switch ' + id, refreshList); };
      const saveSummary = function () {
        run('/t edit ' + snap.selectedId + ' ' + summaryDraft, function () {
          dumpRequest(sessionId, session, '/t dump show ' + snap.selectedId).then(function (res) {
            if (!res) return;
            try { panelPatch({ detail: JSON.parse(res.text) }); } catch (e) { /* ignore */ }
          });
        });
      };
      const removeTopic = function () {
        run('/t rm ' + snap.selectedId, function () {
          panelPatch({ view: 'list', detail: null, selectedId: null });
          refreshList();
        });
      };
      const list = snap.list;
      const activeId = list ? list.activeTopicId : null;
      const rows = list && Array.isArray(list.topics) ? list.topics : [];
      const detail = snap.detail;
      const children = [];
      children.push(React.createElement('div', { className: 'dsh-tg-ph', key: 'ph' },
        React.createElement('span', { className: 'dsh-tg-pt' }, 'Topic 管理'),
        React.createElement('button', { type: 'button', className: 'dsh-tg-x', onClick: closePanel }, '×')
      ));
      if (snap.error) children.push(React.createElement('div', { className: 'dsh-tg-err', key: 'err' }, '加载失败：' + snap.error));
      if (snap.view === 'list') {
        if (!list) {
          children.push(React.createElement('div', { className: 'dsh-tg-load', key: 'load' }, '加载中…'));
        } else if (rows.length === 0) {
          children.push(React.createElement('div', { className: 'dsh-tg-empty', key: 'empty' }, '还没有 Topic。输入 /t new <名称> 创建'));
        } else {
          rows.forEach(function (t) {
            const cls = 'dsh-tg-row' + (t.id === activeId ? ' active' : '');
            children.push(React.createElement('div', { className: cls, key: t.id, onClick: function () { openDetail(t.id); } },
              React.createElement('span', { className: 'dsh-tg-id' }, t.id),
              React.createElement('span', { className: 'dsh-tg-badge' }, t.status),
              React.createElement('span', { className: 'dsh-tg-goal' }, t.goal || t.domain || '')
            ));
          });
        }
      } else if (detail) {
        const t = detail.topic || {};
        const artifacts = detail.artifacts && Array.isArray(detail.artifacts.entries) ? detail.artifacts.entries : [];
        const files = artifacts.filter(function (a) { return a.kind === 'file'; });
        const logs = artifacts.filter(function (a) { return a.kind === 'log'; });
        children.push(React.createElement('div', { className: 'dsh-tg-row active', key: 'meta' },
          React.createElement('span', { className: 'dsh-tg-id' }, t.id),
          React.createElement('span', { className: 'dsh-tg-badge' }, t.status)
        ));
        children.push(React.createElement('div', { key: 'goal', style: { padding: '2px 8px' } }, '域：' + (t.domain || '未设置') + '｜目标：' + (t.goal || '未设置')));
        const edges = t.edges && t.edges.length > 0 ? t.edges.map(function (e) { return e.type + '→' + e.target; }).join(', ') : '无';
        children.push(React.createElement('div', { key: 'edges', style: { padding: '2px 8px', color: 'var(--dsw-alias-label-secondary,inherit)' } }, '关联边：' + edges));
        children.push(React.createElement('div', { className: 'dsh-tg-sec', key: 's1' }, '摘要（用户确认）'));
        children.push(React.createElement('textarea', { className: 'dsh-tg-sum', key: 'sum', value: summaryDraft, onChange: function (e) { setSummaryDraft(e.target.value); } }));
        if (files.length > 0) {
          children.push(React.createElement('div', { className: 'dsh-tg-sec', key: 's2' }, '关键文件'));
          files.forEach(function (f, i) {
            children.push(React.createElement('span', { className: 'dsh-tg-file', key: 'f' + i }, '· ' + (f.path || '')));
          });
        }
        if (logs.length > 0) {
          children.push(React.createElement('div', { className: 'dsh-tg-sec', key: 's3' }, '工具输出片段'));
          logs.forEach(function (l, i) {
            children.push(React.createElement('div', { className: 'dsh-tg-log', key: 'l' + i }, (l.snippet || '').slice(0, 400)));
          });
        }
        children.push(React.createElement('div', { className: 'dsh-tg-actions', key: 'acts' },
          React.createElement('button', { type: 'button', className: 'dsh-tg-abtn primary', onClick: saveSummary, disabled: busy }, '保存摘要'),
          React.createElement('button', { type: 'button', className: 'dsh-tg-abtn', onClick: function () { switchTo(t.id); }, disabled: busy }, '设为当前'),
          React.createElement('button', { type: 'button', className: 'dsh-tg-abtn', onClick: back, disabled: busy }, '返回列表'),
          React.createElement('button', { type: 'button', className: 'dsh-tg-abtn danger', onClick: removeTopic, disabled: busy }, '删除')
        ));
      } else {
        children.push(React.createElement('div', { className: 'dsh-tg-load', key: 'load' }, '加载详情…'));
      }
      return React.createElement('div', { className: 'dsh-tg-panel', 'data-topic-panel': true, onClick: function (e) { e.stopPropagation(); } }, children);
    }

    // ---- 入口按钮：会话标题旁 + 侧栏底部 ----
    function renderPanelIfOwner(snap, sessionId, sessions) {
      if (!snap.open || snap.sessionId !== (sessionId || null)) return null;
      return React.createElement(TopicPanel, { sessionId: sessionId || null, sessions: sessions });
    }
    function HeaderTopicButton(props) {
      const sessionId = props.sessionId;
      const sessions = props.sessions;
      const snap = useSyncExternalStore(panelSubscribe, panelSnapshot);
      const [activeId, setActiveId] = useState(null);
      const binding = sessions && sessions.binding ? sessions.binding(sessionId) : undefined;
      const face = binding && binding.session && binding.session.projections ? binding.session.projections.faceOf(PROJECTION_KEY) : undefined;
      useEffect(function () {
        if (!face || typeof face.subscribe !== 'function') return undefined;
        const update = function () {
          const s = typeof face.getSnapshot === 'function' ? face.getSnapshot() : null;
          setActiveId(s && s.activeTopicId ? s.activeTopicId : null);
        };
        update();
        return face.subscribe(update);
      }, [face]);
      return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center' } },
        React.createElement('button', { type: 'button', className: 'dsh-tg-hbtn', onClick: function () { openPanel(sessionId); }, title: 'Topic 管理（当前：' + (activeId || '未绑定') + '）' }, '◈ ' + (activeId || 'Topic')),
        renderPanelIfOwner(snap, sessionId, sessions)
      );
    }
    function FooterTopicsButton(props) {
      const sessions = props.sessions;
      const snap = useSyncExternalStore(panelSubscribe, panelSnapshot);
      const mySession = props.sessionId || null;
      const wide = props.wide !== false;
      return React.createElement('span', { style: { display: 'inline-flex' } },
        React.createElement('button', { type: 'button', className: 'dsh-tg-hbtn', onClick: function () { openPanel(mySession); }, title: 'Topics' }, wide ? 'Topics' : '◈'),
        renderPanelIfOwner(snap, mySession, sessions)
      );
    }
    const NS = 'topic-guard';
    const PROJECTION_KEY = 'topic-guard';
    const inject = ['slots', 'sessions', 'connection'];

    function apply(ctx) {
      const sessions = ctx.sessions;
      startDumpChannel(ctx.connection && ctx.connection.api ? ctx.connection.api : undefined);
      // 会话标题旁：当前 Topic 按钮 + 面板入口
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: NS,
        order: 10,
        inject: () => ({ sessions: sessions }),
      }, HeaderTopicButton));
      // 侧栏底部：Topics 常驻入口
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: NS,
        order: 10,
        inject: () => ({ sessions: sessions }),
      }, FooterTopicsButton));
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

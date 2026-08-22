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
        '.dsh-tg-hbtn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font-size:12px;padding:2px 8px;border-radius:6px;white-space:nowrap}',
        '.dsh-tg-hbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
        '.dsh-tg-empty{color:var(--dsw-alias-label-caption,inherit);padding:8px 4px}',
        '.dsh-tg-err{color:var(--dsw-alias-state-error-primary,#d64545);padding:8px 4px}',
        '.dsh-tg-load{color:var(--dsw-alias-label-caption,inherit);padding:8px 4px}',
        '.dsh-tg-tabs{display:flex;gap:6px;margin-bottom:10px}',
        '.dsh-tg-tab{flex:1;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,inherit);border-radius:8px;padding:3px 0;font-size:12px;cursor:pointer;text-align:center}',
        '.dsh-tg-tab.on{border-color:var(--dsw-alias-state-business-primary,#2f7cf6);color:var(--dsw-alias-state-business-primary,#2f7cf6)}',
        '.dsh-tg-stat{display:flex;justify-content:space-between;padding:3px 8px;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}',
        '.dsh-tg-prev{padding:4px 8px;margin:3px 0;background:var(--dsw-specific-tip,rgba(0,0,0,.03));border-radius:6px;font-size:11px;color:var(--dsw-alias-label-secondary,inherit);word-break:break-all}',
        '.dsh-tg-match{padding:6px 8px;margin:3px 0;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
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
      // 无自动消失：提示持续显示，直到用户 [创建]/[忽略] 或服务端清除建议
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
      const isAutoSuggest = Array.isArray(suggestion.reasons) && suggestion.reasons.indexOf('auto-suggest') >= 0;
      return React.createElement('div', { className: 'dsh-tg-dock', 'data-topic-guard-chip': true },
        React.createElement('span', { className: 'dsh-tg-text' }, isAutoSuggest ? '当前会话尚未绑定 Topic，建议创建：' : '检测到可能的新话题：'),
        React.createElement('strong', { className: 'dsh-tg-candidate' }, suggestion.candidate),
        React.createElement('button', { type: 'button', className: 'dsh-tg-btn dsh-tg-create', onClick: onCreate }, '新建'),
        React.createElement('button', { type: 'button', className: 'dsh-tg-btn', onClick: onIgnore }, '忽略'),
      );
    }
    // ---- /t 命令执行（remote.commands.execute，与内置 ui-conversation 同路径）----
    // remote.commands.execute 返回 RemoteResult<CommandExecution>（{ok, value}），
    // 结果在 value.result（session.command 内部即取 result.value）。
    function runCommandText(sessionId, remote, line) {
      if (!remote || !remote.commands || typeof remote.commands.execute !== 'function') return Promise.resolve(null);
      return remote.commands.execute(sessionId, line, []).then(function (rpc) {
        if (!rpc || !rpc.ok) return null;
        const exec = rpc.value;
        if (exec && exec.result) return { kind: exec.result.kind, text: exec.result.text || '' };
        return { kind: 'error', text: 'unmatched-command' };
      }).catch(function () {
        return null;
      });
    }
    function runCommandVoid(sessionId, remote, line) {
      if (!remote || !remote.commands || typeof remote.commands.execute !== 'function') return Promise.resolve(false);
      return remote.commands.execute(sessionId, line, []).then(function (rpc) {
        return Boolean(rpc && rpc.ok && rpc.value);
      }).catch(function () {
        return false;
      });
    }
    // ---- 面板状态（模块级单例，按钮与面板共享）----
    const panel = { open: false, sessionId: null, owner: null, view: 'list', tab: 'topics', selectedId: null, list: null, detail: null, error: null, listeners: new Set(), cached: null };
    // useSyncExternalStore 要求 getSnapshot 返回稳定引用：store 变化时重建快照缓存，
    // 否则每次渲染新对象会触发无限更新（React #185）。
    function panelSnapshot() {
      if (panel.cached === null) {
        panel.cached = { open: panel.open, sessionId: panel.sessionId, owner: panel.owner, view: panel.view, tab: panel.tab, selectedId: panel.selectedId, list: panel.list, detail: panel.detail, error: panel.error };
      }
      return panel.cached;
    }
    function panelPatch(patch) {
      Object.assign(panel, patch);
      panel.cached = null;
      panel.listeners.forEach(function (fn) { fn(); });
    }
    function panelSubscribe(fn) { panel.listeners.add(fn); return function () { panel.listeners.delete(fn); }; }
    function openPanel(sessionId, owner) {
      panelPatch({ open: true, sessionId: sessionId || null, owner: owner || null, view: 'list', tab: 'topics', selectedId: null, list: null, detail: null, error: null });
    }
    function closePanel() { panelPatch({ open: false }); }

    // ---- Topic 面板组件（浮层）----
    // ---- 上下文查看器与话题关联（三期）----
    function nodeText(n) {
      try {
        if (!n) return '';
        if (typeof n.text === 'string') return n.text;
        if (n.data && typeof n.data.text === 'string') return n.data.text;
        if (n.message && Array.isArray(n.message.content)) return JSON.stringify(n.message.content).slice(0, 300);
        return '';
      } catch (e) { return ''; }
    }
    function renderContextView(nodes) {
      const els = [];
      if (!nodes || nodes.length === 0) {
        els.push(React.createElement('div', { className: 'dsh-tg-load', key: 'c1' }, '暂无上下文'));
        return els;
      }
      const counts = { user: 0, assistant: 0, tool: 0, context: 0, compaction: 0, command: 0, other: 0 };
      let totalChars = 0;
      const recent = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i] || {};
        const kind = n.kind || 'other';
        if (kind === 'user') counts.user++;
        else if (kind === 'assistant') counts.assistant++;
        else if (kind === 'tool-call' || kind === 'tool-result') counts.tool++;
        else if (kind === 'context') counts.context++;
        else if (kind === 'compaction') counts.compaction++;
        else if (kind === 'command') counts.command++;
        else counts.other++;
        const txt = nodeText(n);
        totalChars += txt.length;
        if (recent.length < 6 && (kind === 'user' || kind === 'context') && txt) recent.push({ kind: kind, text: txt.slice(0, 100) });
      }
      els.push(React.createElement('div', { className: 'dsh-tg-sec', key: 'c2' }, '发送给模型的上下文构成（估算 token：' + Math.ceil(totalChars / 4) + '）'));
      const statRows = [
        ['用户输入', counts.user], ['模型回复', counts.assistant], ['工具调用/结果', counts.tool],
        ['注入上下文(AGENTS/技能等)', counts.context], ['压缩摘要', counts.compaction], ['命令', counts.command], ['其他', counts.other],
      ];
      statRows.forEach(function (row) {
        els.push(React.createElement('div', { className: 'dsh-tg-stat', key: 's' + row[0] },
          React.createElement('span', null, row[0]), React.createElement('span', null, String(row[1]))));
      });
      if (recent.length > 0) {
        els.push(React.createElement('div', { className: 'dsh-tg-sec', key: 'c3' }, '最近上下文'));
        recent.forEach(function (rec, i) {
          els.push(React.createElement('div', { className: 'dsh-tg-prev', key: 'r' + i }, (rec.kind === 'user' ? '用户：' : '注入：') + rec.text));
        });
      }
      return els;
    }
    function renderMatchView(nodes, list, onSwitch) {
      const els = [];
      const topics = list && Array.isArray(list.topics) ? list.topics : [];
      const features = [];
      for (const n of (nodes || [])) {
        if (!n) continue;
        if (n.kind === 'user') { const t = nodeText(n); if (t) features.push(t); }
        if (n.kind === 'tool-call') {
          const argText = JSON.stringify(n.arguments || n.args || n.data || {});
          if (argText && argText.length > 4) features.push(argText.slice(0, 300));
        }
      }
      const joined = features.join(' ').toLowerCase();
      const scored = topics.map(function (t) {
        const hay = ((t.goal || '') + ' ' + (t.domain || '') + ' ' + t.id).toLowerCase();
        const words = hay.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(function (w) { return w.length >= 2; });
        let score = 0;
        for (const w of words) if (joined.includes(w)) score++;
        return { topic: t, score: score };
      }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
      els.push(React.createElement('div', { className: 'dsh-tg-sec', key: 'm1' }, '上下文命中话题（特征：最近用户输入 + 工具调用）'));
      if (scored.length === 0) {
        els.push(React.createElement('div', { className: 'dsh-tg-empty', key: 'm2' }, '未命中已定义话题。可用 /t new <名称> 为当前上下文创建话题'));
      } else {
        scored.forEach(function (s, i) {
          els.push(React.createElement('div', { className: 'dsh-tg-match', key: 'm' + i, style: { display: 'flex', alignItems: 'center', gap: 8 } },
            React.createElement('span', { className: 'dsh-tg-id' }, s.topic.id),
            React.createElement('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-caption,inherit)' } }, '得分 ' + s.score),
            React.createElement('button', { type: 'button', className: 'dsh-tg-abtn', style: { marginLeft: 'auto' }, onClick: function () { onSwitch(s.topic.id); } }, '设为当前')
          ));
        });
      }
      return els;
    }
    function TopicPanel(props) {
      const sessionId = props.sessionId;
      const remote = props.remote;
      const snap = useSyncExternalStore(panelSubscribe, panelSnapshot);
      const sessionSnap = typeof props.useSession === 'function' ? props.useSession() : null;
      const [summaryDraft, setSummaryDraft] = useState('');
      const [busy, setBusy] = useState(false);
      useEffect(function () {
        if (!snap.open) return undefined;
        if (!remote || !remote.commands) { panelPatch({ error: 'no-remote' }); return undefined; }
        panelPatch({ error: null, list: null, detail: null });
        runCommandText(sessionId, remote, '/t dump list').then(function (res) {
          if (!res) { panelPatch({ error: 'dump-failed' }); return; }
          if (res.kind === 'error' && res.text === 'unmatched-command') { panelPatch({ error: 't-command-missing' }); return; }
          let data = null;
          try { data = JSON.parse(res.text); } catch (e) { data = null; }
          panelPatch({ list: data && Array.isArray(data.topics) ? data : null, error: data ? null : 'bad-dump' });
        });
        return undefined;
      }, [snap.open, sessionId]);
      useEffect(function () {
        if (!snap.open || snap.view !== 'detail' || !snap.selectedId) return undefined;
        panelPatch({ detail: null });
        runCommandText(sessionId, remote, '/t dump show ' + snap.selectedId).then(function (res) {
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
        if (!remote || busy) return;
        setBusy(true);
        runCommandVoid(sessionId, remote, line).finally(function () { setBusy(false); if (then) then(); });
      };
      const back = function () { panelPatch({ view: 'list', detail: null, selectedId: null }); };
      const openDetail = function (id) { panelPatch({ view: 'detail', selectedId: id }); };
      const refreshList = function () {
        runCommandText(sessionId, remote, '/t dump list').then(function (res) {
          if (!res) return;
          try { panelPatch({ list: JSON.parse(res.text) }); } catch (e) { /* ignore */ }
        });
      };
      const switchTo = function (id) { run('/t switch ' + id, refreshList); };
      const saveSummary = function () {
        run('/t edit ' + snap.selectedId + ' ' + summaryDraft, function () {
          runCommandText(sessionId, remote, '/t dump show ' + snap.selectedId).then(function (res) {
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
      children.push(React.createElement('div', { className: 'dsh-tg-tabs', key: 'tabs' },
        React.createElement('button', { type: 'button', className: 'dsh-tg-tab' + (snap.tab === 'topics' ? ' on' : ''), onClick: function () { panelPatch({ tab: 'topics' }); } }, '话题'),
        React.createElement('button', { type: 'button', className: 'dsh-tg-tab' + (snap.tab === 'context' ? ' on' : ''), onClick: function () { panelPatch({ tab: 'context' }); } }, '上下文'),
        React.createElement('button', { type: 'button', className: 'dsh-tg-tab' + (snap.tab === 'match' ? ' on' : ''), onClick: function () { panelPatch({ tab: 'match' }); } }, '关联')
      ));
      if (snap.error) children.push(React.createElement('div', { className: 'dsh-tg-err', key: 'err' }, '加载失败：' + snap.error));
      if (snap.tab === 'context') {
        renderContextView(sessionSnap ? sessionSnap.nodes : null).forEach(function (el) { children.push(el); });
      } else if (snap.tab === 'match') {
        renderMatchView(sessionSnap ? sessionSnap.nodes : null, list, switchTo).forEach(function (el) { children.push(el); });
      } else if (snap.view === 'list') {
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
    function renderPanelIfOwner(snap, sessionId, owner, remote) {
      if (!snap.open || snap.owner !== owner || snap.sessionId !== (sessionId || null)) return null;
      return React.createElement(TopicPanel, { sessionId: sessionId || null, remote: remote });
    }
    function HeaderTopicButton(props) {
      const listState = typeof props.useSessions === 'function' ? props.useSessions((s) => s) : null;
      const sessionId = props.sessionId || (listState && listState.current) || null;
      const remote = props.remote;
      const snap = useSyncExternalStore(panelSubscribe, panelSnapshot);
      return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center' } },
        React.createElement('button', { type: 'button', className: 'dsh-tg-hbtn', style: { background: 'var(--dsw-alias-state-business-primary,#2f7cf6)', color: '#fff', border: 'none' }, onClick: function () { openPanel(sessionId, 'header'); }, title: 'Topic 管理' }, '◈ Topic'),
        renderPanelIfOwner(snap, sessionId, 'header', remote)
      );
    }
    function FooterTopicsButton(props) {
      const remote = props.remote;
      const snap = useSyncExternalStore(panelSubscribe, panelSnapshot);
      // root scope 无 props.sessionId：用 useSessions 选择器拿当前会话（selector hook 必须传函数）
      const listState = typeof props.useSessions === 'function' ? props.useSessions((s) => s) : null;
      const currentId = (listState && listState.current) || props.sessionId || null;
      const wide = props.wide !== false;
      return React.createElement('span', { style: { display: 'inline-flex' } },
        React.createElement('button', { type: 'button', className: 'dsh-tg-hbtn', onClick: function () { openPanel(currentId, 'footer'); }, title: 'Topics' }, wide ? 'Topics' : '◈'),
        renderPanelIfOwner(snap, currentId, 'footer', remote)
      );
    }
    const NS = 'topic-guard';
    const PROJECTION_KEY = 'topic-guard';
    // 'remote.commands' 是嵌套域服务（与 goal 插件的 'remote.goals' 同理），须显式注入
    const inject = ['slots', 'sessions', 'connection', 'remote', 'remote.commands'];

    function apply(ctx) {
      const sessions = ctx.sessions;
      const remote = ctx.remote;
      // 会话标题旁：当前 Topic 按钮 + 面板入口
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: NS,
        order: 10,
        inject: () => ({ remote: remote }),
      }, HeaderTopicButton));
      // 侧栏底部：Topics 常驻入口
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: NS,
        order: 10,
        inject: () => ({ remote: remote }),
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

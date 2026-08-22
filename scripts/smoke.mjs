/**
 * Smoke tests for dsh-topic-guard v0.2 core logic (store / drift fold / attributor / router).
 * Runs on Node >= 24 (native type stripping) — no build or install needed:
 *   node scripts/smoke.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceMemoryStore } from '../src/memory/store.ts';
import { applyDrift, initDriftState, extractPaths, familyOfPath } from '../src/manager/drift.ts';
import { attribute } from '../src/manager/attributor.ts';
import { TopicRouter } from '../src/manager/router.ts';
import { slugId } from '../src/memory/paths.ts';

let passed = 0;
function ok(name, cond, extra = '') {
  if (!cond) throw new Error('FAIL: ' + name + (extra ? ' — ' + extra : ''));
  passed += 1;
  console.log('  ok  ' + name);
}

const CFG = {
  threshold: 50,
  weights: { keyword: 25, pathJump: 30, toolSwitch: 20 },
  keywords: { 'SQL优化': ['sql', '索引', '慢查询'] },
  cooldownMessages: 3,
  autoSuggestAfterMessages: 3,
};

const ev = (seq, type, data) => ({ type, seq, time: 1700000000000 + seq, data });

console.log('== drift fold ==');
{
  let s = initDriftState();
  // 冷启动工具调用：静默入簇，不判漂移
  s = applyDrift(s, ev(0, 'tool/call', { name: 'read', arguments: JSON.stringify({ file_path: 'src/foo/a.ts' }) }), CFG);
  ok('cold start seeds cluster silently', s.suggestion === null && s.clusterFamilies.length === 1);
  // 同族路径：无新信号
  s = applyDrift(s, ev(1, 'tool/call', { name: 'edit', arguments: JSON.stringify({ file_path: 'src/foo/b.ts' }) }), CFG);
  ok('same family no suggestion', s.suggestion === null);
  // 新路径族（db/）→ path-jump 30 + tool-switch(code→shell? edit 是 code，pwsh 是 shell) = 30+20 = 50 ≥ 50
  s = applyDrift(s, ev(2, 'tool/call', { name: 'pwsh', arguments: JSON.stringify({ workdir: 'C:/proj/db/migrate' }) }), CFG);
  ok('path jump + tool switch triggers', s.suggestion !== null, JSON.stringify(s.suggestion));
  ok('candidate from new family', s.suggestion && s.suggestion.candidate === 'migrate', JSON.stringify(s.suggestion?.candidate));
  ok('reasons include path-jump', s.suggestion && s.suggestion.reasons.some((r) => r.startsWith('path-jump')));
  const nonce1 = s.suggestion?.nonce;
  // 工具切换后再同族：不重复建议
  s = applyDrift(s, ev(3, 'tool/call', { name: 'pwsh', arguments: JSON.stringify({ workdir: 'C:/proj/db/migrate/x.sql' }) }), CFG);
  ok('no duplicate suggestion while pending', s.suggestion?.nonce === nonce1);
  // 用户忽略
  s = applyDrift(s, ev(4, 'command/run', { commandId: 'c1', name: 't', args: 'ignore' }), CFG);
  ok('ignore clears suggestion', s.suggestion === null);
  // 关键词命中（冷却内不重复）
  s = applyDrift(s, ev(5, 'user/message', { source: { kind: 'user' }, content: '这条 SQL 有慢查询问题，索引怎么加？' }), CFG);
  ok('keyword hit produces suggestion', s.suggestion !== null && s.suggestion.candidate === 'SQL优化', JSON.stringify(s.suggestion));
  ok('suggestedAtMessage cooldown set', s.suggestedAtMessage === 1);
  // 注入上下文不触发
  const before = JSON.stringify(s);
  s = applyDrift(s, ev(6, 'user/message', { source: { kind: 'plugin', plugin: 'x' }, content: 'SQL 索引' }), CFG);
  ok('injected context ignored', JSON.stringify(s) === before);
}

console.log('== auto-suggest ==');
{
  let s = initDriftState();
  // 无标题无活跃 Topic：3 条消息后建议
  s = applyDrift(s, ev(0, 'user/message', { source: { kind: 'user' }, content: '随便聊聊' }), CFG);
  s = applyDrift(s, ev(1, 'user/message', { source: { kind: 'user' }, content: '继续聊' }), CFG);
  s = applyDrift(s, ev(2, 'user/message', { source: { kind: 'user' }, content: '再聊' }), CFG);
  ok('auto-suggest after 3 messages', s.suggestion !== null && s.suggestion.reasons.includes('auto-suggest'), JSON.stringify(s.suggestion));
  ok('auto-suggest candidate default', s.suggestion && s.suggestion.candidate === '新会话主题');
  // 绑定 Topic 后不再建议
  s = applyDrift(s, ev(3, 'command/run', { commandId: 'c', name: 't', args: 'new sql优化' }), CFG);
  s = applyDrift(s, ev(4, 'user/message', { source: { kind: 'user' }, content: '继续' }), CFG);
  ok('no auto-suggest after binding', s.suggestion === null);
  // 标题作为候选名
  let s2 = initDriftState();
  s2 = applyDrift(s2, ev(0, 'session/title', { title: '订单模块优化' }), CFG);
  s2 = applyDrift(s2, ev(1, 'user/message', { source: { kind: 'user' }, content: 'a' }), CFG);
  s2 = applyDrift(s2, ev(2, 'user/message', { source: { kind: 'user' }, content: 'b' }), CFG);
  s2 = applyDrift(s2, ev(3, 'user/message', { source: { kind: 'user' }, content: 'c' }), CFG);
  ok('auto-suggest uses session title', s2.suggestion && s2.suggestion.candidate === '订单模块优化', JSON.stringify(s2.suggestion));
}

console.log('== path utils ==');
{
  ok('familyOfPath relative', familyOfPath('src/foo/bar.ts') === 'src/foo');
  ok('familyOfPath abs', familyOfPath('C:/a/b/c/d.ts') === 'b/c');
  ok('familyOfPath workdir', familyOfPath('C:/proj/db/migrate') === 'db/migrate');
  ok('extractPaths', JSON.stringify(extractPaths(JSON.stringify({ file_path: 'a.ts', workdir: 'b' }))) === JSON.stringify(['a.ts', 'b']));
  ok('slugId CJK', slugId('SQL 优化') === 'sql-优化');
  ok('slugId ascii', slugId('Topic: Merge Flow!') === 'topic-merge-flow');
}

console.log('== attributor ==');
{
  const events = [
    ev(0, 'tool/call', { name: 'read', arguments: JSON.stringify({ file_path: 'src/foo/a.ts' }) }),
    ev(1, 'tool/result', { message: { content: [{ type: 'tool-result', text: 'file a.ts: 42 lines, index missing' }], toolCallId: 'c1' } }),
    ev(2, 'tool/call', { name: 'read', arguments: JSON.stringify({ file_path: 'src/foo/a.ts' }) }),
  ];
  const entries = attribute(events, { snippetChars: 20 });
  ok('file entry deduped', entries.filter((e) => e.kind === 'file').length === 1);
  ok('log entry captured', entries.some((e) => e.kind === 'log' && e.snippet !== undefined));
}

console.log('== memory store ==');
{
  const dir = mkdtempSync(join(tmpdir(), 'topic-guard-'));
  const store = new WorkspaceMemoryStore(dir);
  await store.init();
  const topic = await store.createTopic({ id: 'sql-优化', domain: 'db', goal: '优化慢查询', sessionId: 'sess-1' });
  ok('created draft', topic.status === 'draft');
  ok('index persisted', existsSync(join(dir, 'index.json')));
  ok('topic.json persisted', existsSync(join(dir, 'sql-优化', 'topic.json')));
  await store.setSessionTopic('sess-1', 'sql-优化');
  const active = await store.activeTopicFor('sess-1');
  ok('session topic set', active?.id === 'sql-优化');
  await store.writeSummary('sql-优化', '# 摘要\n- 加联合索引');
  const t2 = await store.loadTopic('sql-优化');
  ok('summary flips to active', t2?.status === 'active');
  const summary = await store.readSummary('sql-优化');
  ok('summary content', summary.includes('联合索引'));
  await store.appendArtifacts('sql-优化', [{ kind: 'file', path: 'src/foo/a.ts', capturedAt: Date.now() }]);
  const art = await store.readArtifacts('sql-优化');
  ok('artifacts appended', art.entries.length === 1);
  // link + merge
  await store.createTopic({ id: 'sql-安全', goal: 'SQL 安全' });
  await store.linkTopics('sql-优化', 'sql-安全', 'causal');
  const linked = await store.loadTopic('sql-优化');
  ok('link added', linked?.edges.some((e) => e.target === 'sql-安全' && e.type === 'causal'));
  await store.mergeTopics('sql-安全', 'sql-优化');
  const mergedInto = await store.loadTopic('sql-优化');
  const mergedFrom = await store.loadTopic('sql-安全');
  ok('merge archives from', mergedFrom?.status === 'archived');
  ok('merge records causal edge', mergedInto?.edges.some((e) => e.target === 'sql-安全'));
  ok('merge combines summary', (await store.readSummary('sql-优化')).includes('合并自'));
}

console.log('== router ==');
{
  const dir = mkdtempSync(join(tmpdir(), 'topic-guard-r-'));
  const store = new WorkspaceMemoryStore(dir);
  await store.init();
  const router = new TopicRouter(store);
  const session = { id: 'sess-2', log: [ev(0, 'tool/call', { name: 'read', arguments: JSON.stringify({ file_path: 'src/x.ts' }) })] };
  const created = await router.handle('new SQL 优化 --domain db', session);
  ok('router create', created.kind === 'success' && created.text.includes('sql-优化'), created.text);
  const list = await router.handle('list', session);
  ok('router list shows active marker', list.text.includes('*'));
  const show = await router.handle('show', session);
  ok('router show', show.kind === 'success' && show.text.includes('sql-优化'));
  const edited = await router.handle('edit sql-优化 加联合索引解决慢查询', session);
  ok('router edit summary', edited.kind === 'success');
  const shown = await router.handle('show', session);
  ok('router show includes summary', shown.text.includes('加联合索引'));
  const switched = await router.handle('switch sql-优化', session);
  ok('router switch', switched.kind === 'success');
  const bad = await router.handle('switch nope', session);
  ok('router unknown topic error', bad.kind === 'error');
  const dumpList = await router.handle('dump list', session);
  ok('router dump list JSON', dumpList.kind === 'success' && JSON.parse(dumpList.text).topics.some((t) => t.id === 'sql-优化'), dumpList.text.slice(0, 120));
  const dumpShow = await router.handle('dump show', session);
  ok('router dump show JSON', dumpShow.kind === 'success' && JSON.parse(dumpShow.text).summary.includes('加联合索引'), dumpShow.text.slice(0, 120));
}

console.log('');
console.log('ALL SMOKE TESTS PASSED (' + passed + ')');


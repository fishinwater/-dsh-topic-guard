import { WorkspaceMemoryStore } from '../lib/memory/store.js';
import { applyDrift, initDriftState } from '../lib/manager/drift.js';
import { TopicRouter } from '../lib/manager/router.js';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CFG = { threshold: 50, weights: { keyword: 25, pathJump: 30, toolSwitch: 20 }, keywords: { 'SQL优化': ['sql','索引','慢查询'] }, cooldownMessages: 3 };
const ev = (seq, type, data) => ({ type, seq, time: 1, data });
let s = initDriftState();
s = applyDrift(s, ev(0, 'tool/call', { name: 'read', arguments: JSON.stringify({ file_path: 'src/foo/a.ts' }) }), CFG);
s = applyDrift(s, ev(2, 'tool/call', { name: 'pwsh', arguments: JSON.stringify({ workdir: 'C:/proj/db/migrate' }) }), CFG);
assert.ok(s.suggestion && s.suggestion.candidate === 'migrate', 'lib drift: ' + JSON.stringify(s.suggestion));
s = applyDrift(s, ev(4, 'command/run', { commandId: 'c', name: 't', args: 'ignore' }), CFG);
assert.equal(s.suggestion, null, 'lib ignore');
s = applyDrift(s, ev(5, 'user/message', { source: { kind: 'user' }, content: 'SQL 索引怎么加' }), CFG);
assert.equal(s.suggestion?.candidate, 'SQL优化', 'lib keyword');

const dir = mkdtempSync(join(tmpdir(), 'tg-lib-'));
const store = new WorkspaceMemoryStore(dir);
await store.init();
const t = await store.createTopic({ id: 'sql-优化', sessionId: 's1' });
await store.writeSummary('sql-优化', '# ok');
assert.equal((await store.loadTopic('sql-优化'))?.status, 'active');
const router = new TopicRouter(store);
const r = await router.handle('list', { id: 's1' });
assert.ok(r.text.includes('sql-优化'));
console.log('LIB SMOKE OK');

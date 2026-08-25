import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceMemoryStore } from '../lib/memory/store.js';
import { relatedTopics, matchSessionToTopics } from '../lib/manager/relatedness.js';

const root = mkdtempSync(join(tmpdir(), 'tg-rel-'));
const store = new WorkspaceMemoryStore(root);
await store.init();

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// ---- 建 3 个 topic ----
await store.createTopic({ id: 'sbom', goal: 'SBOM 全生命周期溯源' });
await store.createTopic({ id: 'plugin', goal: 'DSH 插件管理' });
await store.createTopic({ id: 'sql', goal: 'SQL 优化' });

// ---- 1) 事实冲突替换（后者为准） ----
await store.appendFacts('sbom', [{ factKey: 'sbom.belonging.module', value: 'designer' }]);
let active = await store.activeFacts('sbom');
assert('fact 初始 active', active.length === 1 && active[0].value === 'designer');

await store.appendFacts('sbom', [{ factKey: 'sbom.belonging.module', value: 'bom-server' }]);
active = await store.activeFacts('sbom');
assert('冲突后后者为准', active.length === 1 && active[0].value === 'bom-server');
const all = (await store.readArtifacts('sbom')).entries;
const sup = all.filter((e) => e.kind === 'fact' && e.status === 'superseded');
assert('旧条目 superseded 留痕', sup.length === 1 && sup[0].value === 'designer' && sup[0].supersededBy?.value === 'bom-server');

// 同值重复 → 不重复追加
await store.appendFacts('sbom', [{ factKey: 'sbom.belonging.module', value: 'bom-server' }]);
active = await store.activeFacts('sbom');
assert('同值幂等', active.length === 1);

// ---- 2) 主题→主题关联度（非 LLM） ----
await store.linkTopics('sbom', 'plugin', 'causal');
await store.appendArtifacts('sbom', [{ kind: 'file', path: 'assets/方案/SBOM.md', seq: 1, capturedAt: Date.now() }]);
await store.appendArtifacts('sql', [{ kind: 'file', path: 'assets/方案/SQL.md', seq: 1, capturedAt: Date.now() }]);
await store.writeSummary('sbom', 'SBOM 许可证合规与制品溯源方案');
await store.writeSummary('plugin', 'DSH 主题插件管理');
await store.writeSummary('sql', 'SQL 慢查询优化方案');
const rels = await relatedTopics(store, 'sbom', {});
console.log('  relatedTopics(sbom) = ' + JSON.stringify(rels));
assert('edge 主题进入关联结果', rels.some((r) => r.topicId === 'plugin' && r.reasons.includes('edge:causal')));
assert('路径族相似主题进入', rels.some((r) => r.topicId === 'sql' && r.reasons.some((x) => x.startsWith('path:'))));

// ---- 3) 会话→主题匹配 ----
const features = { texts: ['SBOM 全生命周期溯源 许可证合规 方案'], toolNames: ['read'], paths: ['assets/方案/SBOM全生命周期溯源方案.md'], factKeys: [] };
const hits = await matchSessionToTopics(store, features, {});
console.log('  match = ' + JSON.stringify(hits));
assert('会话匹配命中 sbom', hits.length > 0 && hits[0].topicId === 'sbom');

rmSync(root, { recursive: true, force: true });
console.log('RELATEDNESS SMOKE: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
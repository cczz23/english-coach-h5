const test = require('node:test');
const assert = require('node:assert/strict');
const ECSync = require('../sync.js');

function memStorage(initial) {
  const mem = new Map(Object.entries(initial || {}));
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
}

function item(overrides) {
  return Object.assign({ status: null, seen: 0, needed: false }, overrides);
}

test('merge keeps every word, the higher seen count, and the newer status', () => {
  const local = {
    v: 4, mode: 'all', recent: ['w1'], undo: [{ id: 'w1' }],
    items: {
      w1: item({ status: 'weak', seen: 4, needed: false, updated: 300 }),
      localOnly: item({ status: 'reinforce', seen: 1, needed: true, updated: 50 })
    },
    log: [{ id: 'w1', term: 'alpha', action: 'weak', ts: 300, seen: 4 }]
  };
  const remote = {
    v: 4, mode: 'all', recent: ['w2'], undo: [{ id: 'remote-undo' }],
    items: {
      w1: item({ status: 'dropped', seen: 9, needed: true, updated: 100 }),
      remoteOnly: item({ status: 'weak', seen: 2, needed: false, updated: 80, important: true })
    },
    log: [
      { id: 'w1', term: 'alpha', action: 'weak', ts: 300, seen: 4 },
      { id: 'w2', term: 'beta', action: 'drop', ts: 120, seen: 2 }
    ]
  };
  const merged = ECSync.mergeState(local, remote);
  assert.equal(merged.items.w1.status, 'weak');
  assert.equal(merged.items.w1.seen, 9);
  assert.equal(merged.items.w1.needed, false);
  assert.equal(merged.items.w1.updated, 300);
  assert.ok(merged.items.localOnly);
  assert.equal(merged.items.remoteOnly.status, 'weak');
  assert.equal(merged.items.remoteOnly.important, true);
  assert.equal(merged.log.length, 2);
  assert.deepEqual(merged.log.map(e => e.action), ['drop', 'weak']);
  assert.deepEqual(merged.undo, [{ id: 'w1' }]);
  assert.deepEqual(merged.recent, ['w1']);
});

test('merge follows the latest mode log and does not drop either history', () => {
  const local = {
    v: 4, mode: 'all', items: {}, recent: [], undo: [],
    log: [{ action: 'mode_all', id: null, term: null, ts: 10, seen: 0 }]
  };
  const remote = {
    v: 4, mode: 'review', items: {}, recent: ['w9'], undo: [{ id: 'nope' }],
    log: [{ action: 'mode_review', id: null, term: null, ts: 20, seen: 0 }]
  };
  const merged = ECSync.mergeState(local, remote);
  assert.equal(merged.mode, 'review');
  assert.equal(merged.log.length, 2);
  assert.deepEqual(merged.recent, ['w9']);
  assert.deepEqual(merged.undo, []);
});

test('settings save round-trips token and gist id; unset config does not sync', () => {
  const storage = memStorage();
  assert.equal(ECSync.isConfigured(ECSync.loadConfig(storage)), false);
  ECSync.saveConfig(storage, { token: 'ghp_example', gistId: ' abc123 ' });
  const cfg = ECSync.loadConfig(storage);
  assert.deepEqual(cfg, { token: 'ghp_example', gistId: 'abc123' });
  assert.equal(ECSync.isConfigured(cfg), true);
  assert.equal(ECSync.isConfigured({ token: 'ghp_example', gistId: '' }), false);
  assert.equal(ECSync.isConfigured({ token: '', gistId: 'abc123' }), false);
  ECSync.clearConfig(storage);
  assert.equal(ECSync.isConfigured(ECSync.loadConfig(storage)), false);
  assert.equal(storage.getItem(ECSync.SYNC_KEY), null);
});

test('mocked gist GET merges and PATCH sends the v4 file without the token', async () => {
  const remote = {
    v: 4,
    mode: 'all',
    items: { w001: { status: 'weak', seen: 2, needed: true, updated: 10 } },
    recent: [],
    log: [{ id: 'w001', term: 'circle back', action: 'weak', ts: 10, seen: 2 }],
    undo: []
  };
  const local = {
    v: 4, mode: 'all', recent: [], undo: [],
    items: { w001: { status: 'reinforce', seen: 5, needed: false, updated: 40 } },
    log: [{ id: 'w001', term: 'circle back', action: 'reinforce', ts: 40, seen: 5 }]
  };
  let patched = null;
  const fetchImpl = async (url, opts = {}) => {
    assert.equal(opts.headers.Authorization, 'Bearer ghp_example');
    assert.ok(!String(url).includes('ghp_example'));
    if (opts.method === 'PATCH') {
      patched = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    assert.match(url, /\/gists\/gist123$/);
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: { 'english-coach-state.json': { content: JSON.stringify(remote) } } }),
      text: async () => ''
    };
  };
  const got = await ECSync.fetchRemote(fetchImpl, 'ghp_example', 'gist123');
  assert.equal(got.ok, true);
  const merged = ECSync.mergeState(local, got.state);
  assert.equal(merged.items.w001.status, 'reinforce');
  assert.equal(merged.items.w001.seen, 5);
  assert.equal(merged.items.w001.needed, false);
  const pushed = await ECSync.pushState(fetchImpl, 'ghp_example', 'gist123', merged);
  assert.equal(pushed.ok, true);
  const file = patched.files['english-coach-state.json'].content;
  assert.equal(JSON.parse(file).items.w001.seen, 5);
  assert.equal(JSON.parse(file).v, 4);
  assert.ok(!file.includes('ghp_example'));
});

test('failText uses HTTP status or 网络', () => {
  assert.equal(ECSync.failText({ ok: false, status: 401 }), '同步失败 · 401');
  assert.equal(ECSync.failText({ ok: false, status: 403 }), '同步失败 · 403');
  assert.equal(ECSync.failText({ ok: false, status: 0 }), '同步失败 · 网络');
  assert.equal(ECSync.failText(new TypeError('Failed to fetch')), '同步失败 · 网络');
});

test('create private gist returns the id and skipped sync stays a no-op when unset', async () => {
  assert.equal(ECSync.isConfigured({ token: '', gistId: '' }), false);
  let posted = null;
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.method, 'POST');
    assert.match(url, /\/gists$/);
    posted = JSON.parse(opts.body);
    return { ok: true, status: 201, json: async () => ({ id: 'newgist1' }), text: async () => '' };
  };
  const created = await ECSync.createGist(fetchImpl, 'ghp_example', { v: 4, items: {} });
  assert.equal(created.ok, true);
  assert.equal(created.gistId, 'newgist1');
  assert.equal(posted.public, false);
  assert.ok(posted.files['english-coach-state.json'].content.includes('"v":4'));
  assert.ok(!posted.files['english-coach-state.json'].content.includes('ghp_example'));
});

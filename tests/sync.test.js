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

test('settings save round-trips LeanCloud keys; unset config does not sync', () => {
  const storage = memStorage();
  assert.equal(ECSync.isConfigured(ECSync.loadConfig(storage)), false);
  ECSync.saveConfig(storage, {
    appId: ' abcdefgh ',
    appKey: 'secret-key',
    serverURL: ' https://lc.test/ ',
    objectId: ' obj1 '
  });
  const cfg = ECSync.loadConfig(storage);
  assert.deepEqual(cfg, { appId: 'abcdefgh', appKey: 'secret-key', serverURL: 'https://lc.test/', objectId: 'obj1' });
  assert.equal(ECSync.isConfigured(cfg), true);
  assert.equal(ECSync.isConfigured({ appId: 'abcdefgh', appKey: 'secret-key', objectId: '' }), false);
  assert.equal(ECSync.hasKeys({ appId: 'abcdefgh', appKey: 'secret-key' }), true);
  ECSync.clearConfig(storage);
  assert.equal(storage.getItem(ECSync.SYNC_KEY), null);
  assert.equal(ECSync.apiBase({ appId: 'AbCdEfGh9999', serverURL: '' }), 'https://abcdefgh.lc-cn-n1-shared.com/1.1');
  assert.equal(ECSync.apiBase({ appId: 'abcdefgh', serverURL: 'https://lc.test/1.1/' }), 'https://lc.test/1.1');
});

test('mocked LeanCloud GET merges and PUT sends v4 state without the app key', async () => {
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
  const cfg = { appId: 'abcdefgh', appKey: 'secret-key', serverURL: 'https://lc.test', objectId: 'obj1' };
  let putBody = null;
  const fetchImpl = async (url, opts = {}) => {
    assert.equal(opts.headers['X-LC-Id'], 'abcdefgh');
    assert.equal(opts.headers['X-LC-Key'], 'secret-key');
    assert.ok(!String(url).includes('secret-key'));
    if (opts.method === 'PUT') {
      putBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    assert.equal(url, 'https://lc.test/1.1/classes/ECState/obj1');
    return {
      ok: true,
      status: 200,
      json: async () => ({ objectId: 'obj1', state: remote }),
      text: async () => ''
    };
  };
  const got = await ECSync.fetchRemote(fetchImpl, cfg);
  assert.equal(got.ok, true);
  const merged = ECSync.mergeState(local, got.state);
  assert.equal(merged.items.w001.status, 'reinforce');
  assert.equal(merged.items.w001.seen, 5);
  assert.equal(merged.items.w001.needed, false);
  const pushed = await ECSync.pushState(fetchImpl, cfg, merged);
  assert.equal(pushed.ok, true);
  assert.equal(putBody.state.items.w001.seen, 5);
  assert.equal(putBody.state.v, 4);
  assert.ok(!JSON.stringify(putBody).includes('secret-key'));
});

test('failText uses HTTP status or 网络', () => {
  assert.equal(ECSync.failText({ ok: false, status: 401 }), '同步失败 · 401');
  assert.equal(ECSync.failText({ ok: false, status: 403 }), '同步失败 · 403');
  assert.equal(ECSync.failText({ ok: false, status: 0 }), '同步失败 · 网络');
  assert.equal(ECSync.failText(new TypeError('Failed to fetch')), '同步失败 · 网络');
});

test('create LeanCloud object returns objectId and skips sync when unset', async () => {
  assert.equal(ECSync.isConfigured({ appId: '', appKey: '', objectId: '' }), false);
  let posted = null;
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.method, 'POST');
    assert.equal(url, 'https://abcdefgh.lc-cn-n1-shared.com/1.1/classes/ECState');
    posted = JSON.parse(opts.body);
    return { ok: true, status: 201, json: async () => ({ objectId: 'newobj1' }), text: async () => '' };
  };
  const created = await ECSync.createRemote(fetchImpl, { appId: 'abcdefgh', appKey: 'secret-key', serverURL: '' }, { v: 4, items: {} });
  assert.equal(created.ok, true);
  assert.equal(created.objectId, 'newobj1');
  assert.equal(posted.state.v, 4);
  assert.ok(!JSON.stringify(posted).includes('secret-key'));
});

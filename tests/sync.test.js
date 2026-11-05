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

test('settings save round-trips CloudBase keys; unset config does not sync', () => {
  const storage = memStorage();
  assert.equal(ECSync.SYNC_KEY, 'ec_tcb_v1');
  assert.equal(ECSync.COLLECTION, 'ec_state');
  assert.equal(ECSync.isConfigured(ECSync.loadConfig(storage)), false);
  ECSync.saveConfig(storage, {
    envId: ' chris-env ',
    publishableKey: 'secret-key',
    docId: ' doc1 '
  });
  const cfg = ECSync.loadConfig(storage);
  assert.deepEqual(cfg, { envId: 'chris-env', publishableKey: 'secret-key', docId: 'doc1' });
  assert.equal(ECSync.isConfigured(cfg), true);
  assert.equal(ECSync.isConfigured({ envId: 'chris-env', publishableKey: 'secret-key', docId: '' }), false);
  assert.equal(ECSync.hasKeys({ envId: 'chris-env', publishableKey: 'secret-key' }), true);
  ECSync.clearConfig(storage);
  assert.equal(storage.getItem(ECSync.SYNC_KEY), null);
  assert.equal(
    ECSync.apiBase({ envId: 'chris-env' }),
    'https://chris-env.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)'
  );
});

test('mocked CloudBase GET merges and PATCH sends v4 state without the key', async () => {
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
  const cfg = { envId: 'chris-env', publishableKey: 'secret-key', docId: 'doc1' };
  const docUrl = 'https://chris-env.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)/collections/ec_state/documents/doc1';
  let patchBody = null;
  const fetchImpl = async (url, opts = {}) => {
    assert.equal(opts.headers.Authorization, 'Bearer secret-key');
    assert.ok(!String(url).includes('secret-key'));
    if (opts.method === 'PATCH') {
      patchBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ data: { updated: 1 } }), text: async () => '' };
    }
    assert.equal(url, docUrl);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { _id: 'doc1', state: remote } }),
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
  assert.equal(patchBody.data.state.items.w001.seen, 5);
  assert.equal(patchBody.data.state.v, 4);
  assert.equal(patchBody.upsert, true);
  assert.equal(patchBody.replaceMode, false);
  assert.ok(!JSON.stringify(patchBody).includes('secret-key'));
});

test('failText uses HTTP status or 网络', () => {
  assert.equal(ECSync.failText({ ok: false, status: 401 }), '同步失败 · 401');
  assert.equal(ECSync.failText({ ok: false, status: 403 }), '同步失败 · 403');
  assert.equal(ECSync.failText({ ok: false, status: 0 }), '同步失败 · 网络');
  assert.equal(ECSync.failText(new TypeError('Failed to fetch')), '同步失败 · 网络');
});

test('create CloudBase document returns inserted id; existing id is bound with PATCH', async () => {
  assert.equal(ECSync.isConfigured({ envId: '', publishableKey: '', docId: '' }), false);
  let posted = null;
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.method, 'POST');
    assert.equal(url, 'https://chris-env.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)/collections/ec_state/documents');
    posted = JSON.parse(opts.body);
    return { ok: true, status: 201, json: async () => ({ data: { insertedIds: ['created99'] } }), text: async () => '' };
  };
  const created = await ECSync.createRemote(fetchImpl, { envId: 'chris-env', publishableKey: 'secret-key', docId: '' }, { v: 4, items: {} });
  assert.equal(created.ok, true);
  assert.equal(created.docId, 'created99');
  assert.equal(posted.data[0].state.v, 4);
  assert.ok(!JSON.stringify(posted).includes('secret-key'));

  let patched = null;
  const bindFetch = async (url, opts) => {
    assert.equal(opts.method, 'PATCH');
    assert.ok(url.endsWith('/documents/existing1'));
    patched = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ data: { updated: 1 } }), text: async () => '' };
  };
  const bound = await ECSync.createRemote(bindFetch, { envId: 'chris-env', publishableKey: 'secret-key', docId: 'existing1' }, { v: 4, items: {} });
  assert.equal(bound.docId, 'existing1');
  assert.equal(patched.upsert, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../queue.js');

function word(id, extra) {
  return Object.assign({ id, term: id, gloss_zh: '释义 ' + id, domain: 'life' }, extra);
}

function seq(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function lcg(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

test('clampMix and resolveMix: missing mix follows old mode', () => {
  assert.equal(Q.clampMix(-2), 0);
  assert.equal(Q.clampMix(2), 1);
  assert.equal(Q.clampMix('0.35'), 0.35);
  assert.equal(Q.clampMix('nope'), Q.MIX_DEFAULT);
  assert.equal(Q.resolveMix({ mode: 'review' }), 1);
  assert.equal(Q.resolveMix({ mode: 'all' }), Q.MIX_DEFAULT);
  assert.equal(Q.resolveMix({ mode: 'review', mix: 0.2 }), 0.2);
  assert.equal(Q.modeFromMix(1), 'review');
  assert.equal(Q.modeFromMix(0.99), 'all');
  assert.equal(Q.modeFromMix(0), 'all');
});

test('splitPools: new is unmarked, review is weak+reinforce, dropped is out', () => {
  const words = [word('a'), word('b'), word('c'), word('d'), word('e')];
  const items = {
    a: { status: null, seen: 2, needed: false },
    b: { status: 'weak', seen: 1, needed: true },
    c: { status: 'reinforce', seen: 3, needed: false },
    d: { status: 'dropped', seen: 1, needed: false }
    // e has no item → new
  };
  const pools = Q.splitPools(words, items);
  assert.deepEqual(pools.fresh.map(w => w.id), ['a', 'e']);
  assert.deepEqual(pools.review.map(w => w.id), ['b', 'c']);
});

test('listGroups keeps 还不熟 / 再巩固, drops dropped, marks 特别需要', () => {
  const words = [
    word('w2', { term: 'zeta', gloss_zh: 'Z' }),
    word('w1', { term: 'alpha', gloss_zh: 'A', usage: 'rw' }),
    word('w3', { term: 'mid', gloss_zh: 'M' }),
    word('w4', { term: 'gone', gloss_zh: 'G' })
  ];
  const items = {
    w1: { status: 'weak', seen: 1, needed: true },
    w2: { status: 'weak', seen: 1, needed: false },
    w3: { status: 'reinforce', seen: 1, needed: false },
    w4: { status: 'dropped', seen: 1, needed: true }
  };
  const g = Q.listGroups(words, items);
  assert.deepEqual(g.weak.map(r => r.id), ['w1', 'w2']);
  assert.equal(g.weak[0].term, 'alpha');
  assert.equal(g.weak[0].needed, true);
  assert.equal(g.weak[0].gloss_zh, 'A');
  assert.equal(g.weak[0].usage, 'rw');
  assert.equal(g.weak[1].usage, '');
  assert.deepEqual(g.reinforce.map(r => r.id), ['w3']);
  assert.equal(g.reinforce[0].status, 'reinforce');
  assert.ok(!g.weak.some(r => r.id === 'w4'));
  assert.ok(!g.reinforce.some(r => r.id === 'w4'));
});

test('pickNext mix=0 never draws review; mix=1 never draws new', () => {
  const words = [word('n1'), word('n2'), word('r1'), word('r2')];
  const state = {
    mix: 0,
    mode: 'all',
    recent: [],
    items: {
      r1: { status: 'weak', seen: 1, needed: false },
      r2: { status: 'reinforce', seen: 1, needed: false }
    }
  };
  const wfn = () => 1;
  for (let i = 0; i < 20; i++) {
    const got = Q.pickNext(words, state, wfn, () => 0.99, null);
    assert.ok(got, 'expected a new-word card');
    assert.ok(got.id === 'n1' || got.id === 'n2');
  }
  state.mix = 1;
  state.mode = 'review';
  for (let i = 0; i < 20; i++) {
    const got = Q.pickNext(words, state, wfn, () => 0.01, null);
    assert.ok(got);
    assert.ok(got.id === 'r1' || got.id === 'r2');
  }
});

test('stub RNG: mix 0.5 first draw < mix picks review, else new', () => {
  const words = [word('n1'), word('r1')];
  const state = {
    mix: 0.5,
    mode: 'all',
    recent: [],
    items: { r1: { status: 'weak', seen: 1, needed: false } }
  };
  const wfn = () => 1;
  // wantReview = rng() < 0.5; then weighted rng is unused leftover
  const review = Q.pickNext(words, state, wfn, seq([0.1, 0]), null);
  assert.equal(review.id, 'r1');
  const fresh = Q.pickNext(words, state, wfn, seq([0.7, 0]), null);
  assert.equal(fresh.id, 'n1');
});

test('seeded sampling bias: mix=0.8 draws review more often than new', () => {
  const words = [];
  const items = {};
  for (let i = 0; i < 10; i++) {
    words.push(word('n' + i));
    words.push(word('r' + i));
    items['r' + i] = { status: i % 2 ? 'weak' : 'reinforce', seen: 1, needed: false };
  }
  const state = { mix: 0.8, mode: 'all', recent: [], items };
  const rng = lcg(12345);
  let review = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const got = Q.pickNext(words, state, () => 1, rng, null);
    if (got.id.startsWith('r')) review += 1;
  }
  assert.ok(review >= 140 && review <= 180, 'review draws at mix 0.8: ' + review);
});

test('sleepingList is dropped words that were weak or reinforce, not first-sight drops', () => {
  const words = require('../words.json');
  // Mirrors the 2026-11-11 CloudBase snapshot: struggle then drop.
  // unprecedented / advocate were needed and dropped without weak or reinforce.
  const items = {
    w293: { status: 'dropped', seen: 3, needed: true },
    w338: { status: 'dropped', seen: 3, needed: false },
    w208: { status: 'dropped', seen: 3, needed: false },
    w209: { status: 'dropped', seen: 2, needed: true },
    w226: { status: 'dropped', seen: 2, needed: true },
    w235: { status: 'dropped', seen: 1, needed: true },
    w001: { status: 'weak', seen: 2, needed: false },
    w003: { status: 'reinforce', seen: 2, needed: false }
  };
  const log = [
    { id: 'w293', action: 'reinforce' },
    { id: 'w293', action: 'reinforce' },
    { id: 'w293', action: 'drop' },
    { id: 'w338', action: 'reinforce' },
    { id: 'w338', action: 'drop' },
    { id: 'w208', action: 'reinforce' },
    { id: 'w208', action: 'drop' },
    { id: 'w209', action: 'needed_on' },
    { id: 'w209', action: 'reinforce' },
    { id: 'w209', action: 'drop' },
    { id: 'w226', action: 'needed_on' },
    { id: 'w226', action: 'drop' },
    { id: 'w235', action: 'reveal' },
    { id: 'w235', action: 'needed_on' },
    { id: 'w235', action: 'drop' },
    { id: 'w001', action: 'weak' },
    { id: 'w003', action: 'reinforce' },
    { id: 'w003', action: 'drop' }
  ];
  const before = JSON.stringify(items);
  const rows = Q.sleepingList(words, items, log);
  assert.equal(JSON.stringify(items), before);
  assert.deepEqual(rows.map(r => r.id), ['w338', 'w209', 'w293', 'w208']);
  assert.deepEqual(rows.map(r => r.term), ['directional', 'inherent', 'secular', 'tenuous']);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(byId.w293.needed, true);
  assert.equal(byId.w209.needed, true);
  assert.equal(byId.w338.needed, false);
  assert.equal(byId.w208.needed, false);
  assert.equal(byId.w293.usage, 'speak');
  assert.equal(byId.w338.usage, 'speak');
  assert.equal(byId.w208.usage, 'rw');
  assert.equal(byId.w209.usage, 'rw');
  assert.equal(byId.w293.gloss_zh, '长期结构性的（不随短周期摇摆）');
  assert.equal(byId.w208.status, 'dropped');
  assert.ok(rows.every(r => r.status === 'dropped'));
  assert.ok(!rows.some(r => r.term === 'unprecedented' || r.term === 'advocate'));
  assert.ok(!rows.some(r => r.id === 'w001' || r.id === 'w003'));
});

test('status changes move a word into and out of the sleeping list', () => {
  const words = [
    word('s', { term: 'secular', gloss_zh: '长期', usage: 'speak' }),
    word('u', { term: 'unprecedented', gloss_zh: '前所未有' }),
    word('a', { term: 'advocate', gloss_zh: '提倡' }),
    word('k', { term: 'kept-old', gloss_zh: '旧标记' }),
    word('n', { term: 'plain', gloss_zh: '第一次放掉' })
  ];
  const items = {
    s: { status: 'dropped', seen: 3, needed: true },
    u: { status: 'dropped', seen: 2, needed: true },
    a: { status: 'dropped', seen: 1, needed: true },
    k: { status: 'dropped', seen: 2, needed: false },
    n: { status: 'dropped', seen: 4, needed: true }
  };
  const log = [
    { id: 's', action: 'reinforce' },
    { id: 's', action: 'drop' },
    { id: 'u', action: 'drop' },
    { id: 'a', action: 'skip_drop' },
    { id: 'k', action: 'keep' },
    { id: 'k', action: 'drop' },
    { id: 'n', action: 'reveal' },
    { id: 'n', action: 'needed_on' },
    { id: 'n', action: 'drop' },
    { action: 'weak' }
  ];
  const ids = () => Q.sleepingList(words, items, log).map(r => r.id);
  assert.deepEqual(ids(), ['s']);

  items.s.status = 'weak';
  assert.deepEqual(ids(), []);
  assert.deepEqual(Q.listGroups(words, items).weak.map(r => r.id), ['s']);

  items.s.status = 'reinforce';
  assert.deepEqual(ids(), []);
  assert.deepEqual(Q.listGroups(words, items).reinforce.map(r => r.id), ['s']);

  items.s.status = 'dropped';
  log.push({ id: 's', action: 'drop' });
  assert.deepEqual(ids(), ['s']);

  items.s.status = null;
  assert.deepEqual(ids(), []);
  items.s.status = 'dropped';
  log.push({ id: 's', action: 'weak' });
  assert.deepEqual(ids(), ['s']);

  const onlyWeak = word('wonly', { term: 'only-weak' });
  words.push(onlyWeak);
  items.wonly = { status: 'dropped', seen: 2, needed: false };
  log.push({ id: 'wonly', action: 'weak' }, { id: 'wonly', action: 'drop' });
  assert.deepEqual(ids(), ['wonly', 's']);

  assert.deepEqual(Q.sleepingList(words, items, null), []);
  assert.deepEqual(Q.sleepingList(null, items, log), []);
});

test('sleeping words stay out of the new and review pools', () => {
  const words = [word('n1'), word('r1'), word('s1', { term: 'secular' })];
  const items = {
    r1: { status: 'weak', seen: 1, needed: false },
    s1: { status: 'dropped', seen: 3, needed: true }
  };
  const log = [
    { id: 's1', action: 'reinforce' },
    { id: 's1', action: 'drop' }
  ];
  assert.deepEqual(Q.sleepingList(words, items, log).map(r => r.id), ['s1']);
  const pools = Q.splitPools(words, items);
  assert.deepEqual(pools.fresh.map(w => w.id), ['n1']);
  assert.deepEqual(pools.review.map(w => w.id), ['r1']);
  const state = { mix: 0.5, mode: 'all', recent: [], items };
  for (let i = 0; i < 30; i++) {
    const got = Q.pickNext(words, state, () => 1, seq([i % 2 ? 0.1 : 0.9, 0]), null);
    assert.ok(got);
    assert.notEqual(got.id, 's1');
  }
  state.mix = 0;
  for (let i = 0; i < 10; i++) assert.equal(Q.pickNext(words, state, () => 1, () => 0.2, null).id, 'n1');
  state.mix = 1;
  for (let i = 0; i < 10; i++) assert.equal(Q.pickNext(words, state, () => 1, () => 0.2, null).id, 'r1');
});

test('mix ends do not fall back; middle does if the chosen pool is empty', () => {
  const words = [word('n1'), word('r1')];
  const onlyNew = { mix: 1, mode: 'review', recent: [], items: {} };
  assert.equal(Q.pickNext(words, onlyNew, () => 1, () => 0, null), null);

  const onlyReview = {
    mix: 0,
    mode: 'all',
    recent: [],
    items: { n1: { status: 'dropped', seen: 1, needed: false }, r1: { status: 'weak', seen: 1, needed: false } }
  };
  assert.equal(Q.pickNext(words, onlyReview, () => 1, () => 0, null), null);

  const middleNoReview = { mix: 0.5, mode: 'all', recent: [], items: {} };
  const fallbackNew = Q.pickNext(words, middleNoReview, () => 1, seq([0.0, 0]), null);
  assert.equal(fallbackNew.id, 'n1');
});

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
    word('w1', { term: 'alpha', gloss_zh: 'A' }),
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

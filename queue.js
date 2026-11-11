/**
 * New/review mix, 生疏列表, and 沉睡清单 helpers for English Coach.
 * Vanilla UMD so node tests can require it and the H5 can load it as a script.
 *
 * mix 0 = only 新词 (status empty / unmarked, same unseen pool as before).
 * mix 1 = only 复习 (weak + reinforce, same pool as the old 复习 mode).
 * Middle: P(review) = mix, then existing weights inside the chosen pool.
 * dropped never enters either pool. 沉睡清单 is a separate scan of dropped
 * words whose log already has weak or reinforce; it is not a third pool.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ECQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIX_DEFAULT = 0.5;

  function clampMix(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return MIX_DEFAULT;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return Math.round(n * 100) / 100;
  }

  function resolveMix(state) {
    const s = state && typeof state === 'object' ? state : {};
    if (s.mix != null && s.mix !== '') return clampMix(s.mix);
    return s.mode === 'review' ? 1 : MIX_DEFAULT;
  }

  function modeFromMix(mix) {
    return clampMix(mix) >= 1 ? 'review' : 'all';
  }

  function itemStatus(items, id) {
    const r = items && items[id];
    return r && r.status != null ? r.status : null;
  }

  function isReviewStatus(st) {
    return st === 'weak' || st === 'reinforce';
  }

  function isNewStatus(st) {
    return st == null;
  }

  function splitPools(words, items) {
    const list = Array.isArray(words) ? words : [];
    const src = items && typeof items === 'object' ? items : {};
    const fresh = [];
    const review = [];
    for (const w of list) {
      if (!w || !w.id) continue;
      const st = itemStatus(src, w.id);
      if (st === 'dropped') continue;
      if (isReviewStatus(st)) review.push(w);
      else if (isNewStatus(st)) fresh.push(w);
    }
    return { fresh, review };
  }

  function listGroups(words, items) {
    const list = Array.isArray(words) ? words : [];
    const src = items && typeof items === 'object' ? items : {};
    const weak = [];
    const reinforce = [];
    for (const w of list) {
      if (!w || !w.id) continue;
      const r = src[w.id] || {};
      const st = r.status ?? null;
      if (st !== 'weak' && st !== 'reinforce') continue;
      const row = {
        id: w.id,
        term: w.term || '',
        gloss_zh: w.gloss_zh || '',
        usage: w.usage === 'speak' || w.usage === 'rw' ? w.usage : '',
        needed: !!r.needed,
        status: st
      };
      if (st === 'weak') weak.push(row);
      else reinforce.push(row);
    }
    const byTerm = (a, b) => String(a.term).localeCompare(String(b.term)) || String(a.id).localeCompare(String(b.id));
    weak.sort(byTerm);
    reinforce.sort(byTerm);
    return { weak, reinforce };
  }

  /**
   * Longer-horizon scan. A word is included only when its current status is
   * dropped AND its log has at least one weak or reinforce action.
   * First-sight drops stay out, including needed words and seen >= 2.
   * Membership is computed; nothing new is stored on the item.
   */
  function struggleIds(log) {
    const ids = new Set();
    if (!Array.isArray(log)) return ids;
    for (const e of log) {
      if (!e || e.id == null) continue;
      if (e.action === 'weak' || e.action === 'reinforce') ids.add(e.id);
    }
    return ids;
  }

  function sleepingList(words, items, log) {
    const list = Array.isArray(words) ? words : [];
    const src = items && typeof items === 'object' ? items : {};
    const struggled = struggleIds(log);
    const rows = [];
    for (const w of list) {
      if (!w || !w.id) continue;
      const r = src[w.id] || {};
      const st = r.status ?? null;
      if (st !== 'dropped') continue;
      if (!struggled.has(w.id)) continue;
      rows.push({
        id: w.id,
        term: w.term || '',
        gloss_zh: w.gloss_zh || '',
        usage: w.usage === 'speak' || w.usage === 'rw' ? w.usage : '',
        needed: !!r.needed,
        status: 'dropped'
      });
    }
    rows.sort((a, b) => String(a.term).localeCompare(String(b.term)) || String(a.id).localeCompare(String(b.id)));
    return rows;
  }

  function pickWeighted(cand, weightFn, rng) {
    if (!cand || !cand.length) return null;
    const rand = typeof rng === 'function' ? rng : Math.random;
    const tot = cand.reduce((a, w) => a + weightFn(w), 0);
    if (tot <= 0) return cand[cand.length - 1];
    let x = rand() * tot;
    for (const w of cand) {
      x -= weightFn(w);
      if (x < 0) return w;
    }
    return cand[cand.length - 1];
  }

  function narrowRecent(pool, recent, curId) {
    if (!pool || !pool.length) return pool || [];
    const k = Math.min(4, pool.length - 1);
    const rec = k > 0 && Array.isArray(recent) ? recent.slice(-k) : [];
    let cand = rec.length ? pool.filter(w => !rec.includes(w.id)) : pool;
    if (!cand.length) cand = pool;
    if (cand.length > 1 && curId) {
      const c2 = cand.filter(w => w.id !== curId);
      if (c2.length) cand = c2;
    }
    return cand;
  }

  /**
   * mix 0 / 1 stay in that pool even if it is empty (caller shows empty UI).
   * Middle falls back to the other pool so a 50/50 slider still deals cards.
   */
  function choosePool(fresh, review, mix, rng) {
    const m = clampMix(mix);
    if (m <= 0) return fresh;
    if (m >= 1) return review;
    const rand = typeof rng === 'function' ? rng : Math.random;
    const wantReview = rand() < m;
    if (wantReview) return review.length ? review : fresh;
    return fresh.length ? fresh : review;
  }

  function pickNext(words, state, weightFn, rng, curId) {
    const s = state && typeof state === 'object' ? state : {};
    const mix = resolveMix(s);
    const pools = splitPools(words, s.items);
    const pool = choosePool(pools.fresh, pools.review, mix, rng);
    const cand = narrowRecent(pool, s.recent, curId);
    return pickWeighted(cand, weightFn, rng);
  }

  return {
    MIX_DEFAULT,
    clampMix,
    resolveMix,
    modeFromMix,
    isReviewStatus,
    isNewStatus,
    splitPools,
    listGroups,
    sleepingList,
    pickWeighted,
    narrowRecent,
    choosePool,
    pickNext
  };
});

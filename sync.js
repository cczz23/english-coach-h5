/**
 * GitHub gist backup for English Coach.
 * Progress itself stays in localStorage key ec_state_v4.
 * The token and gist id stay in a separate key, ec_sync_v1, and are never
 * written into the repo, words.json, or the learning-state file on purpose.
 *
 * Merge rules (local = this device, remote = gist english-coach-state.json):
 * - Never replace one side with the other. A word that exists on only one
 *   side is kept. Log rows are unioned, not overwritten.
 * - Per word, `seen` (see count) is the higher of the two numbers.
 * - Per word, status / needed / updated / important come from the newer
 *   record: higher `updated` wins; a record that has `updated` beats one
 *   that does not; if still tied, this device wins. An explicit newer
 *   needed:false is kept (un-star is not resurrected).
 * - History is the union of both logs, de-duplicated by
 *   ts|id|action|term|seen|undone, then sorted by timestamp.
 * - `recent` is taken from the side whose log has the latest timestamp
 *   (this device on a tie), capped at 10. It is only a "don't repeat" queue.
 * - `undo` is NOT merged. Those entries are pre-images from this device's
 *   last few taps; applying the other device's snapshots would clobber the
 *   union above. The local undo stack is preserved as-is.
 * - `mode` follows the latest mode_all / mode_review log entry across both
 *   histories. If neither side logged a mode change, the side with the
 *   newer per-word `updated` wins; if that is also tied, this device wins.
 * - Migration bookkeeping (migratedFrom / migratedAt / migratedKeepTo /
 *   prevMigratedAt) keeps this device's value when set, otherwise the remote.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ECSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SYNC_KEY = 'ec_sync_v1';
  const GIST_FILE = 'english-coach-state.json';
  const API = 'https://api.github.com';

  function ensureItem(r) {
    const src = r && typeof r === 'object' ? r : {};
    const o = { status: src.status ?? null, seen: src.seen || 0, needed: !!src.needed };
    if (src.updated != null) o.updated = src.updated;
    if (src.important !== undefined) o.important = src.important;
    return o;
  }

  function normalizeState(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const items = {};
    const src = s.items && typeof s.items === 'object' && !Array.isArray(s.items) ? s.items : {};
    for (const id of Object.keys(src).sort()) items[id] = ensureItem(src[id]);
    const out = {
      v: 4,
      mode: s.mode === 'review' ? 'review' : 'all',
      items,
      recent: Array.isArray(s.recent) ? s.recent.slice(-10) : [],
      log: Array.isArray(s.log) ? s.log.filter(e => e && typeof e === 'object').map(e => ({ ...e })) : [],
      undo: Array.isArray(s.undo) ? s.undo : []
    };
    if (s.migratedFrom) out.migratedFrom = s.migratedFrom;
    if (s.migratedAt) out.migratedAt = s.migratedAt;
    if (s.migratedKeepTo) out.migratedKeepTo = s.migratedKeepTo;
    if (s.prevMigratedAt) out.prevMigratedAt = s.prevMigratedAt;
    return out;
  }

  function canonical(state) {
    return JSON.stringify(normalizeState(state));
  }

  function logKey(e) {
    return [e.ts ?? '', e.id ?? '', e.action ?? '', e.term ?? '', e.seen ?? '', e.undone ?? ''].join('\u001f');
  }

  function unionLog(a, b) {
    const map = new Map();
    for (const e of [...(a || []), ...(b || [])]) {
      if (!e || typeof e !== 'object') continue;
      const k = logKey(e);
      if (!map.has(k)) map.set(k, { ...e });
    }
    return [...map.values()].sort((x, y) => (x.ts || 0) - (y.ts || 0) || logKey(x).localeCompare(logKey(y)));
  }

  function maxLogTs(log) {
    let m = 0;
    for (const e of log || []) if (typeof e.ts === 'number' && e.ts > m) m = e.ts;
    return m;
  }

  function maxItemUpdated(items) {
    let m = 0;
    for (const r of Object.values(items || {})) if (r && r.updated > m) m = r.updated;
    return m;
  }

  /** Which per-word record is newer. preferFirst is used when timestamps tie. */
  function newerItem(a, b, preferFirst) {
    const au = a.updated || 0;
    const bu = b.updated || 0;
    if (au !== bu) return au > bu ? a : b;
    if (!au && !bu) {
      const aSet = a.status != null;
      const bSet = b.status != null;
      if (aSet !== bSet) return aSet ? a : b;
    }
    return preferFirst ? a : b;
  }

  function mergeItem(local, remote) {
    if (!local) return ensureItem(remote);
    if (!remote) return ensureItem(local);
    const a = ensureItem(local);
    const b = ensureItem(remote);
    const pick = newerItem(a, b, true);
    const other = pick === a ? b : a;
    const out = {
      status: pick.status ?? null,
      seen: Math.max(a.seen || 0, b.seen || 0),
      needed: !!pick.needed
    };
    const upd = Math.max(a.updated || 0, b.updated || 0);
    if (upd) out.updated = upd;
    if (pick.important !== undefined) out.important = pick.important;
    else if (other.important !== undefined) out.important = other.important;
    return out;
  }

  function modeFromLogs(log) {
    let best = null;
    for (const e of log || []) {
      if (e.action !== 'mode_all' && e.action !== 'mode_review') continue;
      if (!best || (e.ts || 0) >= (best.ts || 0)) best = e;
    }
    if (!best) return null;
    return best.action === 'mode_review' ? 'review' : 'all';
  }

  function mergeState(local, remote) {
    const L = normalizeState(local);
    const R = normalizeState(remote);
    const ids = new Set([...Object.keys(L.items), ...Object.keys(R.items)]);
    const items = {};
    for (const id of [...ids].sort()) items[id] = mergeItem(L.items[id], R.items[id]);
    const log = unionLog(L.log, R.log);
    const fromLog = modeFromLogs(log);
    let mode = fromLog;
    if (!mode) {
      const lu = maxItemUpdated(L.items);
      const ru = maxItemUpdated(R.items);
      mode = ru > lu ? R.mode : L.mode;
    }
    const recent = (maxLogTs(L.log) >= maxLogTs(R.log) ? L.recent : R.recent).slice(-10);
    const out = { v: 4, mode, items, recent, log, undo: L.undo };
    const meta = [
      ['migratedFrom', L.migratedFrom || R.migratedFrom],
      ['migratedAt', L.migratedAt || R.migratedAt],
      ['migratedKeepTo', L.migratedKeepTo || R.migratedKeepTo],
      ['prevMigratedAt', L.prevMigratedAt || R.prevMigratedAt]
    ];
    for (const [k, v] of meta) if (v) out[k] = v;
    return out;
  }

  function loadConfig(storage) {
    try {
      const o = JSON.parse(storage.getItem(SYNC_KEY) || 'null');
      if (!o || typeof o !== 'object') return { token: '', gistId: '' };
      return { token: String(o.token || ''), gistId: String(o.gistId || '') };
    } catch (e) {
      return { token: '', gistId: '' };
    }
  }

  function saveConfig(storage, cfg) {
    const token = String((cfg && cfg.token) || '');
    const gistId = String((cfg && cfg.gistId) || '').trim();
    storage.setItem(SYNC_KEY, JSON.stringify({ token, gistId }));
  }

  function clearConfig(storage) {
    storage.removeItem(SYNC_KEY);
  }

  function isConfigured(cfg) {
    return !!(cfg && String(cfg.token || '').trim() && String(cfg.gistId || '').trim());
  }

  /** Short one-line failure: HTTP status, or 网络 when fetch throws / no status. */
  function failText(err) {
    const status = err && typeof err.status === 'number' ? err.status : 0;
    if (status > 0) return '同步失败 · ' + status;
    return '同步失败 · 网络';
  }

  function headers(token) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function isV4(parsed) {
    return !!(parsed && parsed.v === 4 && parsed.items && typeof parsed.items === 'object' && !Array.isArray(parsed.items));
  }

  async function fetchRemote(fetchImpl, token, gistId) {
    const res = await fetchImpl(API + '/gists/' + encodeURIComponent(gistId), { headers: headers(token) });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const file = data && data.files && data.files[GIST_FILE];
    if (!file) return { ok: true, state: null };
    let content = file.content;
    if (file.truncated && file.raw_url) {
      const raw = await fetchImpl(file.raw_url, { headers: headers(token) });
      if (!raw.ok) return { ok: false, status: raw.status };
      content = await raw.text();
    }
    if (typeof content !== 'string' || !content) return { ok: true, state: null };
    let parsed;
    try { parsed = JSON.parse(content); } catch (e) { return { ok: false, status: 0 }; }
    if (!isV4(parsed)) return { ok: true, state: null };
    return { ok: true, state: parsed };
  }

  async function pushState(fetchImpl, token, gistId, state) {
    const res = await fetchImpl(API + '/gists/' + encodeURIComponent(gistId), {
      method: 'PATCH',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { [GIST_FILE]: { content: JSON.stringify(normalizeState(state)) } }
      })
    });
    return { ok: !!res.ok, status: res.status };
  }

  async function createGist(fetchImpl, token, state) {
    const res = await fetchImpl(API + '/gists', {
      method: 'POST',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'English Coach progress (ec_state_v4)',
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(normalizeState(state)) } }
      })
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    if (!data || !data.id) return { ok: false, status: res.status };
    return { ok: true, gistId: String(data.id) };
  }

  return {
    SYNC_KEY,
    GIST_FILE,
    ensureItem,
    normalizeState,
    canonical,
    mergeState,
    loadConfig,
    saveConfig,
    clearConfig,
    isConfigured,
    failText,
    fetchRemote,
    pushState,
    createGist
  };
});

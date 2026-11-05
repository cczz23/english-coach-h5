/**
 * Tencent CloudBase (云开发) backup for English Coach.
 * Progress itself stays in localStorage key ec_state_v4.
 * Env id, Publishable Key, and doc id stay in ec_tcb_v1 on this device.
 * They are never written into the repo or words.json. Do not store a secret API Key.
 *
 * The phone calls the mainland gateway
 * https://{envId}.api.tcloudbasegateway.com (Shanghai). No VPN.
 * Auth is the Publishable Key as Authorization: Bearer, the same way
 * @cloudbase/js-sdk v3 sets an accessKey (no anonymous sign-in round trip).
 * One document in collection ec_state; field `state` is the ec_state_v4 object.
 * CloudBase GET bodies are Strict EJSON, so ints/longs arrive as
 * { "$numberInt": "4" } / { "$numberLong": "..." }. Unwrap before v === 4.
 *
 * Merge rules (local = this device, remote = that `state` field):
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
 * - `mode` follows the latest mode_all / mode_review / mix log entry across
 *   both histories. A mix log also sets `mix` (0 = all 新词, 1 = all 复习).
 *   mode_review implies mix=1; mode_all keeps the winning side's mix but
 *   not 1. If neither side logged a mode/mix change, the side with the
 *   newer per-word `updated` wins; if that is also tied, this device wins.
 * - Migration bookkeeping (migratedFrom / migratedAt / migratedKeepTo /
 *   prevMigratedAt) keeps this device's value when set, otherwise the remote.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ECSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SYNC_KEY = 'ec_tcb_v1';
  const COLLECTION = 'ec_state';

  function ensureItem(r) {
    const src = r && typeof r === 'object' ? r : {};
    const o = { status: src.status ?? null, seen: src.seen || 0, needed: !!src.needed };
    if (src.updated != null) o.updated = src.updated;
    if (src.important !== undefined) o.important = src.important;
    return o;
  }

  function unwrapEjsonNumber(raw) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }

  /** Strict EJSON number wrappers → JS numbers. Recursive; does not mutate input. */
  function fromExtendedJson(value) {
    if (Array.isArray(value)) return value.map(fromExtendedJson);
    if (!value || typeof value !== 'object') return value;
    const keys = Object.keys(value);
    if (keys.length === 1) {
      if (keys[0] === '$numberInt' || keys[0] === '$numberLong' || keys[0] === '$numberDouble') {
        return unwrapEjsonNumber(fromExtendedJson(value[keys[0]]));
      }
    }
    const out = {};
    for (const k of keys) out[k] = fromExtendedJson(value[k]);
    return out;
  }

  function asStateObject(raw) {
    const s = fromExtendedJson(raw);
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  }

  const MIX_DEFAULT = 0.5;

  function clampMix(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return MIX_DEFAULT;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return Math.round(n * 100) / 100;
  }

  function resolveMix(s) {
    const src = s && typeof s === 'object' ? s : {};
    if (src.mix != null && src.mix !== '') return clampMix(src.mix);
    return src.mode === 'review' ? 1 : MIX_DEFAULT;
  }

  function modeFromMix(mix) {
    return clampMix(mix) >= 1 ? 'review' : 'all';
  }

  function normalizeState(raw) {
    const s = asStateObject(raw);
    const items = {};
    const src = s.items && typeof s.items === 'object' && !Array.isArray(s.items) ? s.items : {};
    for (const id of Object.keys(src).sort()) items[id] = ensureItem(src[id]);
    const mix = resolveMix(s);
    const out = {
      v: 4,
      mode: modeFromMix(mix),
      mix,
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

  function latestMixModeLog(log) {
    let best = null;
    for (const e of log || []) {
      if (e.action !== 'mode_all' && e.action !== 'mode_review' && e.action !== 'mix') continue;
      if (!best || (e.ts || 0) >= (best.ts || 0)) best = e;
    }
    return best;
  }

  function mixModeFromWinner(L, R) {
    const lu = maxItemUpdated(L.items);
    const ru = maxItemUpdated(R.items);
    const winner = ru > lu ? R : L;
    const mix = resolveMix(winner);
    return { mode: modeFromMix(mix), mix };
  }

  function mixModeFromLogs(best, L, R) {
    if (!best) return mixModeFromWinner(L, R);
    if (best.action === 'mix') {
      const mix = clampMix(best.mix);
      return { mode: modeFromMix(mix), mix };
    }
    if (best.action === 'mode_review') return { mode: 'review', mix: 1 };
    const lu = maxLogTs(L.log);
    const ru = maxLogTs(R.log);
    let mix = ru > lu ? R.mix : L.mix;
    if (mix >= 1) mix = MIX_DEFAULT;
    mix = clampMix(mix);
    return { mode: 'all', mix };
  }

  function mergeState(local, remote) {
    const L = normalizeState(local);
    const R = normalizeState(remote);
    const ids = new Set([...Object.keys(L.items), ...Object.keys(R.items)]);
    const items = {};
    for (const id of [...ids].sort()) items[id] = mergeItem(L.items[id], R.items[id]);
    const log = unionLog(L.log, R.log);
    const { mode, mix } = mixModeFromLogs(latestMixModeLog(log), L, R);
    const recent = (maxLogTs(L.log) >= maxLogTs(R.log) ? L.recent : R.recent).slice(-10);
    const out = { v: 4, mode, mix, items, recent, log, undo: L.undo };
    const meta = [
      ['migratedFrom', L.migratedFrom || R.migratedFrom],
      ['migratedAt', L.migratedAt || R.migratedAt],
      ['migratedKeepTo', L.migratedKeepTo || R.migratedKeepTo],
      ['prevMigratedAt', L.prevMigratedAt || R.prevMigratedAt]
    ];
    for (const [k, v] of meta) if (v) out[k] = v;
    return out;
  }

  function blankConfig() {
    return { envId: '', publishableKey: '', docId: '' };
  }

  function loadConfig(storage) {
    try {
      const o = JSON.parse(storage.getItem(SYNC_KEY) || 'null');
      if (!o || typeof o !== 'object') return blankConfig();
      return {
        envId: String(o.envId || '').trim(),
        publishableKey: String(o.publishableKey || ''),
        docId: String(o.docId || '').trim()
      };
    } catch (e) {
      return blankConfig();
    }
  }

  function saveConfig(storage, cfg) {
    storage.setItem(SYNC_KEY, JSON.stringify({
      envId: String((cfg && cfg.envId) || '').trim(),
      publishableKey: String((cfg && cfg.publishableKey) || ''),
      docId: String((cfg && cfg.docId) || '').trim()
    }));
  }

  function clearConfig(storage) {
    storage.removeItem(SYNC_KEY);
  }

  function hasKeys(cfg) {
    return !!(cfg && String(cfg.envId || '').trim() && String(cfg.publishableKey || '').trim());
  }

  /** Pull/push need a document id. Create only needs the env and key. */
  function isConfigured(cfg) {
    return hasKeys(cfg) && !!String(cfg.docId || '').trim();
  }

  /** Short one-line failure: HTTP status, or 网络 when fetch throws / no status. */
  function failText(err) {
    const status = err && typeof err.status === 'number' ? err.status : 0;
    if (status > 0) return '同步失败 · ' + status;
    return '同步失败 · 网络';
  }

  /** Mainland gateway. International envs use api.intl and are not the phone path. */
  function apiBase(cfg) {
    const envId = String((cfg && cfg.envId) || '').trim();
    return 'https://' + envId + '.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)';
  }

  function tcbHeaders(cfg, json) {
    const headers = { Authorization: 'Bearer ' + cfg.publishableKey };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function isV4(parsed) {
    const s = asStateObject(parsed);
    return !!(s && s.v === 4 && s.items && typeof s.items === 'object' && !Array.isArray(s.items));
  }

  function readStateField(data) {
    if (!data || data.state == null) return null;
    let parsed = data.state;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (e) { return null; }
    }
    parsed = fromExtendedJson(parsed);
    return isV4(parsed) ? parsed : null;
  }

  function readDocState(body) {
    if (!body || typeof body !== 'object') return null;
    const data = body.data;
    if (Array.isArray(data)) return readStateField(data[0]);
    if (data && Array.isArray(data.list)) return readStateField(data.list[0]);
    if (data && typeof data === 'object' && data.state != null) return readStateField(data);
    return readStateField(body);
  }

  function collectionUrl(cfg, docId) {
    const base = apiBase(cfg) + '/collections/' + COLLECTION + '/documents';
    return docId ? base + '/' + encodeURIComponent(docId) : base;
  }

  function pickDocId(body) {
    if (!body || typeof body !== 'object') return '';
    const data = body.data && typeof body.data === 'object' ? body.data : body;
    const ids = data.insertedIds || body.insertedIds;
    if (Array.isArray(ids) && ids.length) return String(ids[0]);
    if (data._id) return String(data._id);
    if (data.id) return String(data.id);
    if (data.upsert_id) return String(data.upsert_id);
    return '';
  }

  async function fetchRemote(fetchImpl, cfg) {
    const res = await fetchImpl(collectionUrl(cfg, cfg.docId), { headers: tcbHeaders(cfg) });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, state: readDocState(data) };
  }

  async function pushState(fetchImpl, cfg, state) {
    const res = await fetchImpl(collectionUrl(cfg, cfg.docId), {
      method: 'PATCH',
      headers: tcbHeaders(cfg, true),
      body: JSON.stringify({
        data: { state: normalizeState(state) },
        replaceMode: false,
        upsert: true
      })
    });
    return { ok: !!res.ok, status: res.status };
  }

  async function createRemote(fetchImpl, cfg, state) {
    const payload = { state: normalizeState(state) };
    if (cfg.docId) {
      const res = await fetchImpl(collectionUrl(cfg, cfg.docId), {
        method: 'PATCH',
        headers: tcbHeaders(cfg, true),
        body: JSON.stringify({ data: payload, replaceMode: false, upsert: true })
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, docId: cfg.docId };
    }
    const res = await fetchImpl(collectionUrl(cfg), {
      method: 'POST',
      headers: tcbHeaders(cfg, true),
      body: JSON.stringify({ data: [payload] })
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const docId = pickDocId(data);
    if (!docId) return { ok: false, status: res.status || 0 };
    return { ok: true, docId };
  }

  return {
    SYNC_KEY,
    COLLECTION,
    ensureItem,
    fromExtendedJson,
    normalizeState,
    canonical,
    mergeState,
    loadConfig,
    saveConfig,
    clearConfig,
    hasKeys,
    isConfigured,
    failText,
    apiBase,
    fetchRemote,
    pushState,
    createRemote
  };
});

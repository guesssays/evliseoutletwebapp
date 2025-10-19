// netlify/functions/notifs.js
// Сервер "богатых" уведомлений: хранит per-user список в Netlify Blobs
// ENDPOINTS:
//   GET  ?op=list&uid=<uid>
//   POST { op:'add',     uid, notif:{ id?, ts?, read?, icon?, title?, sub? } }
//   POST { op:'markAll', uid }
//   POST { op:'mark',    uid, ids:[...] }
// ENV: ALLOWED_ORIGINS (опц., через запятую: "*", "https://example.com", "*.domain.com")

/* ---------------- CORS ---------------- */
function parseAllowed() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
function isTelegramOrigin(origin) {
  return origin === 'https://t.me' ||
         origin === 'https://web.telegram.org' ||
         origin === 'https://telegram.org';
}
function originMatches(origin, rule) {
  if (!rule || rule === '*') return true;
  if (!origin) return false;
  if (rule.startsWith('*.')) {
    try {
      const host = new URL(origin).hostname;
      const suffix = rule.slice(1); // ".example.com"
      return host === rule.slice(2) || host.endsWith(suffix);
    } catch { return false; }
  }
  return origin === rule;
}
function buildCorsHeaders(origin) {
  const allowed = parseAllowed();
  const isAllowed = !allowed.length ||
                    isTelegramOrigin(origin) ||
                    allowed.some(rule => originMatches(origin, rule));
  const allowOrigin = isAllowed ? (origin || '*') : 'null';
  return {
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    },
    isAllowed,
  };
}

/* ---------------- Storage (Netlify Blobs v7) ---------------- */
async function getStoreSafe() {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('notifs'); // отдельный namespace
    // проверка доступности
    await store.list({ prefix: '__ping__', paginate: false });
    return makeBlobsStore(store);
  } catch (e) {
    console.warn('[notifs] blobs unavailable, fallback to memory:', e?.message || e);
    return makeMemoryStore();
  }
}
function makeBlobsStore(store) {
  const prefix = 'notifs__'; // ключ на пользователя

  const keyFor = (uid) => `${prefix}${uid}`;

  async function read(uid) {
    try {
      const data = await store.get(keyFor(uid), { type: 'json', consistency: 'strong' });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  async function write(uid, list) {
    await store.setJSON(keyFor(uid), list);
  }
  return makeStoreCore(read, write);
}

// in-memory fallback (на случай dev без blobs)
const __mem = new Map();
function makeMemoryStore() {
  async function read(uid){ return __mem.get(uid) || []; }
  async function write(uid, list){ __mem.set(uid, list.slice()); }
  return makeStoreCore(read, write);
}

/* ---------------- Core per-user list ops ---------------- */
function makeStoreCore(read, write) {
  const MAX_ITEMS = 100; // ограничим хвост

  const normalize = (n = {}) => ({
    id:   String(n.id ?? Date.now()),
    ts:   Number(n.ts ?? Date.now()),
    read: !!n.read,
    icon: String(n.icon || 'bell'),
    title: String(n.title || ''),
    sub:   String(n.sub || ''),
  });

  return {
    async list(uid) {
      const arr = await read(uid);
      arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return arr;
    },
    async add(uid, notif) {
      const arr = await read(uid);
      const one = normalize(notif);
      // не допускаем дубликатов по id
      const idStr = String(one.id);
      const idx = arr.findIndex(x => String(x.id) === idStr);
      if (idx === -1) arr.unshift(one);
      else arr[idx] = { ...arr[idx], ...one };
      // обрежем хвост
      if (arr.length > MAX_ITEMS) arr.length = MAX_ITEMS;
      await write(uid, arr);
      return idStr;
    },
    async markAll(uid) {
      const arr = await read(uid);
      let changed = false;
      for (const n of arr) {
        if (!n.read) { n.read = true; changed = true; }
      }
      if (changed) await write(uid, arr);
      return true;
    },
    async mark(uid, ids = []) {
      const want = new Set((ids || []).map(String));
      if (!want.size) return true;
      const arr = await read(uid);
      let changed = false;
      for (const n of arr) {
        if (want.has(String(n.id)) && !n.read) { n.read = true; changed = true; }
      }
      if (changed) await write(uid, arr);
      return true;
    },
  };
}

/* ---------------- HTTP handler ---------------- */
export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const { headers, isAllowed } = buildCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, ...headers };
  }
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return { statusCode: 405, body: 'Method Not Allowed', ...headers };
  }
  if (!isAllowed) {
    return { statusCode: 403, body: 'Forbidden by CORS', ...headers };
  }

  try {
    const store = await getStoreSafe();

    if (event.httpMethod === 'GET') {
      const op  = String(event.queryStringParameters?.op || 'list').toLowerCase();
      const uid = String(event.queryStringParameters?.uid || '').trim();
      if (!uid) return bad('uid required', headers);

      if (op === 'list') {
        const items = await store.list(uid);
        return ok({ items }, headers);
      }
      return bad('unknown op', headers);
    }

    // POST
    const body = JSON.parse(event.body || '{}') || {};
    const op  = String(body.op || '').toLowerCase();
    const uid = String(body.uid || '').trim();
    if (!uid) return bad('uid required', headers);

    if (op === 'add') {
      const id = await store.add(uid, body.notif || {});
      return ok({ id }, headers);
    }
    if (op === 'markAll') {
      await store.markAll(uid);
      return ok({}, headers);
    }
    if (op === 'mark') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      await store.mark(uid, ids);
      return ok({}, headers);
    }

    return bad('unknown op', headers);
  } catch (e) {
    console.error('[notifs] handler error:', e);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }), ...headers };
  }
}

/* ---------------- helpers ---------------- */
function ok(json, headers){ return { statusCode:200, body: JSON.stringify({ ok:true, ...json }), ...headers }; }
function bad(msg, headers){ return { statusCode:400, body: JSON.stringify({ ok:false, error: msg }), ...headers }; }

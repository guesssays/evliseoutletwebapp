// netlify/functions/orders.js
// Централизованное хранилище заказов (Netlify Blobs) + операции админа
// ENV: TG_BOT_TOKEN, ADMIN_CHAT_ID (может быть список через запятую), WEBAPP_URL
//      ALLOWED_ORIGINS (опц.), ALLOW_MEMORY_FALLBACK=1 (только для DEV)
//
// Поведение: в продакшене, если Netlify Blobs временно недоступны — возвращаем 503,
// чтобы клиент НЕ обнулял локальный кэш и не «терял» заказы.
//
// ❗Дополнительно:
//   • Автоподтверждение кэшбэка через 24ч выполняет scheduled-function `auto-accrual.js`.
//   • Здесь сохраняем/читаем поле `accrualConfirmedAt`, чтобы крон не дублировал подтверждения.

const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_MEMORY_FALLBACK = String(process.env.ALLOW_MEMORY_FALLBACK || '').trim() === '1';

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
      const suffix = rule.slice(1);
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

/* ---------- helper для вызовов в loyalty ---------- */
async function callLoyalty(op, payload){
  const base = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/,'');
  if (!base) throw new Error('no base URL for loyalty');
  const url = `${base}/.netlify/functions/loyalty`;
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json', 'Origin': base},
    body: JSON.stringify({ op, ...payload })
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.reason || 'loyalty error');
  return j;
}

/* ---------------- Netlify Function ---------------- */
export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const { headers, isAllowed } = buildCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, ...headers };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed', ...headers };
  }
  if (!isAllowed) {
    return { statusCode: 403, body: 'Forbidden by CORS', ...headers };
  }

  let store;
  let storeKind = 'blobs';
  try {
    store = await getStoreSafe(); // Blobs или (в DEV) in-memory
    storeKind = store.__kind || 'blobs';
  } catch (e) {
    console.error('[orders] store init failed:', e?.message || e);
    return svcUnavailable(headers, 'persistent store unavailable');
  }

  try {
    if (event.httpMethod === 'GET') {
      const op = (event.queryStringParameters?.op || 'list').toLowerCase();

      if (op === 'health') {
        const count = await store.count().catch(()=>null);
        return ok({ health: { store: storeKind, count } }, headers);
      }

      if (op === 'list') {
        const items = await store.list();
        return ok({ orders: items }, headers);
      }
      if (op === 'get' && event.queryStringParameters?.id) {
        const o = await store.get(String(event.queryStringParameters.id));
        return ok({ order: o || null }, headers);
      }
      return bad('unknown op', headers);
    }

    // POST
    const body = JSON.parse(event.body || '{}') || {};
    const op = String(body.op || '').toLowerCase();

    if (op === 'add') {
      const id = await store.add(body.order || {});
      try { await notifyAdminNewOrder(id, body.order); } catch (e) {
        console.error('[orders] notifyAdminNewOrder error:', e);
      }
      return ok({ id }, headers);
    }

    if (op === 'accept') {
      const id = String(body.id || '');
      const o = await store.accept(id);
      return ok({ ok: !!o, order: o || null }, headers);
    }

    if (op === 'cancel') {
      const id = String(body.id || '');
      const reason = String(body.reason || '');
      const o = await store.cancel(id, reason);

      // ▼ сервисные вызовы лояльности (мягко, не ломаем ответ, если что-то пойдёт не так)
      if (o && o.userId) {
        try {
          await callLoyalty('finalizeredeem', { uid: String(o.userId), orderId: String(o.id), action: 'cancel' });
        } catch(e){ console.warn('[orders] loyalty.finalizeredeem(cancel) failed:', e?.message||e); }
        try {
          await callLoyalty('voidaccrual', { orderId: String(o.id) });
        } catch(e){ console.warn('[orders] loyalty.voidaccrual failed:', e?.message||e); }
      }

      return ok({ ok: !!o, order: o || null }, headers);
    }

    if (op === 'status') {
      const id = String(body.id || '');
      const status = String(body.status || '');
      const o = await store.status(id, status);

      // ✅ Мгновенное подтверждение кэшбэка при «выдан».
      // Крон `auto-accrual.js` дополнительно подтвердит старые заказы ≥24ч.
      if (o && o.userId && status === 'выдан') {
        try {
          await callLoyalty('confirmaccrual', { uid: String(o.userId), orderId: String(o.id) });
          // отметим, что подтверждение сделано (чтобы крон не делал повторно)
          try {
            await store.markAccrualConfirmed(String(o.id));
          } catch {}
        } catch (e) {
          console.warn('[orders] loyalty.confirmaccrual failed:', e?.message || e);
        }
      }

      return ok({ ok: !!o, order: o || null }, headers);
    }

    return bad('unknown op', headers);
  } catch (e) {
    console.error('[orders] handler op error:', e);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }), ...headers };
  }
}

/* ---------------- Storage (Blobs v7 getStore) ---------------- */
async function getStoreSafe(){
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('orders'); // общий namespace сайта

    // Проверка доступности с strong-консистентностью
    await store.get('__ping__', { type: 'json', consistency: 'strong' });

    console.log('[orders] Using Netlify Blobs via getStore');
    return makeBlobsStore(store);
  } catch (e) {
    console.warn('[orders] Netlify Blobs not available:', e?.message || e);
    if (IS_PROD && !ALLOW_MEMORY_FALLBACK) {
      throw new Error('Persistent store unavailable in production');
    }
    console.warn('[orders] Falling back to in-memory (DEV only).');
    return makeMemoryStore();
  }
}

function makeBlobsStore(store){
  const KEY_ALL = 'orders_all';

  async function readAll(){
    const data = await store.get(KEY_ALL, { type: 'json', consistency: 'strong' });
    return Array.isArray(data) ? data : [];
  }
  async function writeAll(list){
    await store.setJSON(KEY_ALL, Array.isArray(list) ? list : []);
  }

  const core = makeStoreCore(readAll, writeAll);
  core.__kind = 'blobs';

  // служебный метод — пометить подтверждение кэшбэка
  core.markAccrualConfirmed = async function(id){
    const list = await readAll();
    const i = list.findIndex(o => String(o.id) === String(id));
    if (i === -1) return false;
    if (!list[i].accrualConfirmedAt) {
      list[i].accrualConfirmedAt = Date.now();
      await writeAll(list);
    }
    return true;
  };

  return core;
}

/* ---------------- In-memory fallback (DEV ONLY) ---------------- */
const __mem = { orders: [] };
function makeMemoryStore(){
  async function readAll(){ return __mem.orders.slice(); }
  async function writeAll(list){ __mem.orders = Array.isArray(list) ? list.slice() : []; }
  const core = makeStoreCore(readAll, writeAll);
  core.__kind = 'memory';
  core.markAccrualConfirmed = async function(id){
    const i = __mem.orders.findIndex(o => String(o.id) === String(id));
    if (i === -1) return false;
    if (!__mem.orders[i].accrualConfirmedAt) {
      __mem.orders[i].accrualConfirmedAt = Date.now();
    }
    return true;
  };
  return core;
}

/* ---------------- Store core (общая логика CRUD) ---------------- */
function makeStoreCore(readAll, writeAll){
  function writeHistory(order, status, extra = {}) {
    const rec = { ts: Date.now(), status, ...extra };
    order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
  }
  return {
    async count(){
      const arr = await readAll();
      return Array.isArray(arr) ? arr.length : null;
    },
    async list(){
      const arr = await readAll();
      arr.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      return arr;
    },
    async get(id){
      const list = await readAll();
      return list.find(o=>String(o.id)===String(id)) || null;
    },
    async add(order){
      const list = await readAll();

      // ✅ сохраняем короткий публичный ID, если он передан с клиента
      const shortId = order.shortId ?? order.code ?? null;

      const id = order.id ?? String(Date.now());
      const now = Date.now();
      const initialStatus = order.status ?? 'новый';
      const next = {
        id,
        shortId, // ← короткий номер
        userId: order.userId ?? null,
        username: order.username ?? '',
        productId: order.productId ?? null,
        size: order.size ?? null,
        color: order.color ?? null,
        link: order.link ?? (order.productId ? `#/product/${order.productId}` : ''),
        cart: Array.isArray(order.cart) ? order.cart : [],
        total: Number(order.total || 0),
        address: typeof order.address === 'string' ? order.address : (order.address?.address || ''),
        phone: order.phone ?? '',
        payerFullName: order.payerFullName ?? '',
        paymentScreenshot: order.paymentScreenshot ?? '',
        status: initialStatus,
        accepted: !!order.accepted,
        canceled: !!order.canceled,
        cancelReason: order.cancelReason || '',
        canceledAt: order.canceledAt || null,
        completedAt: order.completedAt || null,
        createdAt: order.createdAt ?? now,
        currency: order.currency || 'UZS',
        history: order.history ?? [{ ts: now, status: initialStatus }],
        // поле для крона/онлайн-подтверждения
        accrualConfirmedAt: order.accrualConfirmedAt ?? null,
      };
      list.unshift(next);
      await writeAll(list);
      return next.id;
    },
    async accept(id){
      const list = await readAll();
      const i = list.findIndex(o=>String(o.id)===String(id));
      if (i===-1) return null;
      const o = list[i];
      if (o.status!=='новый' || o.canceled) return null;
      o.accepted = true;
      o.status = 'принят';
      writeHistory(o, 'принят');
      await writeAll(list);
      return o;
    },
    async cancel(id, reason=''){
      const list = await readAll();
      const i = list.findIndex(o=>String(o.id)===String(id));
      if (i===-1) return null;
      const o = list[i];
      if (o.status!=='новый') return null;
      o.canceled = true;
      o.cancelReason = String(reason || '').trim();
      o.canceledAt = Date.now();
      o.accepted = false;
      o.status = 'отменён';
      writeHistory(o, 'отменён', { comment:o.cancelReason });
      await writeAll(list);
      return o;
    },
    async status(id, status){
      const VALID = [
        'новый','принят','собирается в китае','вылетел в узб',
        'на таможне','на почте','забран с почты','выдан','отменён'
      ];
      if (!VALID.includes(status)) return null;
      const list = await readAll();
      const i = list.findIndex(o=>String(o.id)===String(id));
      if (i===-1) return null;
      const o = list[i];
      if (o.status==='новый') return null;
      if (o.status==='отменён' || o.canceled) return null;
      o.status = status;
      if (!o.accepted && status!=='отменён') o.accepted = true;
      if (status==='выдан') o.completedAt = Date.now();
      writeHistory(o, status);
      await writeAll(list);
      return o;
    }
  };
}

/* ---------------- Telegram admin notify (server-side, multi-admin) ---------------- */
async function notifyAdminNewOrder(id, order){
  const token = process.env.TG_BOT_TOKEN;
  const adminIds = String(process.env.ADMIN_CHAT_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!token || adminIds.length === 0) return;

  const webappUrl = process.env.WEBAPP_URL || '';
  const title = order?.cart?.[0]?.title || order?.title || 'товар';
  const extra = Math.max(0, (order?.cart?.length || 0) - 1);
  const caption = extra>0 ? `${title} + ещё ${extra}` : title;
  const link = webappUrl ? `${webappUrl}#/admin` : undefined;

  // ✅ показываем короткий номер, если есть
  const displayId = String(order?.shortId || id);

  const text = [
    `🆕 Новый заказ`,
    `#${displayId}`,
    caption ? `• ${caption}` : '',
    order?.username ? `• @${order.username}` : '',
    `• Сумма: ${Number(order?.total||0)} ${order?.currency|| 'UZS'}`
  ].filter(Boolean).join('\n');

  const payloadBase = {
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(link ? { reply_markup: { inline_keyboard: [[{ text:'Открыть админку', web_app:{ url: link } }]] } } : {})
  };

  try{
    const results = await Promise.allSettled(
      adminIds.map(chat_id =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ chat_id, ...payloadBase })
        })
        .then(r => r.json())
      )
    );
    const allFailed = results.every(r => r.status === 'rejected' || (r.value && r.value.ok === false));
    if (allFailed) console.error('[orders] telegram notify failed for all admins:', results);
  }catch(e){
    console.error('[orders] telegram notify error:', e);
  }
}

/* ---------------- helpers ---------------- */
function ok(json, headers){ return { statusCode:200, body: JSON.stringify({ ok:true, ...json }), ...headers }; }
function bad(msg, headers){ return { statusCode:400, body: JSON.stringify({ ok:false, error: msg }), ...headers }; }
function svcUnavailable(headers, msg='service unavailable'){
  return { statusCode: 503, body: JSON.stringify({ ok:false, error: msg }), ...headers };
}

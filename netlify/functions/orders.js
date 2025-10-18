// netlify/functions/orders.js
// Централизованное хранилище заказов (Netlify Blobs) + операции админа
// ENV: TG_BOT_TOKEN, ADMIN_CHAT_ID, WEBAPP_URL, ALLOWED_ORIGINS (опц.)

function parseAllowed() {
  const raw = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return raw;
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

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const { headers, isAllowed } = buildCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, ...headers };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed', ...headers };
  }

  if (!isAllowed) {
    return { statusCode: 403, body: 'Forbidden by CORS', ...headers };
  }

  try {
    const store = await getStore();

    if (event.httpMethod === 'GET') {
      const op = (event.queryStringParameters?.op || 'list').toLowerCase();
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
      // уведомим админа о новом заказе (серверная отправка — без CORS)
      try { await notifyAdminNewOrder(id, body.order); } catch {}
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
      return ok({ ok: !!o, order: o || null }, headers);
    }

    if (op === 'status') {
      const id = String(body.id || '');
      const status = String(body.status || '');
      const o = await store.status(id, status);
      return ok({ ok: !!o, order: o || null }, headers);
    }

    return bad('unknown op', headers);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }), ...headers };
  }
}

/* ---------------- Storage (Netlify Blobs) ---------------- */
async function getStore(){
  const { blobs } = await import('@netlify/blobs');
  const bucket = blobs?.kvStorage ? blobs.kvStorage('orders') : null;
  if (!bucket) throw new Error('Netlify Blobs is not available');

  const KEY_ALL = 'orders_all';

  async function readAll(){
    try{
      const raw = await bucket.get(KEY_ALL, { type:'json' });
      return Array.isArray(raw) ? raw : [];
    }catch{ return []; }
  }
  async function writeAll(list){
    await bucket.set(KEY_ALL, list, { type:'json' });
  }

  function writeHistory(order, status, extra = {}){
    const rec = { ts: Date.now(), status, ...extra };
    order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
  }

  return {
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
      const id = order.id ?? String(Date.now());
      const now = Date.now();
      const initialStatus = order.status ?? 'новый';
      const next = {
        id,
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

/* ---------------- Telegram admin notify (server-side) ---------------- */
async function notifyAdminNewOrder(id, order){
  const token = process.env.TG_BOT_TOKEN;
  const admin = process.env.ADMIN_CHAT_ID;
  if (!token || !admin) return; // аккуратно выходим, если не настроено

  const webappUrl = process.env.WEBAPP_URL || '';
  const title = order?.cart?.[0]?.title || order?.title || 'товар';
  const extra = Math.max(0, (order?.cart?.length || 0) - 1);
  const caption = extra>0 ? `${title} + ещё ${extra}` : title;
  const link = webappUrl ? `${webappUrl}#/admin` : undefined;

  const text = [
    `🆕 Новый заказ`,
    `#${id}`,
    caption ? `• ${caption}` : '',
    order?.username ? `• @${order.username}` : '',
    `• Сумма: ${Number(order?.total||0)} ${order?.currency||'UZS'}`
  ].filter(Boolean).join('\n');

  const payload = {
    chat_id: admin,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(link ? { reply_markup: { inline_keyboard: [[{ text:'Открыть админку', web_app:{ url: link } }]] } } : {})
  };

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
}

/* ---------------- helpers ---------------- */
function ok(json, headers){ return { statusCode:200, body: JSON.stringify({ ok:true, ...json }), ...headers }; }
function bad(msg, headers){ return { statusCode:400, body: JSON.stringify({ ok:false, error: msg }), ...headers }; }

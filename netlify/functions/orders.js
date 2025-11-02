// netlify/functions/orders.js
// Хранилище заказов + уведомления + связка с лояльностью.
// ENV: TG_BOT_TOKEN, ALT_TG_BOT_TOKENS, ADMIN_CHAT_ID, WEBAPP_URL, ADMIN_API_TOKEN,
//      ALLOWED_ORIGINS, ALLOW_MEMORY_FALLBACK, NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN

import crypto from 'node:crypto';

const IS_PROD =
  (process.env.CONTEXT === 'production') ||
  (process.env.NODE_ENV === 'production');

const ALLOW_MEMORY_FALLBACK = String(process.env.ALLOW_MEMORY_FALLBACK || '').trim() === '1';
const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';

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
    } catch {
      return false;
    }
  }
  return origin === rule;
}
function buildCorsHeaders(origin, isInternal = false) {
  const allowed = parseAllowed();
  const isAllowed =
    isInternal ||
    !allowed.length ||
    !origin ||
    isTelegramOrigin(origin) ||
    allowed.some(rule => originMatches(origin, rule));

  const allowOrigin = isAllowed ? (origin || '*') : 'null';
  return {
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Internal-Auth, X-Tg-Init-Data, X-Bot-Username',
      'Access-Control-Max-Age': '86400',
      'Content-Type': 'application/json; charset=utf-8',
      'Vary': 'Origin',
    },
    isAllowed,
  };
}

/* ---------- Telegram initData валидация ---------- */
function normalizeInitRaw(raw) {
  let s = String(raw || '');
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  s = s.replace(/\r?\n/g, '&');
  return s.trim();
}
function splitRawPairs(raw) {
  return String(raw||'')
    .split(/[&\n]/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => {
      const i = x.indexOf('=');
      return i === -1 ? [x, ''] : [x.slice(0,i), x.slice(i+1)];
    });
}
function timingEqHex(aHex, bHex) {
  try {
    const a = Buffer.from(String(aHex||''), 'hex');
    const b = Buffer.from(String(bHex||''), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function calcFromDcs(tokenStr, dataCheckString) {
  const secretWebApp = crypto.createHmac('sha256', 'WebAppData').update(tokenStr).digest();
  const calcWebApp   = crypto.createHmac('sha256', secretWebApp).update(dataCheckString).digest('hex');
  const secretLogin  = crypto.createHash('sha256').update(tokenStr).digest();
  const calcLogin    = crypto.createHmac('sha256', secretLogin).update(dataCheckString).digest('hex');
  return { calcWebApp, calcLogin };
}
function parseAndCalc(tokenStr, raw) {
  const usp = new URLSearchParams(raw);
  let hash = usp.get('hash') || usp.get('signature') || '';
  const pairs = [];
  for (const [k,v] of usp.entries()) if (k !== 'hash' && k !== 'signature') pairs.push(`${k}=${v}`);
  pairs.sort();
  const dcsDecoded = pairs.join('\n');

  const rawPairs = splitRawPairs(raw).filter(([k]) => k!=='hash' && k!=='signature');
  rawPairs.sort((a,b)=> a[0]<b[0]? -1 : a[0]>b[0]? 1 : 0);
  const dcsRaw = rawPairs.map(([k,v]) => `${k}=${v}`).join('\n');

  const A = calcFromDcs(tokenStr, dcsDecoded);
  const B = calcFromDcs(tokenStr, dcsRaw);

  const ok =
    (hash && (timingEqHex(A.calcWebApp, hash) || timingEqHex(A.calcLogin, hash))) ||
    (hash && (timingEqHex(B.calcWebApp, hash) || timingEqHex(B.calcLogin, hash)));

  return { ok };
}
function getBotTokens(){
  const primary = (process.env.TG_BOT_TOKEN||'').trim();
  const extra = String(process.env.ALT_TG_BOT_TOKENS||'')
    .split(',').map(s=>s.trim()).filter(Boolean);
  return [primary, ...extra].filter(Boolean);
}
function verifyTgInitData(rawInit) {
  const tokens = getBotTokens();
  if (!tokens.length) return null;
  const rawBase = normalizeInitRaw(rawInit);
  for (const token of tokens) {
    let r = parseAndCalc(token, rawBase);
    if (!r.ok) {
      const fixed = rawBase.replace(/\+/g, '%20');
      if (fixed !== rawBase) {
        const r2 = parseAndCalc(token, fixed);
        if (r2.ok) r = r2;
      }
    }
    if (r.ok) {
      const usp = new URLSearchParams(rawBase);
      let u = null;
      try { u = JSON.parse(usp.get('user') || ''); } catch {}
      if (u && u.id) return String(u.id);
      return null;
    }
  }
  return null;
}

/* ---------- internal calls ---------- */
function baseUrl(){
  return (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/,'');
}
async function callLoyalty(op, payload){
  const base = baseUrl();
  if (!base) throw new Error('no base URL for loyalty');
  const url = `${base}/.netlify/functions/loyalty`;
  const r = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Origin': base,
      'X-Internal-Auth': process.env.ADMIN_API_TOKEN || ''
    },
    body: JSON.stringify({ op, ...payload })
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.reason || 'loyalty error');
  return j;
}
async function callNotify(payload){
  const base = baseUrl(); if (!base) return;
  await fetch(`${base}/.netlify/functions/notify`, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Internal-Auth': process.env.ADMIN_API_TOKEN || ''
    },
    body: JSON.stringify(payload)
  }).catch(()=>{});
}

/* ---------- App notifications (внутренние) ---------- */
async function appNotif(uid, notif) {
  try {
    const base = baseUrl(); if (!base) return;
    await fetch(`${base}/.netlify/functions/notifs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Auth': process.env.ADMIN_API_TOKEN || ''
      },
      body: JSON.stringify({ op: 'add', uid: String(uid), notif })
    });
  } catch {}
}
function makeDisplayId(orderId, shortId){
  const s = (shortId||'').toString().trim();
  if (s) return s.toUpperCase();
  const full = (orderId||'').toString().trim();
  if (!full) return '';
  return full.slice(-6).toUpperCase();
}

/* ---------- helpers: light order ---------- */
function lightOrder(o){
  if (!o || typeof o !== 'object') return o;
  const { paymentScreenshot, ...rest } = o;
  return {
    ...rest,
    hasPaymentScreenshot: !!paymentScreenshot,
    paymentScreenshotSize: paymentScreenshot ? paymentScreenshot.length : 0
  };
}

/* ---------------- Netlify Function ---------------- */
export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const isInternal = (event.headers?.['x-internal-auth'] || event.headers?.['X-Internal-Auth'] || '') === (process.env.ADMIN_API_TOKEN || '');
  const { headers, isAllowed } = buildCorsHeaders(origin, isInternal);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }
  if (!isAllowed) {
    return { statusCode: 403, headers, body: 'Forbidden by CORS' };
  }

  let store;
  let storeKind = 'blobs';
  try {
    store = await getStoreSafe();
    storeKind = store.__kind || 'blobs';
  } catch (e) {
    console.error('[orders] store init failed:', e?.message || e);
    return svcUnavailable(headers, 'persistent store unavailable');
  }

  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      const op = (q.op || 'list').toLowerCase();

      if (op === 'health') {
        const count = await store.count().catch(()=>null);
        return ok({ health: { store: storeKind, count } }, headers);
      }

      if (op === 'list') {
        // Лёгкая выдача по умолчанию: paymentScreenshot не отдаём
        const light = String(q.light ?? '1') === '1';
        const limitNum = Math.max(1, Math.min( Number(q.limit || 500) || 500, 1000 ));

        const itemsAll = await store.list();
        const items = itemsAll.slice(0, limitNum);
        const out = light ? items.map(lightOrder) : items;

        return ok({ orders: out, meta:{ store: storeKind, light: !!light, total: itemsAll.length, limit: limitNum } }, headers);
      }
      if (op === 'get' && q.id) {
        const o = await store.get(String(q.id));
        return ok({ order: o || null }, headers);
      }
      return bad('unknown op', headers);
    }

    const body = JSON.parse(event.body || '{}') || {};
    const op = String(body.op || '').toLowerCase();

    if (op === 'add') {
      // === uid только из Telegram initData ===
      const rawInit = event.headers?.['x-tg-init-data'] || event.headers?.['X-Tg-Init-Data'] || '';
      const uidFromInit = verifyTgInitData(rawInit);
      const orderIn = body.order || {};
      const withUid = { ...orderIn, userId: orderIn.userId || uidFromInit || null };

      if (!withUid.userId) {
        return bad('uid required (open inside Telegram)', headers);
      }

      const id = await store.add(withUid);

      // ——— уведомления
      try { await notifyAdminNewOrder(id, withUid); } catch (e) { console.error('[orders] notifyAdminNewOrder error:', e); }

      try{
        await callNotify({
          chat_id: String(withUid.userId),
          type: 'orderPlaced',
          orderId: String(id),
          shortId: withUid.shortId || withUid.code || null,
          title: withUid?.cart?.[0]?.title || withUid?.title || ''
        });
        const disp = makeDisplayId(id, withUid?.shortId || withUid?.code);
        await appNotif(withUid.userId, { icon:'package', title:`Оформлен заказ #${disp}`, sub:'Мы начали обработку', ts: Date.now(), read:false });
      }catch(e){ console.warn('[orders] notify orderPlaced failed:', e?.message||e); }

      // ——— Лояльность
      try {
        const cartTotal =
          Array.isArray(withUid?.cart)
            ? withUid.cart.reduce((s,x)=> s + (Number(x.price||0) * (Number(x.qty||0)||1)), 0)
            : Number(withUid?.total||0);

        // Передаём на бэк срез корзины, достаточный для расчёта продуктового x2
        await callLoyalty('accrue', {
          uid: String(withUid.userId),
          orderId: String(id),
          total: cartTotal,
          currency: String(withUid?.currency || 'UZS'),
          shortId: withUid?.shortId || null,
          items: Array.isArray(withUid?.cart)
            ? withUid.cart.map(r => ({
                price: Number(r?.price || 0),
                qty:   Number(r?.qty   || 0),
               x2:    !!r?.x2
              }))
            : []
       });
      } catch (e) {
        console.warn('[orders] loyalty.accrue failed:', e?.message||e);
      }

      return ok({ id }, headers);
    }

    if (['accept','cancel','status'].includes(op) && !isInternal) {
      return bad('forbidden', headers);
    }

    if (op === 'accept') {
      const id = String(body.id || '');
      const o = await store.accept(id);
      try{
        if (o?.userId) {
          await callNotify({
            chat_id: String(o.userId),
            type: 'orderAccepted',
            orderId: String(o.id),
            shortId: o.shortId || null,
            title: o?.cart?.[0]?.title || o?.title || ''
          });
          const disp = makeDisplayId(o.id, o.shortId);
          await appNotif(o.userId, { icon:'check-circle', title:`Заказ #${disp} подтверждён`, sub:'Мы начали сборку', ts: Date.now(), read:false });
        }
      }catch(e){ console.warn('[orders] notify orderAccepted failed:', e?.message||e); }
      return ok({ ok: !!o, order: o ? lightOrder(o) : null }, headers);
    }

    if (op === 'cancel') {
      const id = String(body.id || '');
      const reason = String(body.reason || '');
      const o = await store.cancel(id, reason);

      if (o && o.userId) {
        try { await callLoyalty('finalizeredeem', { uid: String(o.userId), orderId: String(o.id), action: 'cancel' }); } catch(e){ console.warn('[orders] loyalty.finalizeredeem(cancel) failed:', e?.message||e); }
        try { await callLoyalty('voidaccrual', { uid: String(o.userId), orderId: String(o.id) }); } catch(e){ console.warn('[orders] loyalty.voidaccrual failed:', e?.message||e); }
        try {
          await callNotify({
            chat_id: String(o.userId),
            type: 'orderCanceled',
            orderId: String(o.id),
            shortId: o.shortId || null,
            title: o?.cart?.[0]?.title || o?.title || ''
          });
          const disp = makeDisplayId(o.id, o.shortId);
          await appNotif(o.userId, { icon:'x-circle', title:`Заказ #${disp} отменён`, sub: reason ? `Причина: ${reason}` : 'Отменён', ts: Date.now(), read:false });
        } catch(e){ console.warn('[orders] notify orderCanceled failed:', e?.message||e); }
      }

      return ok({ ok: !!o, order: o ? lightOrder(o) : null }, headers);
    }

    if (op === 'status') {
      const id = String(body.id || '');
      const status = String(body.status || '');
      const o = await store.status(id, status);

      if (o && o.userId) {
        if (status === 'выдан') {
          try {
            await callLoyalty('confirmaccrual', { uid: String(o.userId), orderId: String(o.id) });
            try { await store.markAccrualConfirmed(String(o.id)); } catch {}
          } catch (e) {
            console.warn('[orders] loyalty.confirmaccrual failed:', e?.message || e);
          }
        }
        if (status === 'отменён') {
          try { await callLoyalty('finalizeredeem', { uid: String(o.userId), orderId: String(o.id), action: 'cancel' }); } catch(e){ console.warn('[orders] loyalty.finalizeredeem(cancel) failed (status):', e?.message||e); }
          try { await callLoyalty('voidaccrual', { uid: String(o.userId), orderId: String(o.id) }); } catch(e){ console.warn('[orders] loyalty.voidaccrual failed (status):', e?.message||e); }
        }

        try {
          await callNotify({
            chat_id: String(o.userId),
            type: 'statusChanged',
            status,
            orderId: String(o.id),
            shortId: o.shortId || null,
            title: o?.cart?.[0]?.title || o?.title || ''
          });
          const disp = makeDisplayId(o.id, o.shortId);
          await appNotif(o.userId, { icon:'bell', title:`Статус заказа #${disp} обновлён`, sub:`Текущий статус: ${status}`, ts: Date.now(), read:false });
        } catch(e){ console.warn('[orders] notify statusChanged failed:', e?.message||e); }
      }

      return ok({ ok: !!o, order: o ? lightOrder(o) : null }, headers);
    }

    return bad('unknown op', headers);
  } catch (e) {
    console.error('[orders] handler op error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error: String(e?.message||e) }) };
  }
}

/* ---------------- Storage (Blobs v7) ---------------- */
async function getStoreSafe(){
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = (SITE_ID && TOKEN)
      ? getStore({ name: 'orders', siteID: SITE_ID, token: TOKEN })
      : getStore('orders');

    const healthKey = '__health__';
    await store.setJSON(healthKey, { ts: Date.now() });
    await store.get(healthKey, { type: 'json', consistency: 'strong' });

    return makeBlobsStore(store);
  } catch (e) {
    console.warn('[orders] Netlify Blobs not available:', e?.message || e);
    if (!ALLOW_MEMORY_FALLBACK || IS_PROD) {
      throw new Error('Persistent store unavailable');
    }
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

/* ---------------- Store core ---------------- */
function makeStoreCore(readAll, writeAll){
  function writeHistory(order, status, extra = {}) {
    const rec = { ts: Date.now(), status, ...extra };
    order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
  }
  return {
    async count(){ const arr = await readAll(); return Array.isArray(arr) ? arr.length : null; },
    async list(){ const arr = await readAll(); arr.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)); return arr; },
    async get(id){ const list = await readAll(); return list.find(o=>String(o.id)===String(id)) || null; },
    async add(order){
      const list = await readAll();
      const shortId = order.shortId ?? order.code ?? null;
      const id = order.id ?? String(Date.now());
      const now = Date.now();
      const initialStatus = order.status ?? 'новый';
      const next = {
        id,
        shortId,
        userId: order.userId ?? null,
        username: order.username ?? '',
        chatId: order.chatId ?? null,
        productId: order.productId ?? null,
        size: order.size ?? null,
        color: order.color ?? null,
        link: order.link ?? (order.productId ? `#/product/${order.productId}` : ''),
        cart: Array.isArray(order.cart) ? order.cart : [],
        total: Number(order.total || 0),
        address: typeof order.address === 'string' ? order.address : (order.address?.address || ''),
        phone: order.phone ?? '',
        payerFullName: order.payerFullName ?? '',
        paymentScreenshot: order.paymentScreenshot ?? '', // остаётся в хранилище, но не отдаётся в list
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
      if (o.canceled || o.status === 'отменён' || o.status === 'выдан') return null;
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
      if (o.status==='отменён' || o.canceled) return null;
      if (o.status==='новый' && status !== 'принят') return null;
      o.status = status;
      if (!o.accepted && status!=='отменён') o.accepted = true;
      if (status==='выдан') o.completedAt = Date.now();
      writeHistory(o, status);
      await writeAll(list);
      return o;
    }
  };
}

/* ---------------- Telegram admin notify ---------------- */
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
    await Promise.allSettled(
      adminIds.map(chat_id =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ chat_id, ...payloadBase })
        })
      )
    );
  }catch(e){
    console.error('[orders] telegram notify error:', e);
  }
}

/* ---------------- helpers ---------------- */
function ok(json, headers){ return { statusCode:200, headers, body: JSON.stringify({ ok:true, ...json }) }; }
function bad(msg, headers){ return { statusCode:400, headers, body: JSON.stringify({ ok:false, error: msg }) }; }
function svcUnavailable(headers, msg='service unavailable'){ return { statusCode: 503, headers, body: JSON.stringify({ ok:false, error: msg }) }; }

// netlify/functions/user-sync.js
// Принимает снапшот пользователя с фронта и сохраняет его в Netlify Blobs.
// Храним: uid, chatId, tz, cart[], favorites[], а также служебные метки
// lastCartReminderDay / lastFavReminderTs для анти-спама рассылки.

import { getStore } from '@netlify/blobs';

/* ---------------- CORS (совместимо с остальными функциями) ---------------- */
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    },
    isAllowed,
  };
}

/* ---------------- helpers ---------------- */
function ok(json, headers){ return { statusCode:200, body: JSON.stringify({ ok:true, ...json }), ...headers }; }
function bad(msg, headers){ return { statusCode:400, body: JSON.stringify({ ok:false, error: msg }), ...headers }; }

/* ---------------- handler ---------------- */
export async function handler(event){
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const { headers, isAllowed } = buildCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, ...headers };
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed', ...headers };
  if (!isAllowed) return { statusCode:403, body:'Forbidden by CORS', ...headers };

  try{
    const body = JSON.parse(event.body || '{}') || {};
    const uid = String(body.uid || '').trim();
    const chatId = String(body.chatId || '').trim(); // Telegram user id
    if (!uid || !chatId) return bad('uid and chatId required', headers);

    const tz = body.tz || 'Asia/Tashkent';
    const cart = Array.isArray(body.cart) ? body.cart.map(x => ({
      id: x.id ?? x.productId ?? null,
      qty: Number(x.qty || 1),
      title: String(x.title || x.name || 'товар'),
      price: Number(x.price || 0),
    })) : [];

    const favorites = Array.isArray(body.favorites) ? body.favorites.slice() : [];

    const store = getStore('users');
    const key = `user__${uid}`;

    const prev = await store.get(key, { type:'json', consistency:'strong' }).catch(()=>null) || {};
    const next = {
      uid,
      chatId,
      tz,
      cart,
      favorites,
      lastCartReminderDay: prev.lastCartReminderDay || null,
      lastFavReminderTs: Number(prev.lastFavReminderTs || 0),
      updatedAt: Date.now(),
    };

    await store.setJSON(key, next);
    return ok({ saved:true }, headers);
  }catch(e){
    return { statusCode:500, body: JSON.stringify({ ok:false, error:String(e) }), ...headers };
  }
}

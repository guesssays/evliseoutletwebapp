// netlify/functions/user-sync.js
// Принимает снапшот пользователя с фронта и сохраняет его в Netlify Blobs.
// Храним: uid, chatId, tz, cart[], favorites[], а также служебные метки
// lastCartReminderDay / lastFavReminderTs для анти-спама рассылки.
//
// ENV (на сайте):
//   NETLIFY_BLOBS_SITE_ID   — Project (Site) ID из Netlify
//   NETLIFY_BLOBS_TOKEN     — Personal Access Token (scope: Blobs)
//   ALLOWED_ORIGINS         — (опц.) список разрешённых origin'ов, через запятую

import { getStore } from '@netlify/blobs';

/* ---------------- Blobs config ---------------- */
const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';

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
function bad(msg, headers, code=400){ return { statusCode:code, body: JSON.stringify({ ok:false, error: msg }), ...headers }; }

/* ---------------- handler ---------------- */
export async function handler(event){
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const { headers, isAllowed } = buildCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, ...headers };
  if (event.httpMethod !== 'POST')   return { statusCode:405, body:'Method Not Allowed', ...headers };
  if (!isAllowed)                    return { statusCode:403, body:'Forbidden by CORS', ...headers };

  // Проверка конфигурации Blobs
  if (!SITE_ID || !TOKEN) {
    return bad('NETLIFY_BLOBS_SITE_ID or NETLIFY_BLOBS_TOKEN is missing', headers, 500);
  }

  try{
    const body = JSON.parse(event.body || '{}') || {};
    const uidRaw = body.uid;
    const chatIdRaw = body.chatId;

    const uid = String(uidRaw || '').trim();
    const chatId = String(chatIdRaw || '').trim(); // Telegram user id

    if (!uid || !chatId) {
      return bad('uid and chatId required', headers, 422);
    }
    // Рассылки шлют только на цифровые chat_id — сохраним валидные
    if (!/^\d+$/.test(chatId)) {
      return bad('chatId must be digits', headers, 422);
    }

    const tz = String(body.tz || 'Asia/Tashkent');

    // Нормализация корзины
    const cart = Array.isArray(body.cart)
      ? body.cart.map(x => ({
          id   : x?.id ?? x?.productId ?? null,
          qty  : Number(x?.qty || 1),
          title: String(x?.title || x?.name || 'товар'),
          price: Number(x?.price || 0),
        }))
        // фильтр явно пустых
        .filter(i => i.id != null)
      : [];

    // Нормализация избранного (массив id)
    const favorites = Array.isArray(body.favorites)
      ? body.favorites
          .map(v => (v?.id ?? v))         // допускаем объекты {id:...}
          .map(String)
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    // Хранилище 'users' — явная конфигурация (важно!)
    const store = getStore({
      name: 'users',
      siteID: SITE_ID,
      token : TOKEN,
    });

    const key = `user__${uid}`;

    // Читаем прошлые метки для антидублей
    const prev = await store.get(key, { type:'json', consistency:'strong' }).catch(()=>null) || {};
    const next = {
      uid,
      chatId,     // нужен рассылкам
      tz,
      cart,
      favorites,
      lastCartReminderDay: prev.lastCartReminderDay || null,          // dayKey 'YYYY-M-D' (UTC)
      lastFavReminderTs  : Number(prev.lastFavReminderTs || 0),       // ms
      updatedAt          : Date.now(),
    };

    await store.setJSON(key, next);
    return ok({ saved:true }, headers);

  }catch(e){
    return bad(String(e?.message || e), headers, 500);
  }
}

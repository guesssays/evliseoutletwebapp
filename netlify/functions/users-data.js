// netlify/functions/users-data.js
// Источник данных для mkt-pings: GET — список пользователей,
// POST — патч меток анти-дублей. Совместимо с Netlify Functions v1 (statusCode/headers/body).

import { getStore } from '@netlify/blobs';

/* ---------- ENV ---------- */
const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/* ---------- CORS ---------- */
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
      const suf  = rule.slice(1); // ".example.com"
      return host === rule.slice(2) || host.endsWith(suf);
    } catch { return false; }
  }
  return origin === rule;
}
function buildCorsHeaders(origin) {
  const allow = !ALLOWED.length || isTelegramOrigin(origin) || ALLOWED.some(r => originMatches(origin, r));
  const allowOrigin = allow ? (origin || '*') : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

/* ---------- helpers (v1 style) ---------- */
function ok(data, headers, code = 200) {
  return {
    statusCode: code,
    headers,
    body: JSON.stringify({ ok: true, ...data })
  };
}
function bad(msg, headers, code = 400) {
  return {
    statusCode: code,
    headers,
    body: JSON.stringify({ ok: false, error: String(msg) })
  };
}

/* ---------- handler ---------- */
export async function handler(event) {
  const origin  = event.headers?.origin || event.headers?.Origin || '';
  const headers = buildCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  if (!SITE_ID || !TOKEN) {
    return bad('NETLIFY_BLOBS_SITE_ID or NETLIFY_BLOBS_TOKEN is missing', headers, 500);
  }

  // Явная авторизация к Blobs
  const store = getStore({ name: 'users', siteID: SITE_ID, token: TOKEN });

  try {
    if (event.httpMethod === 'GET') {
      const listed = await store.list({ prefix: 'user__', paginate: false }).catch(() => null);
      const blobs  = listed?.blobs || [];
      const out    = [];

      for (const b of blobs) {
        const u = await store.get(b.key, { type: 'json', consistency: 'strong' }).catch(() => null);
        if (!u) continue;
        out.push({
          uid: String(u.uid || ''),
          chatId: String(u.chatId || ''),
          cart: Array.isArray(u.cart) ? u.cart : [],
          favorites: Array.isArray(u.favorites) ? u.favorites : [],
          lastCartReminderDay: u.lastCartReminderDay ?? null,
          lastFavReminderTs  : Number(u.lastFavReminderTs || 0),
          cartVariantIdx     : Number.isInteger(u.cartVariantIdx) ? u.cartVariantIdx : 0,
          favVariantIdx      : Number.isInteger(u.favVariantIdx)  ? u.favVariantIdx  : 0,
        });
      }
      return ok({ users: out }, headers);
    }

    // POST: патч одного пользователя
    let body = {};
    try { body = JSON.parse(event.body || '{}') || {}; } catch { body = {}; }

    const uid = String(body.uid || '').trim();
    if (!uid) return bad('uid required', headers, 422);

    const key = `user__${uid}`;
    const u   = await store.get(key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (!u) return bad('user not found', headers, 404);

    const patch = {};
    if ('lastCartReminderDay' in body) patch.lastCartReminderDay = body.lastCartReminderDay ?? null;
    if ('lastFavReminderTs'   in body) patch.lastFavReminderTs   = Number(body.lastFavReminderTs || 0);
    if ('cartVariantIdx'      in body) patch.cartVariantIdx      = Number.isInteger(body.cartVariantIdx) ? body.cartVariantIdx : 0;
    if ('favVariantIdx'       in body) patch.favVariantIdx       = Number.isInteger(body.favVariantIdx)  ? body.favVariantIdx  : 0;

    const next = { ...u, ...patch, updatedAt: Date.now() };
    await store.setJSON(key, next);
    return ok({ saved: true }, headers);

  } catch (e) {
    return bad(e?.message || e, headers, 500);
  }
}

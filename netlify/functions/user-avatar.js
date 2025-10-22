// netlify/functions/user-avatar.js
// Возвращает URL актуальной аватарки пользователя Telegram для мини-аппа.
// Кеширует file_id/url в Netlify Blobs, чтобы не дергать Telegram лишний раз.
//
// GET  /.netlify/functions/user-avatar?uid=<telegram_user_id>
// RESP { ok:true, url:"https://api.telegram.org/file/bot<TOKEN>/<file_path>", file_id:"...", updated:<ts> }
//
// ENV:
//   TG_BOT_TOKEN    — токен бота (без "bot") (обяз.)
//   ALLOWED_ORIGINS — опционально: "*", точные origin, или маски "*.domain.com"

import { getStore } from '@netlify/blobs';

const TOKEN = process.env.TG_BOT_TOKEN || '';
if (!TOKEN) throw new Error('TG_BOT_TOKEN is required');

const API  = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;
const FILE = (p) => `https://api.telegram.org/file/bot${TOKEN}/${p}`;

/* -------------------- CORS helpers -------------------- */
function parseAllowed() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
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
function corsHeaders(origin) {
  const allowed = parseAllowed();
  const isAllowed = !allowed.length ||
                    isTelegramOrigin(origin) ||
                    allowed.some(rule => originMatches(origin, rule));
  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

/* -------------------- Telegram helpers -------------------- */
async function tg(method, payload) {
  const r = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j.ok === false) {
    const msg = j?.description || `${r.status} ${r.statusText}`;
    throw new Error(`Telegram ${method} failed: ${msg}`);
  }
  return j.result;
}

/* -------------------- HTTP handler (modern Netlify) -------------------- */
export default async function handler(req) {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || '';
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers });
  }

  try {
    const { searchParams } = new URL(req.url);
    const uid = String(searchParams.get('uid') || '').trim();
    if (!uid) {
      return new Response(JSON.stringify({ ok:false, error:'uid required' }), { status: 400, headers });
    }

    // ВАЖНО: используем один и тот же бакет во всём проекте или отдельный — не критично.
    // Здесь берём namespaced бакет "users".
    const store = getStore('users');
    const cacheKey = `avatar__${uid}.json`;

    // читаем кэш (json)
    const cached = await store.get(cacheKey, { type:'json' }).catch(()=>null);

    // если кэш свежий — отдадим
    const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 часов
    const now = Date.now();
    if (cached?.url && Number(cached.updated||0) + MAX_AGE_MS > now) {
      return new Response(JSON.stringify({ ok:true, url: cached.url, file_id: cached.file_id, updated: cached.updated }), { status: 200, headers });
    }

    // запросим последнее фото профиля
    const photos = await tg('getUserProfilePhotos', { user_id: Number(uid), limit: 1 });
    const hasAny = Number(photos?.total_count || 0) > 0 && Array.isArray(photos?.photos) && photos.photos[0]?.length;

    if (!hasAny) {
      // нет аватарки — положим пустую запись на 6ч
      const rec = { ok:true, url:'', file_id:'', updated: now };
      await store.set(cacheKey, JSON.stringify(rec), { contentType: 'application/json' });
      return new Response(JSON.stringify(rec), { status: 200, headers });
    }

    const sizes = photos.photos[0];
    const best = sizes[sizes.length - 1];
    const file_id = String(best?.file_id || '');

    // если file_id совпал — используем старый url
    if (cached?.file_id === file_id && cached?.url) {
      const rec = { ok:true, url: cached.url, file_id, updated: now };
      await store.set(cacheKey, JSON.stringify(rec), { contentType: 'application/json' });
      return new Response(JSON.stringify(rec), { status: 200, headers });
    }

    // получим file_path и соберём прямой URL
    const file = await tg('getFile', { file_id });
    const file_path = String(file?.file_path || '');
    const url = file_path ? FILE(file_path) : '';

    const rec = { ok:true, url, file_id, updated: now };
    await store.set(cacheKey, JSON.stringify(rec), { contentType: 'application/json' });
    return new Response(JSON.stringify(rec), { status: 200, headers });
  } catch (e) {
    const err = String(e?.message || e || 'unknown error');
    return new Response(JSON.stringify({ ok:false, error: err }), { status: 500, headers });
  }
}

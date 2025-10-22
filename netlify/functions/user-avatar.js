// netlify/functions/user-avatar.js
// Возвращает URL актуальной аватарки пользователя Telegram для мини-аппа.
// Кеширует file_id/url в Netlify Blobs, чтобы не дергать Telegram лишний раз.
//
// GET  /.netlify/functions/user-avatar?uid=<telegram_user_id>
// RESP { ok:true, url:"https://api.telegram.org/file/bot<TOKEN>/<file_path>", file_id:"...", updated: <ts> }
//
// ENV:
//   TG_BOT_TOKEN    — токен бота (без "bot") (обяз.)
//   ALLOWED_ORIGINS — опционально: "*", точные origin, или маски "*.domain.com"

import { getStore } from '@netlify/blobs';

const TOKEN = process.env.TG_BOT_TOKEN || '';
if (!TOKEN) throw new Error('TG_BOT_TOKEN is required');

const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;
const FILE = (p) => `https://api.telegram.org/file/bot${TOKEN}/${p}`;

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
  };
}

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

export async function handler(event) {
  const headers = corsHeaders(event.headers?.origin || event.headers?.Origin || '');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed', headers };
  }

  try {
    const uid = String(event.queryStringParameters?.uid || '').trim();
    if (!uid) {
      return { statusCode: 400, body: JSON.stringify({ ok:false, error:'uid required' }), headers };
    }

    const store = getStore('users'); // тот же namespace, где у вас user-снимки
    const cacheKey = `avatar__${uid}.json`;
    const cached = await store.get(cacheKey, { type:'json', consistency:'strong' }).catch(()=>null);

    // «мягкое» обновление: если есть кэш моложе N часов — отдадим его сразу
    const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 часов
    const now = Date.now();
    if (cached?.url && Number(cached.updated||0) + MAX_AGE_MS > now) {
      return { statusCode:200, body: JSON.stringify({ ok:true, url: cached.url, file_id: cached.file_id, updated: cached.updated }), headers };
    }

    // 1) узнаём последний аватар (самый большой размер первой фотки)
    const photos = await tg('getUserProfilePhotos', { user_id: Number(uid), limit: 1 });
    const photosCount = Number(photos?.total_count || 0);
    if (photosCount <= 0 || !Array.isArray(photos?.photos) || !photos.photos[0]?.length) {
      // нет аватара — запишем пустой кэш на 6ч
      const rec = { url: '', file_id: '', updated: now };
      await store.setJSON(cacheKey, rec);
      return { statusCode:200, body: JSON.stringify({ ok:true, url:'', file_id:'', updated: now }), headers };
    }

    const sizes = photos.photos[0]; // массив размеров [small..large]
    const best = sizes[sizes.length - 1];
    const file_id = String(best?.file_id || '');

    // если file_id не изменился — можно переиспользовать старый url
    if (cached?.file_id === file_id && cached?.url) {
      const rec = { url: cached.url, file_id, updated: now };
      await store.setJSON(cacheKey, rec);
      return { statusCode:200, body: JSON.stringify(rec), headers };
    }

    // 2) получаем file_path и собираем прямой URL
    const file = await tg('getFile', { file_id });
    const file_path = String(file?.file_path || '');
    const url = file_path ? FILE(file_path) : '';

    const rec = { ok:true, url, file_id, updated: now };
    await store.setJSON(cacheKey, rec);
    return { statusCode:200, body: JSON.stringify(rec), headers };
  } catch (e) {
    return { statusCode:500, body: JSON.stringify({ ok:false, error:String(e) }), headers };
  }
}

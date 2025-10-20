// netlify/functions/user-join.js
// Регистрируем нового пользователя и уведомляем админов в Telegram.
// ENV:
//   TG_BOT_TOKEN     — токен бота (без "bot" префикса)                  [обязателен]
//   ADMIN_CHAT_ID    — chat_id администратора(ов); можно через запятую  [обязателен]
//   ALLOWED_ORIGINS  — CORS: через запятую ('*', точные origin, '*.dom')
//   BLOB_BUCKET      — имя стора Blobs (по умолчанию 'appstore')

import { getStore } from '@netlify/blobs';

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
function buildCorsHeaders(origin) {
  const allowAll = parseAllowed().includes('*');
  const ok = allowAll ||
             isTelegramOrigin(origin) ||
             parseAllowed().some(rule => originMatches(origin, rule));
  return {
    'Access-Control-Allow-Origin': ok ? (allowAll ? '*' : origin || '') : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Читаем список админов из ADMIN_CHAT_ID (может быть 1 id или список через запятую).
// Для совместимости поддерживаем и старую переменную ADMIN_CHAT_IDS, но приоритет у новой.
function admins() {
  const rawEnv = (process.env.ADMIN_CHAT_ID ?? process.env.ADMIN_CHAT_IDS ?? '').toString();
  return rawEnv.split(',').map(s => s.trim()).filter(Boolean);
}

async function tgSend(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data.ok === false) {
    const err = data?.description || `${r.status} ${r.statusText}`;
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
  const ADMIN_IDS = admins();
  if (!TG_BOT_TOKEN || ADMIN_IDS.length === 0) {
    return new Response(JSON.stringify({ error: 'Server not configured: TG_BOT_TOKEN/ADMIN_CHAT_ID required' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  // ожидаем { uid, first_name, last_name?, username? }
  const uid = String(body?.uid || '').trim();
  const first = String(body?.first_name || '').trim();
  const last  = String(body?.last_name || '').trim();
  const uname = String(body?.username || '').trim();

  if (!uid || !first) {
    return new Response(JSON.stringify({ error: 'uid and first_name are required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const bucket = process.env.BLOB_BUCKET || 'appstore';
    const store = getStore(bucket);
    // Храним пользователей словарём: { [uid]: { first_name, last_name, username, ts } }
    const key = 'users.json';
    const users = (await store.getJSON(key)) || {};

    const isNew = !users[uid];
    if (isNew) {
      users[uid] = {
        first_name: first,
        last_name: last || '',
        username: uname || '',
        ts: Date.now()
      };
      await store.setJSON(key, users);
    }

    const totalUsers = Object.keys(users).length;

    if (isNew) {
      const display = [
        `<b>Новый пользователь</b>`,
        `${first}${last ? ' ' + last : ''}`,
        uname ? `( @${uname} )` : '',
        `\nID: <code>${uid}</code>`,
        `\nВсего пользователей сейчас: <b>${totalUsers}</b>`
      ].join(' ').replace(/\s+/g, ' ');

      // Рассылаем всем админам
      await Promise.allSettled(ADMIN_IDS.map(id => tgSend(TG_BOT_TOKEN, id, display)));
    }

    return new Response(JSON.stringify({ ok: true, isNew, totalUsers }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}

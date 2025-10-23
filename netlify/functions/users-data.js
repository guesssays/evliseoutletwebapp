// netlify/functions/users-data.js
// Источник данных для mkt-pings: отдаёт корзину/избранное/метки и принимает патч.
// Сейчас берём из Netlify Blobs('users'); контракт можно оставить тем же при замене на БД.

import { getStore, setStoreConfig } from '@netlify/blobs';

const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';

// Жёстко настраиваем Blobs SDK (важно сделать это ДО первого getStore)
if (SITE_ID && TOKEN) {
  setStoreConfig({ siteID: SITE_ID, token: TOKEN });
}

function ok(body, code = 200) {
  return new Response(JSON.stringify(body), {
    status: code,
    headers: { 'Content-Type': 'application/json' }
  });
}
function bad(msg, code = 400) {
  return ok({ ok: false, error: String(msg) }, code);
}

export async function handler(event) {
  try {
    // Проверим, что токены заданы — иначе SDK упадёт при первом вызове
    if (!SITE_ID || !TOKEN) {
      return bad('NETLIFY_BLOBS_SITE_ID or NETLIFY_BLOBS_TOKEN is missing', 500);
    }

    const store = getStore('users');

    if (event.httpMethod === 'GET') {
      // Вернуть лёгкий срез по всем пользователям
      const listed = await store.list({ prefix: 'user__', paginate: false }).catch(() => null);
      const blobs = listed?.blobs || [];
      const out = [];

      for (const b of blobs) {
        const u = await store.get(b.key, { type: 'json', consistency: 'strong' }).catch(() => null);
        if (!u) continue;
        // Минимально необходимое крону
        out.push({
          uid: String(u.uid || ''),
          chatId: String(u.chatId || ''),
          cart: Array.isArray(u.cart) ? u.cart : [],
          favorites: Array.isArray(u.favorites) ? u.favorites : [],
          lastCartReminderDay: u.lastCartReminderDay ?? null,
          lastFavReminderTs: Number(u.lastFavReminderTs || 0),
          cartVariantIdx: Number.isInteger(u.cartVariantIdx) ? u.cartVariantIdx : 0,
          favVariantIdx: Number.isInteger(u.favVariantIdx) ? u.favVariantIdx : 0,
        });
      }
      return ok({ ok: true, users: out });
    }

    if (event.httpMethod === 'POST') {
      // Принять патч меток для одного uid
      const body = JSON.parse(event.body || '{}') || {};
      const uid = String(body.uid || '').trim();
      if (!uid) return bad('uid required');

      const key = `user__${uid}`;
      const u = await store.get(key, { type: 'json', consistency: 'strong' }).catch(() => null);
      if (!u) return bad('user not found', 404);

      const patch = {};
      if ('lastCartReminderDay' in body) patch.lastCartReminderDay = body.lastCartReminderDay ?? null;
      if ('lastFavReminderTs'   in body) patch.lastFavReminderTs   = Number(body.lastFavReminderTs || 0);
      if ('cartVariantIdx'      in body) patch.cartVariantIdx      = Number.isInteger(body.cartVariantIdx) ? body.cartVariantIdx : 0;
      if ('favVariantIdx'       in body) patch.favVariantIdx       = Number.isInteger(body.favVariantIdx)  ? body.favVariantIdx  : 0;

      const next = { ...u, ...patch, updatedAt: Date.now() };
      await store.setJSON(key, next);
      return ok({ ok: true, saved: true });
    }

    return bad('Method Not Allowed', 405);
  } catch (e) {
    return bad(e?.message || e, 500);
  }
}

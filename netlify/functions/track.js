// netlify/functions/track.js
import { getStore } from '@netlify/blobs';

/*
 * POST { type: 'miniapp_open', startapp: 'promo_ig', uid: 123 }
 * Хранит суммарный счётчик по меткам и подневную разбивку.
 */

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const store = getStore(process.env.BLOB_BUCKET || 'appstore');

  let payload = {};
  try { payload = await req.json(); } catch {}
  const type = String(payload.type || '');
  if (type !== 'miniapp_open') return new Response('ok', { status: 200 });

  const tag = (String(payload.startapp || 'unknown').slice(0, 64) || 'unknown').trim() || 'unknown';
  const uid = payload.uid ? String(payload.uid) : null;

  const key = 'stats_miniapp_open.json';

  // читаем текущую статистику
  let stats;
  try { stats = await store.get(key, { type: 'json' }); } catch { stats = null; }
  stats = stats || { total: 0, tags: {}, byDay: {} };

  // дата UTC (день)
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // total
  stats.total++;

  // по метке
  stats.tags[tag] = (stats.tags[tag] || 0) + 1;

  // по дням
  stats.byDay[dayKey] = stats.byDay[dayKey] || { total: 0, tags: {} };
  stats.byDay[dayKey].total++;
  stats.byDay[dayKey].tags[tag] = (stats.byDay[dayKey].tags[tag] || 0) + 1;

  // (опц.) уникальные uid можно учитывать отдельным ключом, чтобы не раздувать агрегат

  await store.set(key, JSON.stringify(stats), { contentType: 'application/json' });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

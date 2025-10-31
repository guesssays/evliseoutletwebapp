// netlify/functions/mkt-pings.js
// Крон: 20:00–22:59 Asia/Tashkent (15–17 UTC).
// Берём пользователей через users-data и шлём напоминания в notify (INTERNAL).
// Фуллскрин даёт notify.js, который строит tg://resolve?domain=<bot>&startapp.

export const config = { schedule: '*/15 15-17 * * *' };

const USERS_DATA_ENDPOINT = '/.netlify/functions/users-data';
const NOTIFY_ENDPOINT     = '/.netlify/functions/notify';

/* ---------- small utils ---------- */
function dayKey(ts){
  const d = new Date(ts || Date.now());
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`; // UTC day (ВАЖНО!)
}

async function httpJSON(base, path, { method='GET', body=null, headers={} } = {}){
  const url = new URL(path, base).toString();
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type':'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok || j?.ok === false) {
    const msg = j?.error || `${r.status} ${r.statusText}`;
    throw new Error(`[${method} ${url}] ${msg}`);
  }
  return j;
}

async function postNotify(base, payload){
  // INTERNAL: notify проверяет X-Internal-Auth === ADMIN_API_TOKEN
  const token = process.env.ADMIN_API_TOKEN || '';
  const headers = token ? { 'X-Internal-Auth': token } : {};
  return httpJSON(base, NOTIFY_ENDPOINT, { method:'POST', body: payload, headers });
}
async function getUsers(base){
  const j = await httpJSON(base, USERS_DATA_ENDPOINT, { method:'GET' });
  return Array.isArray(j.users) ? j.users : [];
}
async function patchUser(base, uid, patch){
  return httpJSON(base, USERS_DATA_ENDPOINT, { method:'POST', body: { uid, ...patch } });
}

/* ---------- текстовые варианты ---------- */
const CART_VARIANTS = [
  ({title, count}) => `Ваша корзина ждёт: «${title}»${count>1?` + ещё ${count-1}`:''}. Оформим?`,
  ({title})        => `Не забыли про «${title}»? Всего пара кликов до заказа ✨`,
  ({title})        => `«${title}» всё ещё в корзине. Вернуться и завершить покупку?`,
  ({title})        => `Чуть-чуть не хватило до покупки: «${title}». Мы всё сохранили!`,
  ({title})        => `Если вы всё ещё присматриваетесь — «${title}» ждёт вас в корзине 👀`,
  ({title})        => `Напоминание: в корзине «${title}». Проверьте размер и оформляйте!`,
  ({title})        => `Готовы завершить заказ? «${title}» уже в корзине.`,
  ({title, count}) => `Корзина на месте: «${title}»${count>1?` и ещё ${count-1}`:''}. Успеем сегодня?`,
];
const FAV_VARIANTS = [
  () => `Напоминание: у вас есть товары в избранном. Проверьте наличие размеров 👀`,
  () => `В избранном лежат ваши находки. Возможно, пора оформить заказ ✨`,
  () => `Возвращайтесь к избранному — вдруг нужный размер появился в наличии?`,
  () => `Любимые товары ждут в избранном. Загляните и сравните варианты!`,
  () => `Сделаем следующий шаг? Откройте избранное и выберите подходящий размер.`,
  () => `Избранное на месте, как вы оставили. Проверьте актуальные цены и размеры.`,
];
function pickVariant(list, currentIdx){
  const len = list.length || 1;
  const idx = Number.isInteger(currentIdx) ? ((currentIdx % len)+len)%len : 0;
  const build = list[idx] || (() => '');
  const nextIdx = (idx + 1) % len;
  return { build, nextIdx };
}

/* ---------- helpers ---------- */
function ok(body, code = 200){
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
function bad(msg, code = 500){
  return ok({ ok:false, error:String(msg) }, code);
}

/* ---------- handler: добавлен подробный отчёт ---------- */
export async function handler(event){
  try{
    const base = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/, '');
    if (!base)                         return bad('no base url (process.env.URL/DEPLOY_URL)');
    if (!process.env.TG_BOT_TOKEN)     return bad('TG_BOT_TOKEN missing');
    if (!process.env.ADMIN_API_TOKEN)  console.warn('[mkt-pings] ADMIN_API_TOKEN is not set — notify INTERNAL may 403');

    // Фильтр для ручной проверки одного uid: /.netlify/functions/mkt-pings?uid=123
    const onlyUid = (() => {
      try { return new URLSearchParams(event?.queryStringParameters).get('uid'); } catch { return null; }
    })();

    const now = Date.now();
    const today = dayKey(now);
    const THREE_DAYS = 3*24*60*60*1000;

    const users = await getUsers(base);
    const results = [];

    let sent = 0, considered = 0;

    for (const u of users) {
      if (onlyUid && String(u.uid) !== String(onlyUid)) continue;

      const info = {
        uid: u.uid,
        chatId: u.chatId,
        hasCart: false,
        hasFav: false,
        didCart: false,
        didFav: false,
        skipped: [],
        errors: []
      };

      const chatId = String(u.chatId || '').trim();
      if (!/^\d+$/.test(chatId)) {
        info.skipped.push('no_chat_id');
        results.push(info);
        continue;
      }

      const cart = Array.isArray(u.cart) ? u.cart : [];
      const favs = Array.isArray(u.favorites) ? u.favorites : [];
      const hasCart = cart.length > 0;
      const hasFav  = favs.length > 0;
      info.hasCart = hasCart; info.hasFav = hasFav;

      if (!hasCart && !hasFav) {
        info.skipped.push('no_cart_and_no_fav');
        results.push(info);
        continue;
      }
      considered++;

      // Корзина: 1 раз в день (UTC)
      if (hasCart) {
        if (u.lastCartReminderDay === today) {
          info.skipped.push('cart_already_sent_today_UTC');
        } else {
          try{
            const first = cart[0];
            const title = String(first?.title || 'товар').slice(0, 140);
            const count = cart.length;

            const { build, nextIdx } = pickVariant(CART_VARIANTS, u.cartVariantIdx || 0);
            const text = build({ title, count });

            await postNotify(base, { type: 'cartReminder', chat_id: chatId, title, text });
            await patchUser(base, u.uid, { lastCartReminderDay: today, cartVariantIdx: nextIdx });

            info.didCart = true;
            sent++;
          } catch (e) {
            info.errors.push(`cart:${e?.message||e}`);
          }
        }
      }

      // Избранное: раз в 3 дня
      if (hasFav) {
        if (Number(u.lastFavReminderTs || 0) + THREE_DAYS > now) {
          info.skipped.push('fav_cooldown_active');
        } else {
          try{
            const { build, nextIdx } = pickVariant(FAV_VARIANTS, u.favVariantIdx || 0);
            const text = build({});
            await postNotify(base, { type: 'favReminder', chat_id: chatId, text });
            await patchUser(base, u.uid, { lastFavReminderTs: now, favVariantIdx: nextIdx });

            info.didFav = true;
            sent++;
          } catch (e) {
            info.errors.push(`fav:${e?.message||e}`);
          }
        }
      }

      results.push(info);
    }

    // Логи (сжатые), чтобы видеть сводку в Netlify logs
    try {
      const summary = {
        users: users.length,
        considered,
        sent,
        errs: results.reduce((n, r) => n + (r.errors.length ? 1 : 0), 0)
      };
      console.log('[mkt-pings] summary', summary);
    } catch {}

    return ok({ ok:true, users: users.length, considered, sent, results, todayUTC: today });
  } catch (e) {
    console.error('[mkt-pings] fatal', e);
    return bad(e?.message || e, 500);
  }
}

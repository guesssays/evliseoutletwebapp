// netlify/functions/mkt-pings.js
// Крон: 20:00–22:59 Asia/Tashkent (15–17 UTC), берём пользователей с сервера (users-data)
// и шлём напоминания. ВАЖНО: notify вызываем как INTERNAL с X-Internal-Auth.

export const config = { schedule: '*/15 15-17 * * *' };

const USERS_DATA_ENDPOINT = '/.netlify/functions/users-data';
const NOTIFY_ENDPOINT     = '/.netlify/functions/notify';

/* ---------- helpers ---------- */
function dayKey(ts){
  const d = new Date(ts || Date.now());
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`; // UTC
}
async function httpJSON(base, path, { method='GET', body=null, headers={} } = {}){
  const url = new URL(path, base).toString();
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type':'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || `${r.status}`);
  return j;
}
async function postNotify(base, payload){
  // 🔐 вызываем notify как INTERNAL
  const headers = {};
  const token = process.env.ADMIN_API_TOKEN || '';
  if (token) headers['X-Internal-Auth'] = token;
  return httpJSON(base, NOTIFY_ENDPOINT, { method:'POST', body: payload, headers });
}
async function getUsers(base){
  return (await httpJSON(base, USERS_DATA_ENDPOINT, { method:'GET' })).users || [];
}
async function patchUser(base, uid, patch){
  return httpJSON(base, USERS_DATA_ENDPOINT, { method:'POST', body: { uid, ...patch } });
}

/* ---------- тексты ---------- */
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
  const len = list.length;
  if (!len) return { build: () => '', nextIdx: 0 };
  const idx = Number.isInteger(currentIdx) ? ((currentIdx % len)+len)%len : 0;
  const build = list[idx];
  const nextIdx = (idx + 1) % len;
  return { build, nextIdx };
}

/* ---------- handler ---------- */
export async function handler(){
  try{
    const base = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/, '');
    if (!base) return new Response(JSON.stringify({ ok:false, error:'no base url' }), { status:500 });
    if (!process.env.TG_BOT_TOKEN) {
      return new Response(JSON.stringify({ ok:false, error:'TG_BOT_TOKEN missing' }), { status:500 });
    }

    const now = Date.now();
    const today = dayKey(now);
    const THREE_DAYS = 3*24*60*60*1000;

    const users = await getUsers(base);
    let sent = 0, considered = 0;

    for (const u of users) {
      const chatId = String(u.chatId || '').trim();
      if (!/^\d+$/.test(chatId)) continue;

      const cart = Array.isArray(u.cart) ? u.cart : [];
      const favs = Array.isArray(u.favorites) ? u.favorites : [];
      const hasCart = cart.length > 0;
      const hasFav  = favs.length > 0;
      if (!hasCart && !hasFav) continue;
      considered++;

      // Корзина: 1 раз в день (UTC)
      if (hasCart && u.lastCartReminderDay !== today) {
        const first = cart[0];
        const title = String(first?.title || 'товар').slice(0, 140);
        const count = cart.length;
        const { build, nextIdx } = pickVariant(CART_VARIANTS, u.cartVariantIdx || 0);
        const text = build({ title, count });

        await postNotify(base, { type: 'cartReminder', chat_id: chatId, title, text });
        await patchUser(base, u.uid, { lastCartReminderDay: today, cartVariantIdx: nextIdx });
        sent++;
      }

      // Избранное: раз в 3 дня
      if (hasFav && Number(u.lastFavReminderTs || 0) + THREE_DAYS <= now) {
        const { build, nextIdx } = pickVariant(FAV_VARIANTS, u.favVariantIdx || 0);
        const text = build({});
        await postNotify(base, { type: 'favReminder', chat_id: chatId, text });
        await patchUser(base, u.uid, { lastFavReminderTs: now, favVariantIdx: nextIdx });
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok:true, users: users.length, considered, sent }), { status:200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:500 });
  }
}

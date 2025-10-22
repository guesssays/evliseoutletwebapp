// netlify/functions/mkt-pings.js
// Крон-функция: по расписанию рассылает напоминания в Telegram-бот,
// используя снапшоты пользователей из Blobs и уже существующую функцию /notify.
//
// Расписание: 20:00–22:59 по Ташкенту (UTC+5) -> 15:00–17:59 UTC, каждые 15 минут.

import { getStore } from '@netlify/blobs';

const NOTIFY_ENDPOINT = '/.netlify/functions/notify';
export const config = { schedule: '*/15 15-17 * * *' };

/* Упрощённая dayKey "не чаще раза в день" (UTC норм для нашего использования) */
function dayKey(ts){
  const d = new Date(ts || Date.now());
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
}

async function postNotify(originUrl, payload){
  const url = new URL(NOTIFY_ENDPOINT, originUrl).toString();
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`notify failed: ${res.status} ${t}`);
  }
}

/* ---------------- Варианты текстов ---------------- */

// Корзина: функции-шаблоны (получают title первого товара и общее кол-во позиций)
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

// Избранное: серверу известны только id, поэтому тексты без конкретного названия
const FAV_VARIANTS = [
  () => `Напоминание: у вас есть товары в избранном. Проверьте наличие размеров 👀`,
  () => `В избранном лежат ваши находки. Возможно, пора оформить заказ ✨`,
  () => `Возвращайтесь к избранному — вдруг нужный размер появился в наличии?`,
  () => `Любимые товары ждут в избранном. Загляните и сравните варианты!`,
  () => `Сделаем следующий шаг? Откройте избранное и выберите подходящий размер.`,
  () => `Избранное на месте, как вы оставили. Проверьте актуальные цены и размеры.`,
];

/* Выбор варианта с ротацией и защитой от повтора подряд */
function pickVariant(list, currentIdx){
  const len = list.length;
  if (len === 0) return { idx: 0, build: () => '' };

  // Нормализуем индекс
  let idx = Number.isInteger(currentIdx) ? currentIdx : 0;
  idx = ((idx % len) + len) % len;

  const build = list[idx];
  const nextIdx = (idx + 1) % len;
  return { idx, nextIdx, build };
}

export async function handler(){
  try{
    const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'https://evliseoutlet.netlify.app/';
    const users = getStore('users');

    const listed = await users.list({ prefix:'user__', paginate:false }).catch(()=>null);
    const blobs = listed?.blobs || [];
    if (!blobs.length){
      return { statusCode:200, body: JSON.stringify({ ok:true, sent:0, count:0 }) };
    }

    let sent = 0;
    const now = Date.now();
    const today = dayKey(now);

    for (const entry of blobs){
      const u = await users.get(entry.key, { type:'json', consistency:'strong' }).catch(()=>null);
      if (!u || !u.chatId) continue;

      const hasCart = Array.isArray(u.cart) && u.cart.length > 0;
      const hasFav  = Array.isArray(u.favorites) && u.favorites.length > 0;

      // Корзина — не чаще 1 раза в день
      if (hasCart && u.lastCartReminderDay !== today){
        const first = u.cart[0];
        const title = String(first?.title || 'товар').slice(0,140);
        const count = u.cart.length;

        // подберём фразу
        const { build, nextIdx } = pickVariant(CART_VARIANTS, u.cartVariantIdx || 0);
        const text = build({ title, count });

        await postNotify(siteUrl, {
          type: 'cartReminder',
          chat_id: String(u.chatId),
          title, // отправим для совместимости, хотя текст уже готов
          text,
        });

        u.lastCartReminderDay = today;
        u.cartVariantIdx = nextIdx; // сдвигаем индекс для следующей отправки
        sent++;
      }

      // Избранное — раз в 3 дня
      const THREE_DAYS = 3*24*60*60*1000;
      if (hasFav && Number(u.lastFavReminderTs || 0) + THREE_DAYS <= now){
        const { build, nextIdx } = pickVariant(FAV_VARIANTS, u.favVariantIdx || 0);
        const text = build({});

        await postNotify(siteUrl, {
          type: 'favReminder',
          chat_id: String(u.chatId),
          text,
        });

        u.lastFavReminderTs = now;
        u.favVariantIdx = nextIdx;
        sent++;
      }

      await users.setJSON(entry.key, u);
    }

    return { statusCode:200, body: JSON.stringify({ ok:true, sent, count: blobs.length }) };
  }catch(e){
    return { statusCode:500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
}

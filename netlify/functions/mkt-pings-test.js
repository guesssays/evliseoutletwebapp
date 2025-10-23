// netlify/functions/mkt-pings-test.js
// Ручной пуск рассылки «как в кроне».
// ?only=uid1,uid2 — ограничить пользователями
// ?dry=1          — сухой прогон: ничего не шлёт, возвращает превью

import { getStore } from '@netlify/blobs';

const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';

const NOTIFY_ENDPOINT = '/.netlify/functions/notify';

function dayKey(ts){
  const d = new Date(ts || Date.now());
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`; // UTC
}

async function postNotify(baseUrl, payload){
  const url = new URL(NOTIFY_ENDPOINT, baseUrl).toString();
  const r = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || `${r.status}`);
  return j;
}

/* ------ тексты ------ */
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
function pickVariant(list, idx){
  const len = list.length || 1;
  const i = Number.isInteger(idx) ? ((idx % len)+len)%len : 0;
  return { build: list[i], nextIdx: (i+1)%len };
}

export async function handler(event){
  try{
    const base = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/,'');
    if (!base) return { statusCode:500, body: JSON.stringify({ ok:false, error:'no base url' }) };

    if (!SITE_ID || !TOKEN) {
      return { statusCode:500, body: JSON.stringify({ ok:false, error:'NETLIFY_BLOBS_SITE_ID or NETLIFY_BLOBS_TOKEN is missing' }) };
    }

    // Берём store с явной авторизацией
    const usersStore = getStore({ name:'users', siteID:SITE_ID, token:TOKEN });

    const qs   = event?.queryStringParameters || {};
    const dry  = String(qs.dry || '') === '1';
    const onlySet = new Set(String(qs.only || '').split(',').map(s=>s.trim()).filter(Boolean));

    const listed = await usersStore.list({ prefix:'user__', paginate:false }).catch(()=>null);
    const blobs = listed?.blobs || [];

    const now = Date.now();
    const today = dayKey(now);
    const THREE_DAYS = 3*24*60*60*1000;

    let sent = 0, considered = 0;
    const previews = [];

    for (const entry of blobs){
      const u = await usersStore.get(entry.key, { type:'json', consistency:'strong' }).catch(()=>null);
      if (!u) continue;

      if (onlySet.size && !onlySet.has(String(u.uid||''))) continue;

      const chatId = String(u?.chatId || '');
      if (!/^\d+$/.test(chatId)) continue;

      const cart = Array.isArray(u.cart) ? u.cart : [];
      const favs = Array.isArray(u.favorites) ? u.favorites : [];
      const hasCart = cart.length > 0;
      const hasFav  = favs.length > 0;
      if (!hasCart && !hasFav) continue;
      considered++;

      // КОРЗИНА — не чаще 1 раза в день
      if (hasCart && u.lastCartReminderDay !== today){
        const first = cart[0];
        const title = String(first?.title || 'товар').slice(0,140);
        const count = cart.length;
        const { build, nextIdx } = pickVariant(CART_VARIANTS, u.cartVariantIdx || 0);
        const text = build({ title, count });

        if (dry){
          previews.push({ uid:u.uid, kind:'cart', text });
        }else{
          await postNotify(base, { type:'cartReminder', chat_id: chatId, title, text });
          u.lastCartReminderDay = today;
          u.cartVariantIdx = nextIdx;
          await usersStore.setJSON(entry.key, u);
          sent++;
        }
      }

      // ИЗБРАННОЕ — раз в 3 дня
      if (hasFav && Number(u.lastFavReminderTs||0) + THREE_DAYS <= now){
        const { build, nextIdx } = pickVariant(FAV_VARIANTS, u.favVariantIdx || 0);
        const text = build({});

        if (dry){
          previews.push({ uid:u.uid, kind:'fav', text });
        }else{
          await postNotify(base, { type:'favReminder', chat_id: chatId, text });
          u.lastFavReminderTs = now;
          u.favVariantIdx = nextIdx;
          await usersStore.setJSON(entry.key, u);
          sent++;
        }
      }
    }

    return { statusCode:200, body: JSON.stringify({ ok:true, dry, considered, sent, previews }) };
  }catch(e){
    return { statusCode:500, body: JSON.stringify({ ok:false, error:String(e?.message||e) }) };
  }
}

// Ручной пуск рассылки «как в кроне», но по запросу.
// Параметры:
//   ?only=uid1,uid2  — ограничить юзерами (опц.)
//   ?dry=1           — сухой прогон: не слать в TG, а вернуть превью (опц.)

const USERS_DATA_ENDPOINT = '/.netlify/functions/users-data';
const NOTIFY_ENDPOINT     = '/.netlify/functions/notify';

function dayKey(ts){
  const d = new Date(ts || Date.now());
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
}
async function httpJSON(base, path, { method='GET', body=null } = {}){
  const url = new URL(path, base).toString();
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || `${r.status}`);
  return j;
}
async function getUsers(base){
  const j = await httpJSON(base, USERS_DATA_ENDPOINT, { method:'GET' });
  return Array.isArray(j.users) ? j.users : [];
}
async function postNotify(base, payload){
  return httpJSON(base, NOTIFY_ENDPOINT, { method:'POST', body: payload });
}

// те же варианты, что в прод-кроне
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
    if (!base)  return new Response(JSON.stringify({ ok:false, error:'no base url' }), { status:500 });

    const qs   = event?.queryStringParameters || {};
    const dry  = String(qs.dry || '') === '1';
    const onlySet = new Set(String(qs.only || '').split(',').map(s=>s.trim()).filter(Boolean));

    const now = Date.now();
    const today = dayKey(now);
    const THREE_DAYS = 3*24*60*60*1000;

    const users = await getUsers(base);
    const list  = users.filter(u => !onlySet.size || onlySet.has(String(u.uid||'')));

    let sent = 0, considered = 0;
    const previews = [];

    for (const u of list){
      const chatId = String(u?.chatId || '');
      if (!/^\d+$/.test(chatId)) continue;

      const cart = Array.isArray(u.cart) ? u.cart : [];
      const favs = Array.isArray(u.favorites) ? u.favorites : [];
      const hasCart = cart.length > 0;
      const hasFav  = favs.length > 0;
      if (!hasCart && !hasFav) continue;
      considered++;

      // корзина — не чаще 1/день
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
          // сдвигаем метки (как в проде)
          await httpJSON(base, USERS_DATA_ENDPOINT, {
            method:'POST',
            body: { uid: u.uid, lastCartReminderDay: today, cartVariantIdx: nextIdx }
          });
          sent++;
        }
      }

      // избранное — раз в 3 дня
      if (hasFav && Number(u.lastFavReminderTs||0) + THREE_DAYS <= now){
        const { build, nextIdx } = pickVariant(FAV_VARIANTS, u.favVariantIdx || 0);
        const text = build({});

        if (dry){
          Previews.push({ uid:u.uid, kind:'fav', text });
        }else{
          await postNotify(base, { type:'favReminder', chat_id: chatId, text });
          await httpJSON(base, USERS_DATA_ENDPOINT, {
            method:'POST',
            body: { uid: u.uid, lastFavReminderTs: now, favVariantIdx: nextIdx }
          });
          sent++;
        }
      }
    }

    return new Response(JSON.stringify({ ok:true, dry, users: users.length, considered, sent, previews }), { status:200 });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:500 });
  }
}

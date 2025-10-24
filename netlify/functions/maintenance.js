// netlify/functions/maintenance.js
// Одноразовая сервисная чистилка Blobs-хранилищ (orders / notifs / loyalty).
// Доступ ТОЛЬКО по X-Internal-Auth == ADMIN_API_TOKEN.

const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';

function ok(body){ return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:true, ...body }) }; }
function bad(msg){ return { statusCode:400, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:String(msg) }) }; }
function forbid(){ return { statusCode:403, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:'forbidden' }) }; }

function isInternal(event){
  const h = event.headers||{};
  const t = (h['x-internal-auth']||h['X-Internal-Auth']||'').toString().trim();
  return t && process.env.ADMIN_API_TOKEN && t===process.env.ADMIN_API_TOKEN;
}

export async function handler(event){
  if (event.httpMethod !== 'POST') return bad('use POST');
  if (!isInternal(event)) return forbid();

  const { getStore } = await import('@netlify/blobs');

  const orders = (SITE_ID && TOKEN) ? getStore({ name:'orders',  siteID:SITE_ID, token:TOKEN }) : getStore('orders');
  const notifs = (SITE_ID && TOKEN) ? getStore({ name:'notifs',  siteID:SITE_ID, token:TOKEN }) : getStore('notifs');
  const loyalty= (SITE_ID && TOKEN) ? getStore({ name:'loyalty', siteID:SITE_ID, token:TOKEN }) : getStore('loyalty');

  let action = 'purgeAll';
  try{ action = JSON.parse(event.body||'{}')?.action || 'purgeAll'; }catch{}

  if (action === 'purgeAll' || action === 'purgeOrders'){
    // orders: обнуляем хранилище
    await orders.setJSON('orders_all', []);
  }

  if (action === 'purgeAll' || action === 'purgeNotifs'){
    // notifs: собираем все ключи и обнуляем
    let cursor=null, total=0;
    do{
      const page = await notifs.list({ prefix:'notifs__', cursor });
      for (const it of (page?.blobs||[])){
        // безопаснее не delete, а обнулить содержимое
        await notifs.setJSON(it.key, []);
        total++;
      }
      cursor = page?.cursor || null;
    }while(cursor);
  }

  if (action === 'purgeAll' || action === 'purgeLoyalty'){
    // loyalty: сбрасываем БД и уничтожаем снапшоты
    const empty = { users:{}, referrals:{}, reservations:[], orders:{} };
    await loyalty.setJSON('loyalty_all', empty);

    // подчистим снапшоты (если есть)
    let cursor=null;
    do{
      const page = await loyalty.list({ prefix:'loyalty_all__snap_', cursor });
      for (const it of (page?.blobs||[])){
        // если у вашей версии SDK есть delete(), можно:
        // await loyalty.delete(it.key);
        // Иначе просто обнулим
        await loyalty.setJSON(it.key, empty);
      }
      cursor = page?.cursor || null;
    }while(cursor);
  }

  return ok({ done:true, action });
}

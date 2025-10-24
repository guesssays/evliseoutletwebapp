// netlify/functions/maintenance.js
// Сервисная чистилка Blobs (orders / notifs / loyalty).
// Доступ: по X-Internal-Auth == ADMIN_API_TOKEN ИЛИ Authorization: Bearer <ADMIN_API_TOKEN>

const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';

function J(status, obj){
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(obj),
  };
}

function bearer(auth){
  if (!auth) return '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

function readIncomingToken(h){
  if (!h) return '';
  return (
    h['x-internal-auth'] ||
    h['X-Internal-Auth'] ||
    bearer(h['authorization']) ||
    bearer(h['Authorization']) ||
    ''
  ).toString().trim();
}

function isInternal(event){
  const SECRET = process.env.ADMIN_API_TOKEN || process.env.INTERNAL_AUTH || '';
  const incoming = readIncomingToken(event.headers || {});
  return Boolean(SECRET) && incoming === SECRET;
}

// ESM-стиль для Netlify
export async function handler(event){
  const method = (event.httpMethod || '').toUpperCase();

  if (method === 'OPTIONS'){
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Internal-Auth, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (method !== 'POST') return J(405, { ok:false, error:'method_not_allowed' });

  if (!isInternal(event)){
    // безопасная диагностика — без значений токенов
    const SECRET = process.env.ADMIN_API_TOKEN || process.env.INTERNAL_AUTH || '';
    const h = event.headers || {};
    return J(403, {
      ok:false,
      error:'forbidden',
      diag: {
        hasHeaderToken: Boolean(h['x-internal-auth'] || h['authorization'] || h['X-Internal-Auth'] || h['Authorization']),
        headerTokenLen: (readIncomingToken(h) || '').length,
        hasEnvToken: Boolean(SECRET),
      },
    });
  }

  // ---- авторизовано ----
  let action = 'purgeAll';
  try { action = JSON.parse(event.body || '{}')?.action || 'purgeAll'; } catch {}

  const { getStore } = await import('@netlify/blobs');

  const orders  = (SITE_ID && TOKEN) ? getStore({ name:'orders',  siteID:SITE_ID, token:TOKEN }) : getStore('orders');
  const notifs  = (SITE_ID && TOKEN) ? getStore({ name:'notifs',  siteID:SITE_ID, token:TOKEN }) : getStore('notifs');
  const loyalty = (SITE_ID && TOKEN) ? getStore({ name:'loyalty', siteID:SITE_ID, token:TOKEN }) : getStore('loyalty');

  if (action === 'purgeAll' || action === 'purgeOrders'){
    await orders.setJSON('orders_all', []);
  }

  if (action === 'purgeAll' || action === 'purgeNotifs'){
    let cursor=null;
    do{
      const page = await notifs.list({ prefix:'notifs__', cursor });
      for (const it of (page?.blobs || [])){
        await notifs.setJSON(it.key, []);
      }
      cursor = page?.cursor || null;
    } while (cursor);
  }

  if (action === 'purgeAll' || action === 'purgeLoyalty'){
    const empty = { users:{}, referrals:{}, reservations:[], orders:{} };
    await loyalty.setJSON('loyalty_all', empty);

    let cursor=null;
    do{
      const page = await loyalty.list({ prefix:'loyalty_all__snap_', cursor });
      for (const it of (page?.blobs || [])){
        // если поддерживается delete(): await loyalty.delete(it.key); иначе обнулим
        await loyalty.setJSON(it.key, empty);
      }
      cursor = page?.cursor || null;
    } while (cursor);
  }

  return J(200, { ok:true, done:true, action });
}

// netlify/functions/notifs.js
// Хранилище уведомлений per-user.
// Чтение списка — владелец (валидный initData) ИЛИ, для совместимости с веб-клиентом, по явному uid из запроса.
// Запись/mark — либо сервер (internal-token), либо владелец (initData) и, для совместимости, markAll/mark по явному uid.
// ENV: TG_BOT_TOKEN, ADMIN_API_TOKEN, ALLOWED_ORIGINS, ALLOW_MEMORY_FALLBACK, NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN

import crypto from 'node:crypto';

/* ---------------- CORS ---------------- */
function parseAllowed(){ return (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean); }
function isTelegramOrigin(origin){ return origin==='https://t.me'||origin==='https://web.telegram.org'||origin==='https://telegram.org'; }
function originMatches(origin, rule){
  if (!rule||rule==='*') return true;
  if (!origin) return false;
  if (rule.startsWith('*.')){
    try{
      const host=new URL(origin).hostname;
      const suf=rule.slice(1);
      return host===rule.slice(2)||host.endsWith(suf);
    }catch{ return false; }
  }
  return origin===rule;
}
function buildCors(origin, isInternal=false){
  const allowed = parseAllowed();
  const allow = isInternal || !allowed.length || !origin || isTelegramOrigin(origin) || allowed.some(rule=>originMatches(origin, rule));
  return {
    headers:{
      'Access-Control-Allow-Origin': allow ? (origin||'*') : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Tg-Init-Data, X-Internal-Auth',
      'Access-Control-Max-Age': '86400',
      'Content-Type': 'application/json; charset=utf-8',
      'Vary':'Origin',
    },
    isAllowed: allow
  };
}

/* ---------------- Auth helpers ---------------- */
function getInternalAuth(event){
  const h=event.headers||{};
  return (h['x-internal-auth']||h['X-Internal-Auth']||'').toString().trim();
}
function isInternalCall(event){
  const t=getInternalAuth(event);
  return t && process.env.ADMIN_API_TOKEN && t===process.env.ADMIN_API_TOKEN;
}
function verifyTgInitData(raw){
  const token = process.env.TG_BOT_TOKEN||''; if (!token) throw new Error('TG_BOT_TOKEN not set');
  const params = new URLSearchParams(String(raw||'')); const hash=params.get('hash'); if (!hash) throw new Error('no hash');
  const pairs=[]; for (const [k,v] of params.entries()){ if (k==='hash') continue; pairs.push(`${k}=${v}`); } pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHash('sha256').update(token).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hmac !== hash) throw new Error('bad signature');
  const user = JSON.parse(params.get('user')||'{}'); if (!user?.id) throw new Error('no user');
  return { uid: String(user.id) };
}

/* ---------------- Storage (Netlify Blobs v7) ---------------- */
async function getStoreSafe(){
  const allowFallback = (process.env.ALLOW_MEMORY_FALLBACK ?? '1') !== '0';
  try {
    const { getStore } = await import('@netlify/blobs');
    const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
    const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';
    // Явно используем siteID/token, если заданы — чтобы избежать "environment not configured"
    const store = (SITE_ID && TOKEN)
      ? getStore({ name: 'notifs', siteID: SITE_ID, token: TOKEN })
      : getStore('notifs');

    // лёгкая проверка доступности
    await store.list({ prefix:'__ping__', paginate:false });
    return makeBlobsStore(store);
  } catch (e) {
    console.warn('[notifs] blobs unavailable:', e?.message||e);
    if (!allowFallback) {
      throw new Error('blobs unavailable and memory fallback disabled');
    }
    console.warn('[notifs] fallback to memory store (ALLOW_MEMORY_FALLBACK!=0)');
    return makeMemoryStore();
  }
}
function makeBlobsStore(store){
  const prefix='notifs__';
  const keyFor = uid => `${prefix}${uid}`;
  async function read(uid){ try{ const data=await store.get(keyFor(uid),{type:'json',consistency:'strong'}); return Array.isArray(data)?data:[]; }catch{ return []; } }
  async function write(uid,list){ await store.setJSON(keyFor(uid), Array.isArray(list)?list:[]); }
  return makeStoreCore(read, write, 'blobs');
}
const __mem = new Map();
function makeMemoryStore(){
  async function read(uid){ return __mem.get(uid)||[]; }
  async function write(uid,list){ __mem.set(uid, Array.isArray(list)?list.slice():[]); }
  return makeStoreCore(read, write, 'memory');
}

/* ---------------- Core per-user list ops ---------------- */
function makeStoreCore(read, write, kind){
  const MAX_ITEMS = 100;
  const normalize = (n={}) => ({
    id:String(n.id??Date.now()),
    ts:Number(n.ts??Date.now()),
    read:!!n.read,
    icon:String(n.icon||'bell'),
    title:String(n.title||''),
    sub:String(n.sub||'')
  });
  return {
    kind,
    async list(uid){ const arr=await read(uid); arr.sort((a,b)=>(b.ts||0)-(a.ts||0)); return arr; },
    async add(uid, notif){
      const arr=await read(uid);
      const one=normalize(notif);
      const nearDupIdx = arr.findIndex(x => x.title===one.title && x.sub===one.sub && Math.abs((x.ts||0)-(one.ts||0))<=3000);
      if (nearDupIdx!==-1){ arr[nearDupIdx]={...arr[nearDupIdx],...one}; await write(uid, arr); return { id:String(arr[nearDupIdx].id), items:arr }; }
      const idStr=String(one.id); const idx=arr.findIndex(x=>String(x.id)===idStr);
      if (idx===-1) arr.unshift(one); else arr[idx]={...arr[idx],...one};
      if (arr.length>MAX_ITEMS) arr.length=MAX_ITEMS;
      await write(uid, arr); return { id:idStr, items:arr };
    },
    async markAll(uid){ const arr=await read(uid); let ch=false; for (const n of arr){ if (!n.read){ n.read=true; ch=true; } } if (ch) await write(uid, arr); return arr; },
    async mark(uid, ids=[]){
      const want=new Set((ids||[]).map(String));
      if (!want.size) return await read(uid);
      const arr=await read(uid); let ch=false;
      for (const n of arr){ if (want.has(String(n.id)) && !n.read){ n.read=true; ch=true; } }
      if (ch) await write(uid, arr);
      return arr;
    },
  };
}

/* ---------------- HTTP handler ---------------- */
export async function handler(event){
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const internal = isInternalCall(event);
  const { headers, isAllowed } = buildCors(origin, internal);

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, ...headers };
  if (!['GET','POST'].includes(event.httpMethod)) return { statusCode:405, body:'Method Not Allowed', ...headers };
  if (!isAllowed) return { statusCode:403, body:'Forbidden by CORS', ...headers };

  try {
    const store = await getStoreSafe();

    if (event.httpMethod === 'GET') {
      // ① Владелец (initData), либо ② совместимость: явный uid в query
      const rawInit = event.headers?.['x-tg-init-data'] || event.headers?.['X-Tg-Init-Data'] || '';
      const op  = String(event.queryStringParameters?.op || 'list').toLowerCase();
      const uidFromQuery = String(event.queryStringParameters?.uid || '').trim();

      let uid = null;
      if (rawInit) {
        try { ({ uid } = verifyTgInitData(rawInit)); } catch (e) { /* если подпись невалидна — попробуем fallback ниже */ }
      }
      if (!uid) uid = uidFromQuery; // режим совместимости с фронтом

      if (!uid) return { statusCode:400, ...headers, body: JSON.stringify({ ok:false, error:'uid required' }) };

      if (op === 'list') {
        const items = await store.list(uid);
        return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, store:store.kind, items }) };
      }
      if (op === 'health') {
        const items = await store.list(uid);
        return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, store:store.kind, count:items.length }) };
      }
      return { statusCode:400, ...headers, body: JSON.stringify({ ok:false, error:'unknown op' }) };
    }

    // POST
    let body = {};
    try { body = JSON.parse(event.body || '{}') || {}; } catch { body = {}; }
    const op  = String(body.op || '').toLowerCase();

    // --- 1) ДЕЙСТВИЯ ОТ СЕРВЕРА (internal-token) ---
    if (internal) {
      const uid = String(body.uid || '').trim();
      if (!uid) return { statusCode:400, ...headers, body: JSON.stringify({ ok:false, error:'uid required' }) };
      if (op === 'add') {
        const { id, items } = await store.add(uid, body.notif || {});
        return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, id, items }) };
      }
      if (op === 'markall') {
        const items = await store.markAll(uid);
        return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, items }) };
      }
      if (op === 'mark') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const items = await store.mark(uid, ids);
        return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, items }) };
      }
      return { statusCode:400, ...headers, body: JSON.stringify({ ok:false, error:'unknown op' }) };
    }

    // --- 2) ДЕЙСТВИЯ ОТ ПОЛЬЗОВАТЕЛЯ ---
    // 2a. Владелец через initData: markMine/markSeen (исторический контракт)
    if (op === 'markseen' || op === 'markmine') {
      const rawInit = event.headers?.['x-tg-init-data'] || event.headers?.['X-Tg-Init-Data'] || '';
      const { uid } = verifyTgInitData(rawInit);
      const targetUidRaw = String(body.uid || '').trim();
      if (targetUidRaw && targetUidRaw !== uid) return { statusCode:403, ...headers, body: JSON.stringify({ ok:false, error:'forbidden' }) };
      const ids = Array.isArray(body.ids) ? body.ids : null;
      const items = ids?.length ? await store.mark(uid, ids) : await store.markAll(uid);
      return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, items }) };
    }

    // 2b. Совместимость с фронтендом: { op:'markAll', uid } или { op:'mark', uid, ids }
    if (op === 'markall' || op === 'markAll' || op === 'mark') {
      const uid = String(body.uid || '').trim();
      if (!uid) return { statusCode:400, ...headers, body: JSON.stringify({ ok:false, error:'uid required' }) };
      if (/^markall$/i.test(op)) {
        const items = await store.markAll(uid);
        return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, items }) };
      } else {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const items = await store.mark(uid, ids);
        return { statusCode:200, ...headers, body: JSON.stringify({ ok:true, items }) };
      }
    }

    // Публичного добавления нет (клиент при неудаче кладёт локально)
    if (op === 'add') {
      return { statusCode:403, ...headers, body: JSON.stringify({ ok:false, error:'forbidden' }) };
    }

    return { statusCode:403, ...headers, body: JSON.stringify({ ok:false, error:'forbidden' }) };
  } catch (e) {
    console.error('[notifs] handler error:', e);
    return { statusCode:500, ...headers, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
}

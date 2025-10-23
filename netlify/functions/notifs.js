// netlify/functions/notifs.js
// Хранилище уведомлений per-user. Запись/mark — только сервер (internal-token).
// Чтение списка — только владелец (валидный initData).
//
// ENV:
//   TG_BOT_TOKEN
//   ADMIN_API_TOKEN
//   ALLOWED_ORIGINS

import crypto from 'node:crypto';

/* ---------------- CORS ---------------- */
function parseAllowed(){ return (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean); }
function isTelegramOrigin(origin){ return origin==='https://t.me'||origin==='https://web.telegram.org'||origin==='https://telegram.org'; }
function originMatches(origin, rule){
  if (!rule||rule==='*') return true;
  if (!origin) return false;
  if (rule.startsWith('*.')){ try{ const host=new URL(origin).hostname; const suf=rule.slice(1); return host===rule.slice(2)||host.endsWith(suf);}catch{return false;} }
  return origin===rule;
}
function buildCorsHeaders(origin, isInternal=false){
  const allowed = parseAllowed();
  const allow = isInternal || !allowed.length || isTelegramOrigin(origin) || allowed.some(rule=>originMatches(origin, rule));
  return {
    headers: {
      'Access-Control-Allow-Origin': allow ? (origin||'*') : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Tg-Init-Data, X-Internal-Auth',
      'Vary': 'Origin',
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
  const token = process.env.TG_BOT_TOKEN||'';
  if (!token) throw new Error('TG_BOT_TOKEN not set');
  const params = new URLSearchParams(String(raw||''));
  const hash = params.get('hash'); if (!hash) throw new Error('no hash');
  const pairs=[];
  for (const [k,v] of params.entries()){ if (k==='hash') continue; pairs.push(`${k}=${v}`); }
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHash('sha256').update(token).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hmac !== hash) throw new Error('bad signature');
  const user = JSON.parse(params.get('user')||'{}');
  if (!user?.id) throw new Error('no user');
  return { uid: String(user.id) };
}

/* ---------------- Storage (Netlify Blobs v7) ---------------- */
async function getStoreSafe(){
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('notifs');
    await store.list({ prefix:'__ping__', paginate:false });
    return makeBlobsStore(store);
  } catch (e) {
    console.warn('[notifs] blobs unavailable, fallback to memory:', e?.message||e);
    return makeMemoryStore();
  }
}
function makeBlobsStore(store){
  const prefix='notifs__';
  const keyFor = uid => `${prefix}${uid}`;
  async function read(uid){ try{ const data=await store.get(keyFor(uid),{type:'json',consistency:'strong'}); return Array.isArray(data)?data:[]; }catch{ return []; } }
  async function write(uid,list){ await store.setJSON(keyFor(uid), list); }
  return makeStoreCore(read, write);
}
const __mem = new Map();
function makeMemoryStore(){ async function read(uid){ return __mem.get(uid)||[]; } async function write(uid,list){ __mem.set(uid, list.slice()); } return makeStoreCore(read, write); }

/* ---------------- Core per-user list ops ---------------- */
function makeStoreCore(read, write){
  const MAX_ITEMS = 100;
  const normalize = (n={}) => ({ id:String(n.id??Date.now()), ts:Number(n.ts??Date.now()), read:!!n.read, icon:String(n.icon||'bell'), title:String(n.title||''), sub:String(n.sub||'') });
  return {
    async list(uid){ const arr=await read(uid); arr.sort((a,b)=>(b.ts||0)-(a.ts||0)); return arr; },
    async add(uid, notif){ const arr=await read(uid); const one=normalize(notif);
      const nearDupIdx = arr.findIndex(x => x.title===one.title && x.sub===one.sub && Math.abs((x.ts||0)-(one.ts||0))<=3000);
      if (nearDupIdx!==-1){ arr[nearDupIdx]={...arr[nearDupIdx],...one}; await write(uid, arr); return { id:String(arr[nearDupIdx].id), items:arr }; }
      const idStr=String(one.id); const idx=arr.findIndex(x=>String(x.id)===idStr);
      if (idx===-1) arr.unshift(one); else arr[idx]={...arr[idx],...one};
      if (arr.length>MAX_ITEMS) arr.length=MAX_ITEMS;
      await write(uid, arr); return { id:idStr, items:arr };
    },
    async markAll(uid){ const arr=await read(uid); let ch=false; for (const n of arr){ if (!n.read){ n.read=true; ch=true; } } if (ch) await write(uid, arr); return arr; },
    async mark(uid, ids=[]){ const want=new Set((ids||[]).map(String)); if (!want.size) return await read(uid);
      const arr=await read(uid); let ch=false; for (const n of arr){ if (want.has(String(n.id)) && !n.read){ n.read=true; ch=true; } } if (ch) await write(uid, arr); return arr; },
  };
}

/* ---------------- HTTP handler ---------------- */
export async function handler(event){
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const internal = isInternalCall(event);
  const { headers } = buildCorsHeaders(origin, internal);

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, ...headers };
  if (!['GET','POST'].includes(event.httpMethod)) return { statusCode:405, body:'Method Not Allowed', ...headers };

  try {
    const store = await getStoreSafe();

    if (event.httpMethod === 'GET') {
      // только владелец (initData)
      const rawInit = event.headers?.['x-tg-init-data'] || event.headers?.['X-Tg-Init-Data'] || '';
      const { uid } = verifyTgInitData(rawInit);
      const op  = String(event.queryStringParameters?.op || 'list').toLowerCase();
      const targetUid = String(event.queryStringParameters?.uid || '').trim();
      if (!targetUid || targetUid!==uid) return { statusCode:403, body:'forbidden', ...headers };

      if (op === 'list') {
        const items = await store.list(uid);
        return { statusCode:200, body: JSON.stringify({ ok:true, items }), ...headers };
      }
      return { statusCode:400, body: JSON.stringify({ ok:false, error:'unknown op' }), ...headers };
    }

    // POST: запись/mark — только internal
    if (!internal) return { statusCode:403, body: JSON.stringify({ ok:false, error:'forbidden' }), ...headers };

    const body = JSON.parse(event.body || '{}') || {};
    const op  = String(body.op || '').toLowerCase();
    const uid = String(body.uid || '').trim();
    if (!uid) return { statusCode:400, body: JSON.stringify({ ok:false, error:'uid required' }), ...headers };

    if (op === 'add') {
      const { id, items } = await store.add(uid, body.notif || {});
      return { statusCode:200, body: JSON.stringify({ ok:true, id, items }), ...headers };
    }
    if (op === 'markall') {
      const items = await store.markAll(uid);
      return { statusCode:200, body: JSON.stringify({ ok:true, items }), ...headers };
    }
    if (op === 'mark') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const items = await store.mark(uid, ids);
      return { statusCode:200, body: JSON.stringify({ ok:true, items }), ...headers };
    }

    return { statusCode:400, body: JSON.stringify({ ok:false, error:'unknown op' }), ...headers };
  } catch (e) {
    console.error('[notifs] handler error:', e);
    return { statusCode:500, body: JSON.stringify({ ok:false, error:String(e) }), ...headers };
  }
}

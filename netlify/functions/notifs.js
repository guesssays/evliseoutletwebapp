// netlify/functions/notifs.js
// Хранилище уведомлений per-user.
// Чтение списка — владелец (валидный initData) ИЛИ, для совместимости с веб-клиентом, по явному uid из запроса.
// Запись/mark — либо сервер (internal-token), либо владелец (initData) и, для совместимости, markAll/mark по явному uid.
// ENV: TG_BOT_TOKEN, ALT_TG_BOT_TOKENS, ADMIN_API_TOKEN,
//      ALLOWED_ORIGINS, ALLOW_MEMORY_FALLBACK, NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN

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
      // добавили X-Telegram-Web-App-Init-Data
      'Access-Control-Allow-Headers': 'Content-Type, X-Tg-Init-Data, X-Telegram-Web-App-Init-Data, X-Internal-Auth',
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

/* ====== Надёжная проверка Telegram initData (WebApp + Login) ====== */
// Нормализация initData: убираем кавычки, склейка переносов в &, трим.
function normalizeInitRaw(raw) {
  let s = String(raw || '');
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  s = s.replace(/\r?\n/g, '&');
  return s.trim();
}
function splitRawPairs(raw) {
  return String(raw||'')
    .split(/[&\n]/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => {
      const i = x.indexOf('=');
      return i === -1 ? [x, ''] : [x.slice(0,i), x.slice(i+1)];
    });
}
function sigOk(aHex, bHex) {
  try {
    const a = Buffer.from(String(aHex||''), 'hex');
    const b = Buffer.from(String(bHex||''), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function _calcFromDcs(tokenStr, dataCheckString) {
  const secretWebApp = crypto.createHmac('sha256', 'WebAppData').update(tokenStr).digest();
  const calcWebApp   = crypto.createHmac('sha256', secretWebApp).update(dataCheckString).digest('hex');
  const secretLogin  = crypto.createHash('sha256').update(tokenStr).digest();
  const calcLogin    = crypto.createHmac('sha256', secretLogin).update(dataCheckString).digest('hex');
  return { calcWebApp, calcLogin };
}
function _parseAndCalc(tokenStr, raw) {
  // decoded way (как в доках)
  const urlEncoded = new URLSearchParams(raw);
  let hash = urlEncoded.get('hash') || urlEncoded.get('signature') || '';
  const pairs = [];
  for (const [k,v] of urlEncoded.entries()) if (k !== 'hash' && k !== 'signature') pairs.push(`${k}=${v}`);
  pairs.sort();
  const dcsDecoded = pairs.join('\n');

  // raw way (без декодирования, устойчиво к кейсам с '+')
  const rawPairs = splitRawPairs(raw).filter(([k]) => k!=='hash' && k!=='signature');
  rawPairs.sort((a,b)=>a[0]<b[0]? -1 : a[0]>b[0]? 1 : 0);
  const dcsRaw = rawPairs.map(([k,v]) => `${k}=${v}`).join('\n');

  const A = _calcFromDcs(tokenStr, dcsDecoded);
  const B = _calcFromDcs(tokenStr, dcsRaw);

  const ok =
    (hash && (sigOk(A.calcWebApp, hash) || sigOk(A.calcLogin, hash))) ||
    (hash && (sigOk(B.calcWebApp, hash) || sigOk(B.calcLogin, hash)));

  return { ok };
}

/** Список токенов для проверки подписи. Поддерживает:
 *   TG_BOT_TOKEN — основной токен
 *   ALT_TG_BOT_TOKENS — CSV/разделители , ; \n
 */
function getBotTokens(){
  const primary = String(process.env.TG_BOT_TOKEN||'').trim();
  const extra = String(process.env.ALT_TG_BOT_TOKENS||'')
    .split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
  const set = new Set([primary, ...extra]);
  const list = [...set].filter(Boolean);
  if (!list.length) throw new Error('TG_BOT_TOKEN not set');
  return list;
}

function verifyTgInitData(rawInitData){
  const tokens = getBotTokens();
  const rawBase = normalizeInitRaw(rawInitData);

  for (const token of tokens) {
    // (1) как есть
    let r = _parseAndCalc(token, rawBase);
    // (2) fix "+ → %20"
    if (!r.ok) {
      const fixed = rawBase.replace(/\+/g, '%20');
      if (fixed !== rawBase) {
        const r2 = _parseAndCalc(token, fixed);
        if (r2.ok) r = r2;
      }
    }
    if (r.ok) {
      const usp = new URLSearchParams(rawBase);
      let user = null; try { user = JSON.parse(usp.get('user') || ''); } catch {}
      if (!user || !user.id) throw new Error('initData user missing');
      return { uid: String(user.id) };
    }
  }
  throw new Error('initData signature invalid');
}

/* ===== Чтение initData из тела/заголовков (как в loyalty.js) ===== */
function getHeaderCaseInsensitive(event, name){
  const h = event.headers || {};
  const k = Object.keys(h).find(x => x.toLowerCase() === name.toLowerCase());
  return k ? h[k] : '';
}
function readInitDataSource(event, body){
  // 1) приоритет — тело (raw)
  if (body && typeof body.initData === 'string' && body.initData) {
    return { raw: body.initData, src: 'body.initData' };
  }
  // поддержка base64: initDataB64 / initData64
  let b64 = '';
  if (body && typeof body.initDataB64 === 'string' && body.initDataB64) b64 = body.initDataB64;
  else if (body && typeof body.initData64 === 'string' && body.initData64) b64 = body.initData64;
  if (b64) {
    try { return { raw: Buffer.from(b64, 'base64').toString('utf8'), src: 'body.initData(b64)' }; } catch {}
  }
  // 2) заголовки: X-Tg-Init-Data или X-Telegram-Web-App-Init-Data
  const hdr =
    getHeaderCaseInsensitive(event,'X-Tg-Init-Data') ||
    getHeaderCaseInsensitive(event,'X-Telegram-Web-App-Init-Data') ||
    '';
  return { raw: String(hdr).replace(/[\r\n]+/g,'&'), src:'header' };
}

/* ---------------- Storage (Netlify Blobs v7) ---------------- */
async function getStoreSafe(){
  const allowFallback = (process.env.ALLOW_MEMORY_FALLBACK ?? '1') !== '0';
  try {
    const { getStore } = await import('@netlify/blobs');
    const SITE_ID = process.env.NETLIFY_BLOBS_SITE_ID || '';
    const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN   || '';
    const store = (SITE_ID && TOKEN)
      ? getStore({ name: 'notifs', siteID: SITE_ID, token: TOKEN })
      : getStore('notifs');

    // лёгкая проверка доступности
    await store.list({ prefix:'__ping__', paginate:false });
    return makeBlobsStore(store);
  } catch (e) {
    console.warn('[notifs] blobs unavailable:', e?.message||e);
    if (!allowFallback) throw new Error('blobs unavailable and memory fallback disabled');
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

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers };
  if (!['GET','POST'].includes(event.httpMethod)) return { statusCode:405, headers, body:'Method Not Allowed' };
  if (!isAllowed) return { statusCode:403, headers, body:'Forbidden by CORS' };

  try {
    const store = await getStoreSafe();

    if (event.httpMethod === 'GET') {
      // ① Владелец (initData), либо ② совместимость: явный uid в query
      const hdrRaw =
        getHeaderCaseInsensitive(event,'X-Tg-Init-Data') ||
        getHeaderCaseInsensitive(event,'X-Telegram-Web-App-Init-Data') ||
        '';
      const op  = String(event.queryStringParameters?.op || 'list').toLowerCase();
      const uidFromQuery = String(event.queryStringParameters?.uid || '').trim();

      let uid = null;
      if (hdrRaw) {
        try { ({ uid } = verifyTgInitData(hdrRaw)); } catch (e) { /* мягко игнорируем — попробуем fallback */ }
      }
      if (!uid) uid = uidFromQuery; // режим совместимости с фронтом

      if (!uid) return { statusCode:400, headers, body: JSON.stringify({ ok:false, error:'uid required' }) };

      if (op === 'list') {
        const items = await store.list(uid);
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, store:store.kind, items }) };
      }
      if (op === 'health') {
        const items = await store.list(uid);
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, store:store.kind, count:items.length }) };
      }
      return { statusCode:400, headers, body: JSON.stringify({ ok:false, error:'unknown op' }) };
    }

    // POST
    let body = {};
    try { body = JSON.parse(event.body || '{}') || {}; } catch { body = {}; }
    const op  = String(body.op || '').toLowerCase();

    // --- 1) ДЕЙСТВИЯ ОТ СЕРВЕРА (internal-token) ---
    if (internal) {
      const uid = String(body.uid || '').trim();
      if (!uid) return { statusCode:400, headers, body: JSON.stringify({ ok:false, error:'uid required' }) };
      if (op === 'add') {
        const { id, items } = await store.add(uid, body.notif || {});
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, id, items }) };
      }
      if (op === 'markall') {
        const items = await store.markAll(uid);
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, items }) };
      }
      if (op === 'mark') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const items = await store.mark(uid, ids);
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, items }) };
      }
      return { statusCode:400, headers, body: JSON.stringify({ ok:false, error:'unknown op' }) };
    }

    // --- 2) ДЕЙСТВИЯ ОТ ПОЛЬЗОВАТЕЛЯ ---

    // 2a. Владелец через initData: markMine/markSeen (исторический контракт)
    if (op === 'markseen' || op === 'markmine') {
      const { raw } = readInitDataSource(event, body);
      try {
        const { uid } = verifyTgInitData(raw);
        const targetUidRaw = String(body.uid || '').trim();
        if (targetUidRaw && targetUidRaw !== uid) {
          return { statusCode:403, headers, body: JSON.stringify({ ok:false, error:'forbidden' }) };
        }
        const ids = Array.isArray(body.ids) ? body.ids : null;
        const items = ids?.length ? await store.mark(uid, ids) : await store.markAll(uid);
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, items }) };
      } catch {
        // мягкий отказ, чтобы фронт мог перейти на публичный путь markAll без 500
        return { statusCode:401, headers, body: JSON.stringify({ ok:false, error:'unauthorized' }) };
      }
    }

    // 2b. Совместимость с фронтендом: { op:'markAll', uid } или { op:'mark', uid, ids }
    // + безопасное поведение: если пришёл валидный initData — игнорируем переданный uid и помечаем только «свои»
    if (op === 'markall' || op === 'markAll' || op === 'mark') {
      let verifiedUid = null;
      try {
        const { raw } = readInitDataSource(event, body);
        if (raw) { const r = verifyTgInitData(raw); verifiedUid = r.uid; }
      } catch {}

      const uid = String(verifiedUid || body.uid || '').trim();
      if (!uid) return { statusCode:400, headers, body: JSON.stringify({ ok:false, error:'uid required' }) };

      if (/^markall$/i.test(op)) {
        const items = await store.markAll(uid);
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, items }) };
      } else {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const items = await store.mark(uid, ids);
        return { statusCode:200, headers, body: JSON.stringify({ ok:true, items }) };
      }
    }

    // Публичного добавления нет (клиент при неудаче кладёт локально)
    if (op === 'add') {
      return { statusCode:403, headers, body: JSON.stringify({ ok:false, error:'forbidden' }) };
    }

    return { statusCode:403, headers, body: JSON.stringify({ ok:false, error:'forbidden' }) };
  } catch (e) {
    console.error('[notifs] handler error:', e);
    return { statusCode:500, headers, body: JSON.stringify({ ok:false, error:String(e?.message||e) }) };
  }
}

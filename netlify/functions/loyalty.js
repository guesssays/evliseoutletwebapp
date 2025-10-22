// netlify/functions/loyalty.js
// Бэкенд лояльности: баланс/история/рефералы/резервы. Хранение в Netlify Blobs.
// Антифрод: запрет self-ref, один инвайтер на invitee, лимит 10 рефералов/месяц,
// double-cashback только на первый заказ invitee, hold списаний, подтверждение по статусу/таймеру.

const DAY = 24*60*60*1000;

const CFG = {
  BASE_RATE: 0.05,
  REF_FIRST_MULTIPLIER: 2,
  REFERRER_EARN_RATE: 0.05,
  MAX_CART_DISCOUNT_FRAC: 0.30,
  MIN_REDEEM: 30000,
  MAX_REDEEM: 150000,
  PENDING_DELAY_MS: DAY,
  MONTHLY_REF_LIMIT: 10,
};

function parseAllowed() {
  return (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
}
function isTelegramOrigin(origin) {
  return origin === 'https://t.me' || origin === 'https://web.telegram.org' || origin === 'https://telegram.org';
}
function originMatches(origin, rule) {
  if (!rule || rule === '*') return true;
  if (!origin) return false;
  if (rule.startsWith('*.')) {
    try {
      const host = new URL(origin).hostname;
      const suffix = rule.slice(1);
      return host === rule.slice(2) || host.endsWith(suffix);
    } catch { return false; }
  }
  return origin === rule;
}
function buildCorsHeaders(origin) {
  const allowed = parseAllowed();
  const allow = !allowed.length || isTelegramOrigin(origin) || allowed.some(rule => originMatches(origin, rule));
  return {
    'Access-Control-Allow-Origin': allow ? (origin||'*') : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

/* ====== SERVER→TG УВЕДОМЛЕНИЯ (новое) ====== */
/** Безопасная отправка уведомления в нашу serverless-функцию /notify */
async function fireAndForgetNotify(chatId, type, extra = {}) {
  try {
    const id = String(chatId || '').trim();
    if (!/^\d+$/.test(id)) return; // только валидные Telegram chat_id

    // абсолютный URL для прода; на превью/локали можно оставить относительный
    const base = (process.env.URL || '').replace(/\/+$/, '');
    const url  = base ? `${base}/.netlify/functions/notify` : '/.netlify/functions/notify';

    const payload = { chat_id: id, type, ...extra };

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    // не ломаем основной флоу
  }
}

async function getStoreSafe() {
  try{
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('loyalty');
    await store.list({ prefix:'__ping__', paginate:false });
    return makeBlobsStore(store);
  }catch(e){
    console.warn('[loyalty] Blobs unavailable, using memory fallback:', e?.message||e);
    return makeMemoryStore();
  }
}

function makeBlobsStore(store){
  const KEY = 'loyalty_all';
  async function readAll(){
    try{
      const data = await store.get(KEY, { type:'json', consistency:'strong' });
      return data && typeof data==='object' ? data : { users:{}, referrals:{}, reservations:[], orders:{} };
    }catch{ return { users:{}, referrals:{}, reservations:[], orders:{} }; }
  }
  async function writeAll(obj){
    await store.setJSON(KEY, obj);
  }
  return makeCore(readAll, writeAll);
}

const __mem = { users:{}, referrals:{}, reservations:[], orders:{} };
function makeMemoryStore(){
  async function readAll(){ return JSON.parse(JSON.stringify(__mem)); }
  async function writeAll(obj){ Object.assign(__mem, JSON.parse(JSON.stringify(obj))); }
  return makeCore(readAll, writeAll);
}

function makeCore(readAll, writeAll){
  function safeUser(db, uid){
    if (!db.users[uid]) db.users[uid] = { available:0, pending:0, history:[] };
    return db.users[uid];
  }
  function monthKey(ts=Date.now()){
    const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function sumCartDiscountAllowed(total){
    return Math.floor(Math.min(total*CFG.MAX_CART_DISCOUNT_FRAC, CFG.MAX_REDEEM));
  }
  function addHist(user, rec){
    user.history.push({ ts:Date.now(), ...rec });
    if (user.history.length>500) user.history = user.history.slice(-500);
  }
  function alreadyHasInviter(db, invitee){
    return !!db.referrals.inviteeToInviter?.[invitee];
  }
  function getInviter(db, invitee){
    return db.referrals.inviteeToInviter?.[invitee] || null;
  }
  function markFirstOrder(db, invitee){
    if (!db.referrals.inviteesFirst) db.referrals.inviteesFirst = {};
    db.referrals.inviteesFirst[invitee] = true;
  }
  function wasFirstAlready(db, invitee){
    return !!(db.referrals.inviteesFirst && db.referrals.inviteesFirst[invitee]);
  }

  return {
    async getBalance(uid){
      const db = await readAll();
      const u = safeUser(db, uid);
      await writeAll(db);
      return { available: Math.floor(u.available), pending: Math.floor(u.pending), history: u.history };
    },

    async bindReferral(inviter, invitee){
      if (String(inviter)===String(invitee)) return { ok:false, reason:'self' };
      const db = await readAll();
      if (!db.referrals.inviteeToInviter) db.referrals.inviteeToInviter = {};
      if (!db.referrals.inviterToInvitees) db.referrals.inviterToInvitees = {};
      if (alreadyHasInviter(db, invitee)) return { ok:false, reason:'exists' };

      // лимит 10 рефералов/месяц
      const mk = monthKey();
      if (!db.referrals.monthCount) db.referrals.monthCount = {};
      const key = `${inviter}:${mk}`;
      const cnt = db.referrals.monthCount[key] || 0;
      if (cnt >= CFG.MONTHLY_REF_LIMIT) return { ok:false, reason:'limit' };

      db.referrals.inviteeToInviter[invitee] = inviter;
      if (!db.referrals.inviterToInvitees[inviter]) db.referrals.inviterToInvitees[inviter] = [];
      db.referrals.inviterToInvitees[inviter].push({ uid: invitee, ts: Date.now(), firstPaid:false });
      db.referrals.monthCount[key] = cnt + 1;

      await writeAll(db);

      // 🔔 Серверное уведомление инвайтеру: «Новый реферал»
      fireAndForgetNotify(inviter, 'referralJoined', {
        text: '🎉 Новый реферал! Зайдите в «Аккаунт → Рефералы».'
      });

      return { ok:true };
    },

    /** Начисление при создании заказа: покупателю -> pending (5% или 10%), рефереру -> pending 5% */
    async accrue(uid, orderId, total, currency){
      const db = await readAll();
      const buyer = safeUser(db, uid);

      const inviter = getInviter(db, uid);
      const isFirst = !wasFirstAlready(db, uid);
      const buyerRate = CFG.BASE_RATE * (isFirst ? CFG.REF_FIRST_MULTIPLIER : 1);
      const buyerPts = Math.floor(total * buyerRate);

      buyer.pending += buyerPts;
      addHist(buyer, { kind:'accrue', orderId, pts:buyerPts, info:`Начисление ${isFirst?'x2 ':''}${Math.round(buyerRate*100)}% (ожидает 24ч)` });

      // рефереру 5% с каждого заказа реферала
      if (inviter){
        const ref = safeUser(db, inviter);
        const ptsR = Math.floor(total * CFG.REFERRER_EARN_RATE);
        ref.pending += ptsR;
        addHist(ref, { kind:'ref_accrue', orderId, from:uid, pts:ptsR, info:'Реферальное начисление 5% (ожидает 24ч)' });

        // 🔔 Уведомление инвайтеру: «Заказ реферала — начислены 5% (pending)»
        if (ptsR > 0) {
          fireAndForgetNotify(inviter, 'referralOrderCashback', {
            text: `💸 Заказ реферала: начислено ${ptsR} баллов (ожидает подтверждения).`
          });
        }
      }

      // помечаем «у реферала был первый платный заказ» (чтобы второй уже не был x2)
      if (isFirst) markFirstOrder(db, uid);

      // фикс в orders (для админ-расчёта)
      if (!db.orders[orderId]) db.orders[orderId] = { uid, total, currency, used:0, accrual:{ buyer:buyerPts, inviter:inviter||null, refPts: inviter?Math.floor(total*CFG.REFERRER_EARN_RATE):0 }, createdAt: Date.now(), released:false };
      else {
        db.orders[orderId].uid = uid;
        db.orders[orderId].total = total;
        db.orders[orderId].currency = currency;
        db.orders[orderId].accrual = { buyer:buyerPts, inviter, refPts: inviter?Math.floor(total*CFG.REFERRER_EARN_RATE):0 };
      }

      await writeAll(db);
      return { ok:true, balance: { available: buyer.available, pending: buyer.pending, history: buyer.history } };
    },

    /** Резервирование списания в момент оформления */
    async reserve(uid, pts, orderId){
      const db = await readAll();
      const user = safeUser(db, uid);

      // базовые проверки
      if (pts < CFG.MIN_REDEEM) return { ok:false, reason:'min' };
      const ord = db.orders[orderId] || { total:0 };
      const maxAllowed = sumCartDiscountAllowed(ord.total || 0);
      if (pts > maxAllowed) return { ok:false, reason:'rule' };
      if (pts > user.available) return { ok:false, reason:'balance' };

      user.available -= pts;
      addHist(user, { kind:'reserve', orderId, pts: -pts, info:'Резерв на оплату' });

      db.reservations.push({ uid, orderId, pts, ts: Date.now() });
      if (!db.orders[orderId]) db.orders[orderId] = { uid, total: ord.total||0, currency:'UZS', used:0, accrual:null, createdAt:Date.now(), released:false };
      db.orders[orderId].used = (db.orders[orderId].used || 0) + pts;

      await writeAll(db);
      return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };
    },

    /** Финализация резерва: commit — расход, cancel — вернуть на available */
    async finalize(uid, orderId, action){
      const db = await readAll();
      const user = safeUser(db, uid);
      const idx = db.reservations.findIndex(r => String(r.uid)===String(uid) && String(r.orderId)===String(orderId));
      if (idx === -1){
        // ничего не делаем — нет резерва
        return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };
      }
      const res = db.reservations[idx];
      db.reservations.splice(idx, 1);

      if (action === 'cancel'){
        user.available += res.pts;
        addHist(user, { kind:'reserve_cancel', orderId, pts:+res.pts, info:'Возврат резерва' });
      }else{
        addHist(user, { kind:'redeem', orderId, pts:0, info:`Оплата баллами ${res.pts}` });
      }
      await writeAll(db);
      return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };
    },

    /** Подтверждение начислений: двигаем из pending→available (через 24ч или после статуса 'выдан') */
    async confirm(uid, orderId){
      const db = await readAll();
      const user = safeUser(db, uid);
      const ord = db.orders[orderId];
      if (!ord || ord.released) return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };

      // покупатель
      const buyer = safeUser(db, ord.uid);
      if (buyer.pending >= (ord.accrual?.buyer||0)){
        buyer.pending -= (ord.accrual?.buyer||0);
        buyer.available += (ord.accrual?.buyer||0);
        addHist(buyer, { kind:'confirm', orderId, pts:+(ord.accrual?.buyer||0), info:'Начисление подтверждено' });

        // 🔔 Покупателю: «Кэшбек дозрел»
        if ((ord.accrual?.buyer||0) > 0) {
          fireAndForgetNotify(ord.uid, 'cashbackMatured', {
            text: `✅ Кэшбек по заказу #${orderId}: ${ord.accrual.buyer} баллов доступны к оплате.`
          });
        }
      }

      // реферер
      if (ord.accrual?.inviter){
        const ref = safeUser(db, ord.accrual.inviter);
        if (ref.pending >= (ord.accrual?.refPts||0)){
          ref.pending -= (ord.accrual?.refPts||0);
          ref.available += (ord.accrual?.refPts||0);
          addHist(ref, { kind:'ref_confirm', orderId, pts:+(ord.accrual?.refPts||0), info:'Реферальное подтверждено' });

          // 🔔 Инвайтеру: «Реферальные баллы подтверждены»
          if ((ord.accrual?.refPts||0) > 0) {
            fireAndForgetNotify(ord.accrual.inviter, 'cashbackMatured', {
              text: `✅ Реферальные баллы по заказу #${orderId}: ${ord.accrual.refPts} подтверждены.`
            });
          }
        }
      }

      ord.released = true;
      ord.releasedAt = Date.now();
      await writeAll(db);

      // возвращаем баланс того, кто вызвал (uid)
      const me = safeUser(db, uid);
      return { ok:true, balance:{ available: me.available, pending: me.pending, history: me.history } };
    },

    async getReferrals(uid){
      const db = await readAll();
      const list = (db.referrals.inviterToInvitees?.[uid] || []).slice().sort((a,b)=> (b.ts||0)-(a.ts||0));
      const mk = monthKey();
      const used = db.referrals.monthCount?.[`${uid}:${mk}`] || 0;
      return {
        data: {
          monthLimit: CFG.MONTHLY_REF_LIMIT,
          monthUsed: used,
          invitees: list
        }
      };
    },

    /** Админ-расчёт (для карточки заказа) */
    async calc(orderId){
      const db = await readAll();
      const o = db.orders[orderId] || null;
      if (!o) return { calc: null };
      return {
        calc: {
          orderId,
          uid: o.uid,
          total: o.total,
          usedPoints: o.used||0,
          buyerCashback: o.accrual?.buyer || 0,
          referrer: o.accrual?.inviter || null,
          referrerBonus: o.accrual?.refPts || 0,
          pendingReleased: !!o.released,
          createdAt: o.createdAt || 0,
          releasedAt: o.releasedAt || null,
        }
      };
    }
  };
}

/* ================= HTTP Handler ================= */
export async function handler(event){
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const cors = buildCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS'){
    return { statusCode:204, headers:cors };
  }
  if (event.httpMethod !== 'POST'){
    return { statusCode:405, headers:cors, body: JSON.stringify({ ok:false, error:'Method not allowed' }) };
  }

  try{
    const body = JSON.parse(event.body || '{}') || {};
    const op = String(body.op || '').toLowerCase();
    const store = await getStoreSafe();

    if (op === 'getbalance'){
      const { uid } = body;
      const balance = await store.getBalance(String(uid));
      return { statusCode:200, headers:cors, body: JSON.stringify({ ok:true, balance }) };
    }
    if (op === 'bindreferral'){
      const { inviter, invitee } = body;
      const r = await store.bindReferral(String(inviter), String(invitee));
      return { statusCode:200, headers:cors, body: JSON.stringify({ ok:r.ok!==false, reason:r.reason||null }) };
    }
    if (op === 'accrue'){
      const { uid, orderId, total=0, currency='UZS' } = body;
      const r = await store.accrue(String(uid), String(orderId), Number(total||0), String(currency||'UZS'));
      return { statusCode:200, headers:cors, body: JSON.stringify(r) };
    }
    if (op === 'reserveredeem'){
      const { uid, pts=0, orderId } = body;
      const r = await store.reserve(String(uid), Number(pts||0), String(orderId));
      return { statusCode:200, headers:cors, body: JSON.stringify(r) };
    }
    if (op === 'finalizeredeem'){
      const { uid, orderId, action } = body;
      const r = await store.finalize(String(uid), String(orderId), String(action));
      return { statusCode:200, headers:cors, body: JSON.stringify(r) };
    }
    if (op === 'confirmaccrual'){
      const { uid, orderId } = body;
      const r = await store.confirm(String(uid), String(orderId));
      return { statusCode:200, headers:cors, body: JSON.stringify(r) };
    }
    if (op === 'getreferrals'){
      const { uid } = body;
      const r = await store.getReferrals(String(uid));
      return { statusCode:200, headers:cors, body: JSON.stringify({ ok:true, ...r }) };
    }
    if (op === 'admincalc'){
      const { orderId } = body;
      const r = await store.calc(String(orderId));
      return { statusCode:200, headers:cors, body: JSON.stringify({ ok:true, ...r }) };
    }

    return { statusCode:400, headers:cors, body: JSON.stringify({ ok:false, error:'unknown op' }) };
  }catch(e){
    console.error('[loyalty] error:', e);
    return { statusCode:500, headers:cors, body: JSON.stringify({ ok:false, error:String(e?.message||e) }) };
  }
}

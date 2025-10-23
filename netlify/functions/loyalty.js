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

/* ===== ВСПОМОГАТЕЛЬНОЕ: короткий номер заказа ===== */
function makeDisplayOrderId(orderId, shortId){
  const s = (shortId || '').toString().trim();
  if (s) return s.toUpperCase();
  const full = (orderId || '').toString().trim();
  if (!full) return '';
  return full.slice(-6).toUpperCase();
}

/* ====== SERVER→TG УВЕДОМЛЕНИЯ ====== */
async function fireAndForgetNotify(chatId, type, extra = {}) {
  try {
    const id = String(chatId || '').trim();
    if (!/^\d+$/.test(id)) return;
    const baseRaw = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/, '');
    if (!baseRaw) {
      console.warn('[loyalty] notify skipped: no process.env.URL/DEPLOY_URL');
      return;
    }
    const url  = `${baseRaw}/.netlify/functions/notify`;
    const payload = { chat_id: id, type, ...extra };
    await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
  } catch {}
}

/* ===== SERVER→APP (список уведомлений внутри приложения) ===== */
async function fireAndForgetAppNotif(uid, notif = {}){
  try{
    const baseRaw = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/, '');
    if (!baseRaw || !uid) return;
    const url = `${baseRaw}/.netlify/functions/notifs`;
    await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ op:'add', uid: String(uid), notif }) });
  }catch{}
}

/* ====== ХРАНИЛИЩЕ ====== */
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

/* --- Утилиты мерджа для защиты от перезаписи --- */
function clone(obj){ return JSON.parse(JSON.stringify(obj||{})); }

function mergeHist(oldArr=[], newArr=[]){
  const out = [...(oldArr||[])];
  for (const rec of (newArr||[])) {
    // дедуп по (ts, kind, orderId, pts)
    const key = `${rec.ts||0}|${rec.kind||''}|${rec.orderId||''}|${rec.pts||0}`;
    if (!out.some(v => `${v.ts||0}|${v.kind||''}|${v.orderId||''}|${v.pts||0}` === key)) {
      out.push(rec);
    }
  }
  // ограничение длины как в addHist
  return out.slice(-500);
}

function mergeUsers(oldUsers={}, newUsers={}){
  const res = clone(oldUsers);
  for (const uid of Object.keys(newUsers||{})) {
    const oldU = oldUsers[uid] || { available:0, pending:0, history:[] };
    const newU = newUsers[uid] || {};
    res[uid] = {
      available: typeof newU.available==='number' ? newU.available : oldU.available||0,
      pending:   typeof newU.pending==='number'   ? newU.pending   : oldU.pending||0,
      history:   mergeHist(oldU.history, newU.history)
    };
  }
  return res;
}

function uniqBy(arr, getKey){
  const seen = new Set();
  const out=[];
  for (const x of (arr||[])) {
    const k = getKey(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function mergeReferrals(oldR={}, newR={}){
  const out = clone(oldR);
  out.inviteeToInviter = { ...(oldR.inviteeToInviter||{}), ...(newR.inviteeToInviter||{}) };
  // inviterToInvitees: concat + дедуп по uid
  const tmp = { ...(oldR.inviterToInvitees||{}) };
  for (const inviter of Object.keys(newR.inviterToInvitees||{})) {
    const merged = uniqBy([...(oldR.inviterToInvitees?.[inviter]||[]), ...(newR.inviterToInvitees?.[inviter]||[])],
      v => `${v.uid}`);
    tmp[inviter] = merged;
  }
  out.inviterToInvitees = tmp;
  // monthCount: берём максимум по ключу
  const mc = { ...(oldR.monthCount||{}) };
  for (const k of Object.keys(newR.monthCount||{})) {
    mc[k] = Math.max(mc[k]||0, newR.monthCount[k]||0);
  }
  out.monthCount = mc;
  // inviteesFirst: логическое объединение
  const ifirst = { ...(oldR.inviteesFirst||{}) };
  for (const k of Object.keys(newR.inviteesFirst||{})) ifirst[k] = !!(newR.inviteesFirst[k] || ifirst[k]);
  out.inviteesFirst = ifirst;
  return out;
}

function mergeReservations(oldArr=[], newArr=[]){
  const combined = [...(oldArr||[]), ...(newArr||[])];
  return uniqBy(combined, r => `${r.uid}|${r.orderId}`); // на уровне бизнес-процесса держим один активный резерв на заказ/пользователя
}

function deepMergeDb(oldDb, newDb){
  const oldSafe = clone(oldDb||{ users:{}, referrals:{}, reservations:[], orders:{} });
  const newSafe = clone(newDb||{ users:{}, referrals:{}, reservations:[], orders:{} });
  return {
    users:        mergeUsers(oldSafe.users, newSafe.users),
    referrals:    mergeReferrals(oldSafe.referrals, newSafe.referrals),
    reservations: mergeReservations(oldSafe.reservations, newSafe.reservations),
    orders:       { ...(oldSafe.orders||{}), ...(newSafe.orders||{}) },
  };
}

function makeBlobsStore(store){
  const KEY = 'loyalty_all';

  async function readAll(){
    try{
      const data = await store.get(KEY, { type:'json', consistency:'strong' });
      if (data && typeof data==='object') return data;
      // если ключ пуст — вернём «пустую схему», но ПРИ записи будет мердж с существующим
      return { users:{}, referrals:{}, reservations:[], orders:{} };
    }catch(e){
      console.warn('[loyalty] readAll error, returning empty shell (write is merge-protected):', e?.message||e);
      return { users:{}, referrals:{}, reservations:[], orders:{} };
    }
  }

  // 🔐 КРИТИЧЕСКО: всегда мерджим с текущим состоянием, чтобы не перезатирать историю
  async function writeAll(obj){
    let merged = obj;
    try{
      const existing = await store.get(KEY, { type:'json', consistency:'strong' });
      if (existing && typeof existing==='object'){
        merged = deepMergeDb(existing, obj);
      }
    }catch(e){
      console.warn('[loyalty] writeAll: failed to load existing for merge, writing provided object. Err:', e?.message||e);
    }
    // необязательная «poor-man backup»: сохраняем снапшот раз в 5 минут
    try{
      const now = Date.now();
      const bucket = Math.floor(now / (5*60*1000)) * (5*60*1000);
      const snapKey = `${KEY}__snap_${bucket}`;
      await store.setJSON(snapKey, merged);
    }catch{}
    await store.setJSON(KEY, merged);
  }

  return makeCore(readAll, writeAll);
}

const __mem = { users:{}, referrals:{}, reservations:[], orders:{} };
function makeMemoryStore(){
  async function readAll(){ return JSON.parse(JSON.stringify(__mem)); }
  async function writeAll(obj){
    const merged = deepMergeDb(__mem, obj);
    Object.assign(__mem, JSON.parse(JSON.stringify(merged)));
  }
  return makeCore(readAll, writeAll);
}

/* ====== CORE (доменные операции) ====== */
function makeCore(readAll, writeAll){
  function safeUser(db, uid){
    if (!db.users[uid]) db.users[uid] = { available:0, pending:0, history:[] };
    return db.users[uid];
  }
  function monthKey(ts=Date.now()){
    const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
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

  // ===== внутренняя аннуляция начислений по заказу (для отмены) =====
  async function voidAccrualInternal(db, orderId){
    const ord = db.orders[orderId];
    if (!ord) return { ok:false, reason:'no_order' };
    if (ord.released) return { ok:true, reason:'already_released' };

    const buyerPts = ord.accrual?.buyer|0 || 0;
    const inviter  = ord.accrual?.inviter || null;
    const refPts   = ord.accrual?.refPts|0 || 0;

    if (buyerPts > 0) {
      const buyer = safeUser(db, ord.uid);
      const take = Math.min(buyer.pending|0, buyerPts);
      if (take > 0) {
        buyer.pending -= take;
        addHist(buyer, { kind:'accrue_void', orderId, pts:-take, info:'Отмена заказа — начисление отменено' });
      }
    }

    if (inviter && refPts > 0) {
      const ref = safeUser(db, inviter);
      const take = Math.min(ref.pending|0, refPts);
      if (take > 0) {
        ref.pending -= take;
        addHist(ref, { kind:'ref_accrue_void', orderId, pts:-take, info:'Отмена заказа реферала — начисление отменено' });
      }
    }

    // если по заказу были списания и активного резерва нет — вернём
    const usedAbs = Math.max(0, Number(ord.used||0)|0);
    if (usedAbs > 0) {
      const buyer = safeUser(db, ord.uid);
      buyer.available += usedAbs;
      addHist(buyer, { kind:'reserve_cancel', orderId, pts:+usedAbs, info:'Возврат оплаченных баллов (отмена заказа)' });
      ord.used = 0;
    }

    db.orders[orderId] = { ...(ord||{}), canceled: true, released: false };
    return { ok:true };
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

      await fireAndForgetAppNotif(inviter, { icon:'users', title:'Новый реферал', sub:'Пользователь зарегистрировался по вашей ссылке' });
      await fireAndForgetNotify(inviter, 'referralJoined', { text: '🎉 Новый реферал! Зайдите в «Аккаунт → Рефералы».' });

      return { ok:true };
    },

    /** Идемпотентное начисление */
    async accrue(uid, orderId, total, currency, shortId=null){
      const db = await readAll();

      const existing = db.orders[orderId];
      if (existing?.released) {
        return { ok:true, balance: await this.getBalance(uid) };
      }

      const buyer = safeUser(db, uid);
      const inviter = db.referrals ? (db.referrals.inviteeToInviter?.[uid] || null) : null;

      if (!inviter && db?.referrals?.inviteesFirst?.[uid]) {
        delete db.referrals.inviteesFirst[uid];
      }

      const eligibleForBoost = !!inviter && !wasFirstAlready(db, uid);
      const buyerRate = CFG.BASE_RATE * (eligibleForBoost ? CFG.REF_FIRST_MULTIPLIER : 1);
      const newBuyerPts = Math.floor(total * buyerRate);
      const newRefPts   = inviter ? Math.floor(total * CFG.REFERRER_EARN_RATE) : 0;

      const prevBuyerPts = existing?.accrual?.buyer || 0;
      const prevRefPts   = existing?.accrual?.refPts || 0;
      const prevInviter  = existing?.accrual?.inviter || null;

      const deltaBuyer = newBuyerPts - prevBuyerPts;
      if (deltaBuyer !== 0) {
        buyer.pending += deltaBuyer;
        addHist(buyer, {
          kind: deltaBuyer > 0 ? 'accrue' : 'accrue_adjust',
          orderId,
          pts: deltaBuyer,
          info: deltaBuyer > 0
            ? `Начисление ${eligibleForBoost ? 'x2 ' : ''}${Math.round(buyerRate*100)}% (ожидает 24ч)`
            : `Корректировка начисления (${deltaBuyer})`,
        });

        if (deltaBuyer > 0) {
          const disp = makeDisplayOrderId(orderId, shortId || existing?.shortId);
          await fireAndForgetAppNotif(uid, { icon:'coins', title:`Начисление по заказу #${disp}`, sub:`Ожидает подтверждения: ${deltaBuyer} балл(ов)` });
        }
      }
      if (eligibleForBoost && !wasFirstAlready(db, uid)) markFirstOrder(db, uid);

      if (prevInviter && prevInviter !== inviter) {
        const oldRefUser = safeUser(db, prevInviter);
        if (prevRefPts > 0) {
          oldRefUser.pending = Math.max(0, (oldRefUser.pending|0) - prevRefPts);
          addHist(oldRefUser, { kind:'ref_accrue_adjust', orderId, pts:-prevRefPts, info:'Отмена реф.начисления (смена инвайтера)' });
        }
      }
      if (inviter) {
        const refUser = safeUser(db, inviter);
        const basePrevForDelta = (prevInviter === inviter) ? prevRefPts : 0;
        const deltaRef = newRefPts - basePrevForDelta;
        if (deltaRef !== 0) {
          refUser.pending += deltaRef;
          addHist(refUser, {
            kind: deltaRef > 0 ? 'ref_accrue' : 'ref_accrue_adjust',
            orderId, from: uid, pts: deltaRef,
            info: deltaRef > 0 ? 'Реферальное начисление 5% (ожидает 24ч)' : 'Корректировка реф.начисления',
          });

          if (deltaRef > 0) {
            const disp = makeDisplayOrderId(orderId, shortId || existing?.shortId);
            await fireAndForgetAppNotif(inviter, { icon:'gift', title:`Реферальное начисление по #${disp}`, sub:`Ожидает подтверждения: ${deltaRef} балл(ов)` });
            await fireAndForgetNotify(inviter, 'referralOrderCashback', { text: `💸 Заказ реферала: начислено ${deltaRef} баллов (ожидает подтверждения).` });
          }
        }
      }

      db.orders[orderId] = {
        ...(existing || {}),
        uid, total, currency,
        used: existing?.used || 0,
        shortId: shortId || existing?.shortId || null,
        accrual: { buyer: newBuyerPts, inviter: inviter || null, refPts: newRefPts },
        createdAt: existing?.createdAt || Date.now(),
        released: existing?.released || false,
      };

      await writeAll(db);
      return { ok:true, balance: { available: buyer.available, pending: buyer.pending, history: buyer.history } };
    },

    /** Резервирование списания в момент оформления */
    async reserve(uid, pts, orderId, totalArg = 0, shortId=null){
      const db = await readAll();
      const user = safeUser(db, uid);

      if (pts < CFG.MIN_REDEEM) return { ok:false, reason:'min' };

      const ordExisting = db.orders[orderId];
      const baseTotal = Number((ordExisting?.total ?? 0) || totalArg || 0);
      if (baseTotal <= 0) return { ok:false, reason:'total' };

      const byShare = Math.floor(baseTotal * CFG.MAX_CART_DISCOUNT_FRAC);
      const maxAllowed = Math.min(byShare, CFG.MAX_REDEEM);

      if (pts > maxAllowed)     return { ok:false, reason:'rule' };
      if (pts > user.available) return { ok:false, reason:'balance' };

      user.available -= pts;
      addHist(user, { kind:'reserve', orderId, pts: -pts, info:'Резерв на оплату' });

      db.reservations.push({ uid, orderId, pts, ts: Date.now() });

      if (!db.orders[orderId]) {
        db.orders[orderId] = {
          uid,
          total: baseTotal,
          currency: 'UZS',
          used: 0,
          accrual: null,
          shortId: shortId || null,
          createdAt: Date.now(),
          released: false
        };
      }
      db.orders[orderId].used = (db.orders[orderId].used || 0) + pts;
      if (shortId && !db.orders[orderId].shortId) db.orders[orderId].shortId = shortId;

      await writeAll(db);
      return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };
    },

    /** Финализация резерва */
    async finalize(uid, orderId, action){
      const db = await readAll();
      const user = safeUser(db, uid);
      const idx = db.reservations.findIndex(r => String(r.uid)===String(uid) && String(r.orderId)===String(orderId));
      if (idx === -1){
        return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };
      }
      const res = db.reservations[idx];
      db.reservations.splice(idx, 1);

      if (action === 'cancel'){
        user.available += res.pts;
        addHist(user, { kind:'reserve_cancel', orderId, pts:+res.pts, info:'Возврат резерва' });
        const o = db.orders[orderId];
        if (o) {
          const take = Math.max(0, Math.min(Number(o.used||0), Math.abs(res.pts|0)));
          if (take > 0) o.used = Math.max(0, (o.used|0) - take);
        }
      }else{
        addHist(user, { kind:'redeem', orderId, pts:-Math.abs(res.pts|0), info:`Оплата баллами ${res.pts}` });
      }
      await writeAll(db);
      return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };
    },

    /** Подтверждение начислений: pending→available */
    async confirm(uid, orderId){
      const db = await readAll();
      const user = safeUser(db, uid);
      const ord = db.orders[orderId];
      if (!ord || ord.released || ord.canceled) {
        return { ok:true, balance:{ available:user.available, pending:user.pending, history:user.history } };
      }

      const disp = makeDisplayOrderId(orderId, ord?.shortId);

      // покупатель
      const buyer = safeUser(db, ord.uid);
      const bPts = ord.accrual?.buyer || 0;
      if (bPts > 0 && buyer.pending >= bPts){
        buyer.pending -= bPts;
        buyer.available += bPts;
        addHist(buyer, { kind:'confirm', orderId, pts:+bPts, info:'Начисление подтверждено' });

        await fireAndForgetAppNotif(ord.uid, { icon:'check-circle', title:`Кэшбек доступен по #${disp}`, sub:`Зачислено: ${bPts} балл(ов)` });
        await fireAndForgetNotify(ord.uid, 'cashbackMatured', {
          text: `✅ Кэшбек по заказу #${disp}: ${bPts} баллов доступны к оплате.`,
          orderId, shortId: ord.shortId
        });
      }

      // реферер
      if (ord.accrual?.inviter){
        const ref = safeUser(db, ord.accrual.inviter);
        const rPts = ord.accrual?.refPts || 0;
        if (rPts > 0 && ref.pending >= rPts){
          ref.pending -= rPts;
          ref.available += rPts;
          addHist(ref, { kind:'ref_confirm', orderId, pts:+rPts, info:'Реферальные подтверждены' });

          await fireAndForgetAppNotif(ord.accrual.inviter, { icon:'check-circle', title:`Реферальные подтверждены по #${disp}`, sub:`Зачислено: ${rPts} балл(ов)` });
          await fireAndForgetNotify(ord.accrual.inviter, 'cashbackMatured', {
            text: `✅ Реферальные баллы по заказу #${disp}: ${rPts} подтверждены.`,
            orderId, shortId: ord.shortId
          });
        }
      }

      ord.released = true;
      ord.releasedAt = Date.now();
      await writeAll(db);

      const me = safeUser(db, uid);
      return { ok:true, balance:{ available: me.available, pending: me.pending, history: me.history } };
    },

    /** Админ/сервис: снять pending-начисления по отменённому заказу */
    async voidAccrual(orderId){
      const db = await readAll();
      const r = await voidAccrualInternal(db, String(orderId));
      await writeAll(db);
      return r;
    },

    async getReferrals(uid){
      const db = await readAll();
      const list = (db.referrals.inviterToInvitees?.[uid] || []).slice().sort((a,b)=> (b.ts||0)-(a.ts||0));
      const mk = monthKey();
      const used = db.referrals.monthCount?.[`${uid}:${mk}`] || 0;
      return { data: { monthLimit: CFG.MONTHLY_REF_LIMIT, monthUsed: used, invitees: list } };
    },

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
          shortId: o.shortId || null,
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
      const { uid, orderId, total=0, currency='UZS', shortId=null } = body;
      const r = await store.accrue(String(uid), String(orderId), Number(total||0), String(currency||'UZS'), shortId ? String(shortId) : null);
      return { statusCode:200, headers:cors, body: JSON.stringify(r) };
    }
    if (op === 'reserveredeem'){
      const { uid, pts=0, orderId, total=0, shortId=null } = body;
      const r = await store.reserve(String(uid), Number(pts||0), String(orderId), Number(total||0), shortId ? String(shortId) : null);
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
    if (op === 'voidaccrual'){
      const { uid=null, orderId } = body;
      const r = await store.voidAccrual(String(orderId));
      let balance = null;
      if (uid) {
        try { balance = await store.getBalance(String(uid)); } catch {}
      }
      return { statusCode:200, headers:cors, body: JSON.stringify({ ok:r.ok!==false, reason:r.reason||null, ...(balance ? { balance } : {}) }) };
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

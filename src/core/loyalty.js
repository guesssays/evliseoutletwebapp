// src/core/loyalty.js
// Клиентская обвязка к serverless-функции лояльности + локальные хелперы

import { getUID, k } from './state.js';

/* ===== Конфиг ===== */
export const CASHBACK_CFG = {
  POINT_IS_SUM: 1,
  BASE_RATE: 0.05,
  REF_FIRST_MULTIPLIER: 2,
  REFERRER_EARN_RATE: 0.05,
  MAX_CART_DISCOUNT_FRAC: 0.30,
  MIN_REDEEM: 30000,
  MAX_REDEEM: 150000,
  PENDING_DELAY_MS: 24 * 60 * 60 * 1000,
  MONTHLY_REF_LIMIT: 10,
};

/* ===== Внутреннее: таймаут запросов ===== */
const FETCH_TIMEOUT_MS = 10000;
function withTimeout(promise, ms = FETCH_TIMEOUT_MS){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

/* ====== Telegram Mini App: имя бота для deeplink ====== */
// ⚠️ важна точная капитализация, как в @getMe
export const BOT_USERNAME = 'EvliseOutletBot';

/* ===== Локальные ключи ===== */
const LKEY_BALANCE    = 'loyalty_balance';
const LKEY_REDEEM_RES = 'loyalty_redeem_reservations';
const LKEY_REF        = 'loyalty_ref';
const LKEY_INVITER    = 'pending_inviter_uid';

/* ===== Helpers: raw initData из Telegram ===== */
function getTgInitDataRaw(){
  try {
    // отдаём именно сырую строку initData
    if (typeof window?.Telegram?.WebApp?.initData === 'string') {
      return window.Telegram.WebApp.initData;
    }
    return '';
  } catch { return ''; }
}

/* ===== Админ-токен (для внутренних операций) ===== */
// ВНИМАНИЕ: эти операции принимаются бэком только при наличии X-Internal-Auth
const ADMIN_OPS = new Set([
  'admincalc',         // админский расчёт по заказу
  'voidaccrual',       // аннулировать ожидаемое начисление
  'accrue',            // начислить pending на заказ (вызов из orders.js/админки)
  'confirmaccrual',    // ручное подтверждение начисления (админ)
]);

function getAdminToken() {
  try {
    return (
      (typeof window !== 'undefined' && (window.__ADMIN_API_TOKEN__ || window.ADMIN_API_TOKEN)) ||
      localStorage.getItem('admin_api_token') ||
      ''
    );
  } catch { return ''; }
}

/* ===== Стейт-кэш (клиент) ===== */
export function getLocalLoyalty(){
  try{
    const raw = localStorage.getItem(k(LKEY_BALANCE));
    const v = raw ? JSON.parse(raw) : {};
    return {
      available: Number(v.available||0),
      pending:   Number(v.pending||0),
      history:   Array.isArray(v.history) ? v.history : [],
    };
  }catch{ return { available:0, pending:0, history:[] }; }
}
export function setLocalLoyalty(obj){
  localStorage.setItem(
    k(LKEY_BALANCE),
    JSON.stringify({
      available: Number(obj?.available||0),
      pending:   Number(obj?.pending||0),
      history:   Array.isArray(obj?.history)?obj.history:[],
    })
  );
}
export function getLocalReservations(){
  try{ return JSON.parse(localStorage.getItem(k(LKEY_REDEEM_RES)) || '[]'); }catch{ return []; }
}
export function setLocalReservations(list){
  localStorage.setItem(k(LKEY_REDEEM_RES), JSON.stringify(Array.isArray(list)?list:[]));
}
export function getLocalRef(){
  try{ return JSON.parse(localStorage.getItem(k(LKEY_REF)) || '{}'); }catch{ return {}; }
}
export function setLocalRef(obj){
  localStorage.setItem(k(LKEY_REF), JSON.stringify(obj||{}));
}

/* ===== Serverless API ===== */
const API = '/.netlify/functions/loyalty';

// Алисы: принимаем «человеческие» имена, отправляем то, что ждёт бэк
const OP_ALIAS = new Map([
  // чтение
  ['getbalance', 'getbalance'],
  ['getBalance', 'getbalance'],

  // рефералы
  ['bindReferral', 'bindreferral'],
  ['bindreferral', 'bindreferral'],
  ['getReferrals', 'getreferrals'],
  ['getreferrals', 'getreferrals'],

  // списание
  ['reserveRedeem', 'reserveredeem'],
  ['reserveredeem', 'reserveredeem'],
  ['finalizeRedeem', 'finalizeredeem'],
  ['finalizeredeem', 'finalizeredeem'],

  // начисления
  ['accrue', 'accrue'],
  ['confirmAccrual', 'confirmaccrual'],
  ['confirmaccrual', 'confirmaccrual'],
  ['voidAccrual', 'voidaccrual'],
  ['voidaccrual', 'voidaccrual'],

  // админский расчёт
  ['adminCalc', 'admincalc'],
  ['admincalc', 'admincalc'],
]);

function normalizeOp(op){
  const raw = String(op || '').trim();
  if (!raw) return '';
  if (OP_ALIAS.has(raw)) return OP_ALIAS.get(raw);
  const low = raw.toLowerCase();
  return OP_ALIAS.get(low) || low;
}

async function api(op, body = {}){
  const norm = normalizeOp(op);
  const headers = {
    'Content-Type':'application/json',
    'X-Tg-Init-Data': getTgInitDataRaw(),          // сырая строка initData         // для диагностики "бот не тот"
  };
  // для внутренних операций добавляем admin header
  if (ADMIN_OPS.has(norm)) {
    const t = getAdminToken();
    if (t) headers['X-Internal-Auth'] = t;
  }
  const r = await withTimeout(fetch(API, {
    method:'POST',
    headers,
    body: JSON.stringify({ op: norm, ...body })
  }), FETCH_TIMEOUT_MS);
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error || 'loyalty api error');
  }
  return data;
}

/* ===== Pending inviter helpers ===== */
function setPendingInviter(uid){ try{ if (uid) localStorage.setItem(k(LKEY_INVITER), String(uid)); }catch{} }
function getPendingInviter(){ try{ return localStorage.getItem(k(LKEY_INVITER)); }catch{ return null; } }
function clearPendingInviter(){ try{ localStorage.removeItem(k(LKEY_INVITER)); }catch{} }

/* ===== Публичные методы (клиент) ===== */

export async function fetchMyLoyalty(){
  // Мягкий фолбэк: не роняем вызвавший код, если сеть упала
  try{
    const uid = getUID();
    const { balance } = await api('getBalance', { uid });
    setLocalLoyalty(balance || {});
    return balance || getLocalLoyalty();
  }catch{
    return getLocalLoyalty();
  }
}

export function makeReferralLink(){
  const uid = getUID();
  const start = `ref_${uid}`;
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(start)}`;
}

export function captureInviterFromContext(){
  try{
    // a) Telegram Mini App
    const sp = window?.Telegram?.WebApp?.initDataUnsafe?.start_param || '';
    if (sp && String(sp).startsWith('ref_')) {
      const inviter = String(sp).slice(4);
      if (inviter) setPendingInviter(inviter);
    }
    // b) Веб-URL
    const parse = (searchOrHash='')=>{
      const p = new URLSearchParams(searchOrHash);
      const qpStart = p.get('start') || '';
      const qpRef   = p.get('ref') || '';
      if (qpStart && qpStart.startsWith('ref_')) return qpStart.slice(4);
      if (qpRef) return qpRef;
      return '';
    };
    const qInv = parse((location.search||'').slice(1)) || parse((location.hash.split('?')[1]||'')); // hash-part after '?'
    if (qInv) setPendingInviter(qInv);
  }catch{}
}

export async function tryBindPendingInviter(){
  const me = getUID();
  const inviter = getPendingInviter();
  if (!inviter || !me || String(inviter)===String(me)) return;
  try{
    const { ok, reason } = await ensureReferralBound(inviter);
    if (ok || reason) clearPendingInviter();
  }catch{}
}

export async function ensureReferralBound(inviterUid){
  const me = getUID();
  if (!inviterUid || String(inviterUid) === String(me)) return { ok:false, reason:'self' };
  const { ok, reason } = await api('bindReferral', { inviter: String(inviterUid), invitee: String(me) });
  if (ok){ setLocalRef({ inviter: String(inviterUid) }); }
  return { ok, reason };
}

export function previewEarnForPrice(priceUZS, opts = { refDouble:false }){
  const rate = CASHBACK_CFG.BASE_RATE * (opts.refDouble ? CASHBACK_CFG.REF_FIRST_MULTIPLIER : 1);
  const pts = Math.floor(Number(priceUZS||0) * rate);
  return Math.max(0, pts);
}

export function computeMaxRedeem(total){
  const bal = getLocalLoyalty();
  const maxByFrac = Math.floor(Number(total||0) * CASHBACK_CFG.MAX_CART_DISCOUNT_FRAC);
  const capByMax  = CASHBACK_CFG.MAX_REDEEM;
  const hardCap   = Math.min(maxByFrac, capByMax);
  const allowed   = Math.min(hardCap, Math.floor(bal.available||0));
  if (allowed < CASHBACK_CFG.MIN_REDEEM) return 0;
  return allowed;
}

/** ВАЖНО: добавили параметр `total` — чтобы сервер мог валидировать правило 30%/MAX_REDEEM,
 *  если заказ ещё не создан в сторадже.
 */
export async function reserveRedeem(points, orderId, shortId = null, total = null){
  const uid = getUID();
  if (!points || points < CASHBACK_CFG.MIN_REDEEM) return { ok:false, reason:'min' };
  const payload = {
    uid,
    pts: Math.floor(points),
    orderId: String(orderId),
    shortId: shortId ? String(shortId) : null,
  };
  if (total != null) payload.total = Number(total) || 0;

  const { ok, balance } = await api('reserveRedeem', payload);
  if (ok){
    setLocalLoyalty(balance || {});
    const res = getLocalReservations();
    res.push({ orderId:String(orderId), pts:Math.floor(points), ts:Date.now() });
    setLocalReservations(res);
  }
  return { ok };
}

export async function finalizeRedeem(orderId, action /* 'cancel' | 'commit' */){
  const uid = getUID();
  const { ok, balance } = await api('finalizeRedeem', { uid, orderId:String(orderId), action:String(action) });
  if (ok){
    setLocalLoyalty(balance || {});
    const res = getLocalReservations().filter(r => String(r.orderId)!==String(orderId));
    setLocalReservations(res);
  }
  return { ok };
}

export async function finalizeRedeemFor(uid, orderId, action){
  const { ok, balance } = await api('finalizeRedeem', { uid:String(uid), orderId:String(orderId), action:String(action) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

// РУЧНОЕ подтверждение админом (внутренняя операция)
export async function confirmAccrualFor(uid, orderId){
  const { ok, balance } = await api('confirmAccrual', { uid:String(uid), orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

export async function loyaltyVoidAccrualFor(uid, orderId){
  const { ok, balance } = await api('voidAccrual', { uid:String(uid), orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

// NB: accrue — internal-only; будет работать только внутри админ-панели/бэка с прокинутым ADMIN_API_TOKEN
export async function accrueOnOrderPlaced(order){
  const uid = String(order.userId || getUID());
  const { ok, balance } = await api('accrue', {
    uid,
    orderId: String(order.id),
    total: Number(order.total||0),
    currency: String(order.currency || 'UZS'),
    shortId: order?.shortId ? String(order.shortId) : null,
  });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

// Подтверждение начисления пользователем (если такое предусмотрено)
export async function confirmAccrual(orderId){
  const uid = getUID();
  const { ok, balance } = await api('confirmAccrual', { uid, orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

export async function fetchMyReferrals(){
  const uid = getUID();
  const { data } = await api('getReferrals', { uid });
  return data;
}

export async function adminCalcForOrder(orderId){
  const { calc } = await api('adminCalc', { orderId:String(orderId) });
  return calc;
}

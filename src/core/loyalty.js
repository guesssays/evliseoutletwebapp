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

/* ====== Telegram Mini App: имя бота для deeplink ====== */
export const BOT_USERNAME = 'evliseoutletbot';

/* ===== Локальные ключи ===== */
const LKEY_BALANCE    = 'loyalty_balance';
const LKEY_REDEEM_RES = 'loyalty_redeem_reservations';
const LKEY_REF        = 'loyalty_ref';
const LKEY_INVITER    = 'pending_inviter_uid';

/* ===== Helpers: raw initData из Telegram ===== */
function getTgInitDataRaw(){
  try { return typeof window?.Telegram?.WebApp?.initData === 'string'
    ? window.Telegram.WebApp.initData : ''; } catch { return ''; }
}

/* ===== Админ-токен (для внутренних операций) ===== */
const ADMIN_OPS = new Set(['adminCalc', 'voidAccrual', 'accrue']); // accrue — строго internal
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
    return raw ? JSON.parse(raw) : { available:0, pending:0, history:[] };
  }catch{ return { available:0, pending:0, history:[] }; }
}
export function setLocalLoyalty(obj){
  localStorage.setItem(k(LKEY_BALANCE), JSON.stringify({
    available: Number(obj.available||0),
    pending:   Number(obj.pending||0),
    history:   Array.isArray(obj.history)?obj.history:[],
  }));
}
export function getLocalReservations(){
  try{ return JSON.parse(localStorage.getItem(k(LKEY_REDEEM_RES) )|| '[]'); }catch{ return []; }
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

async function api(op, body = {}){
  const headers = {
    'Content-Type':'application/json',
    'X-Tg-Init-Data': getTgInitDataRaw(),
  };
  // для внутренних операций добавляем admin header
  if (ADMIN_OPS.has(String(op))) {
    const t = getAdminToken();
    if (t) headers['X-Internal-Auth'] = t;
  }
  const r = await fetch(API, {
    method:'POST',
    headers,
    body: JSON.stringify({ op, ...body })
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data?.ok === false) throw new Error(data?.error || 'loyalty api error');
  return data;
}

/* ===== Pending inviter helpers ===== */
function setPendingInviter(uid){ try{ if (uid) localStorage.setItem(k(LKEY_INVITER), String(uid)); }catch{} }
function getPendingInviter(){ try{ return localStorage.getItem(k(LKEY_INVITER)); }catch{ return null; } }
function clearPendingInviter(){ try{ localStorage.removeItem(k(LKEY_INVITER)); }catch{} }

/* ===== Публичные методы (клиент) ===== */

export async function fetchMyLoyalty(){
  const uid = getUID();
  const { balance } = await api('getBalance', { uid });
  setLocalLoyalty(balance);
  return balance;
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
    const qInv = parse((location.search||'').slice(1)) || parse((location.hash.split('?')[1]||''));
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
  const maxByFrac = Math.floor(total * CASHBACK_CFG.MAX_CART_DISCOUNT_FRAC);
  const capByMax  = CASHBACK_CFG.MAX_REDEEM;
  const hardCap   = Math.min(maxByFrac, capByMax);
  const allowed   = Math.min(hardCap, Math.floor(bal.available));
  if (allowed < CASHBACK_CFG.MIN_REDEEM) return 0;
  return allowed;
}

export async function reserveRedeem(points, orderId, shortId = null){
  const uid = getUID();
  if (!points || points < CASHBACK_CFG.MIN_REDEEM) return { ok:false, reason:'min' };
  const { ok, balance } = await api('reserveRedeem', {
    uid,
    pts: Math.floor(points),
    orderId: String(orderId),
    shortId: shortId ? String(shortId) : null,
  });
  if (ok){
    setLocalLoyalty(balance);
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
    setLocalLoyalty(balance);
    const res = getLocalReservations().filter(r => String(r.orderId)!==String(orderId));
    setLocalReservations(res);
  }
  return { ok };
}

export async function finalizeRedeemFor(uid, orderId, action){
  const { ok, balance } = await api('finalizeRedeem', { uid:String(uid), orderId:String(orderId), action:String(action) });
  if (ok) setLocalLoyalty(balance);
  return { ok };
}

// ✅ фикс: на бэке оп называется confirmaccrual
export async function confirmAccrualFor(uid, orderId){
  const { ok, balance } = await api('confirmAccrual', { uid:String(uid), orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance);
  return { ok };
}

export async function loyaltyVoidAccrualFor(uid, orderId){
  const { ok, balance } = await api('voidAccrual', { uid:String(uid), orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance);
  return { ok };
}

// NB: accrue — internal-only; будет работать только внутри админ-панели с прокинутым ADMIN_API_TOKEN
export async function accrueOnOrderPlaced(order){
  const uid = String(order.userId || getUID());
  const { ok, balance } = await api('accrue', {
    uid,
    orderId: String(order.id),
    total: Number(order.total||0),
    currency: String(order.currency || 'UZS'),
    shortId: order?.shortId ? String(order.shortId) : null,
  });
  if (ok) setLocalLoyalty(balance);
  return { ok };
}

export async function confirmAccrual(orderId){
  const uid = getUID();
  const { ok, balance } = await api('confirmAccrual', { uid, orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance);
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

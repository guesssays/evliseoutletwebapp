// src/core/loyalty.js
// Центр логики кешбэка/рефералок (клиент) + thin-API к serverless-функции

import { getUID, k } from './state.js';

/* ===== Конфиг программы ===== */
export const CASHBACK_CFG = {
  POINT_IS_SUM: 1,                     // 1 балл = 1 сум
  BASE_RATE: 0.05,                     // 5% базовый кэшбэк
  REF_FIRST_MULTIPLIER: 2,             // x2 кэшбэк (10%) на первый заказ реферала
  REFERRER_EARN_RATE: 0.05,            // 5% рефереру с каждого заказа реферала
  MAX_CART_DISCOUNT_FRAC: 0.30,        // макс. скидка баллами от суммы заказа — 30%
  MIN_REDEEM: 30000,                   // минимум к оплате баллами
  MAX_REDEEM: 150000,                  // максимум к оплате баллами
  PENDING_DELAY_MS: 24 * 60 * 60 * 1000, // обработка (задержка) 24ч
  MONTHLY_REF_LIMIT: 10,               // не более 10 рефералов/мес для 1 пригласившего
};

/* ===== Локальные вспомогательные ключи (перс.) ===== */
const LKEY_BALANCE = 'loyalty_balance';
const LKEY_REDEEM_RES = 'loyalty_redeem_reservations';
const LKEY_REF = 'loyalty_ref';

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
    history:   Array.isArray(obj.history)?obj.history:[]
  }));
}
export function getLocalReservations(){
  try{
    return JSON.parse(localStorage.getItem(k(LKEY_REDEEM_RES)) || '[]');
  }catch{ return []; }
}
export function setLocalReservations(list){
  localStorage.setItem(k(LKEY_REDEEM_RES), JSON.stringify(Array.isArray(list)?list:[]));
}
export function getLocalRef(){
  try{
    return JSON.parse(localStorage.getItem(k(LKEY_REF)) || '{}');
  }catch{ return {}; }
}
export function setLocalRef(obj){
  localStorage.setItem(k(LKEY_REF), JSON.stringify(obj||{}));
}

/* ===== Serverless API ===== */
const API = '/.netlify/functions/loyalty';

async function api(op, body = {}){
  const r = await fetch(API, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ op, ...body })
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data?.ok === false) throw new Error(data?.error || 'loyalty api error');
  return data;
}

/* ===== Публичные методы (клиент) ===== */

/** Получить баланс/историю пользователя с серверной валидацией */
export async function fetchMyLoyalty(){
  const uid = getUID();
  const { balance } = await api('getBalance', { uid });
  setLocalLoyalty(balance);
  return balance;
}

/** Сгенерировать реф-ссылку (через start_param=ref_<uid>) */
export function makeReferralLink(){
  const uid = getUID();
  const base = location.origin + location.pathname + '#/';
  const param = `ref_${uid}`;
  // для Telegram MiniApp дополнительно можно использовать tg.initDataUnsafe.start_param,
  // но на web-версии используем query
  const link = `${base}?start=${encodeURIComponent(param)}`;
  return link;
}

/** Зарегистрировать связь «пригласил/реферал» (антифрод на сервере) */
export async function ensureReferralBound(inviterUid){
  const me = getUID();
  if (!inviterUid || String(inviterUid) === String(me)) return { ok:false, reason:'self' };
  const { ok, reason } = await api('bindReferral', { inviter: String(inviterUid), invitee: String(me) });
  if (ok){ setLocalRef({ inviter: String(inviterUid) }); }
  return { ok, reason };
}

/** Расчёт потенциального кэшбэка за товар (для карточки) */
export function previewEarnForPrice(priceUZS, opts = { refDouble:false }){
  const rate = CASHBACK_CFG.BASE_RATE * (opts.refDouble ? CASHBACK_CFG.REF_FIRST_MULTIPLIER : 1);
  const pts = Math.floor(Number(priceUZS||0) * rate);
  return Math.max(0, pts);
}

/** Допустимое списание для суммы корзины (на основе локального баланса и правил) */
export function computeMaxRedeem(total){
  const bal = getLocalLoyalty();
  const maxByFrac = Math.floor(total * CASHBACK_CFG.MAX_CART_DISCOUNT_FRAC);
  const capByMax  = CASHBACK_CFG.MAX_REDEEM;
  const hardCap   = Math.min(maxByFrac, capByMax);
  const allowed   = Math.min(hardCap, Math.floor(bal.available));
  if (allowed < CASHBACK_CFG.MIN_REDEEM) return 0;
  return allowed;
}

/** Резерв списания (создаёт hold до статуса заказа) */
export async function reserveRedeem(points, orderId){
  const uid = getUID();
  if (!points || points < CASHBACK_CFG.MIN_REDEEM) return { ok:false, reason:'min' };
  const { ok, balance } = await api('reserveRedeem', { uid, pts: Math.floor(points), orderId:String(orderId) });
  if (ok){
    setLocalLoyalty(balance);
    const res = getLocalReservations();
    res.push({ orderId:String(orderId), pts:Math.floor(points), ts:Date.now() });
    setLocalReservations(res);
  }
  return { ok };
}

/** Откат/подтверждение резерва при отмене/завершении */
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

/** Начислить кэшбэк по размещённому заказу (попадает в pending; x2 если первый у реферала; 5% рефереру) */
export async function accrueOnOrderPlaced(order){
  const uid = String(order.userId || getUID());
  const { ok, balance } = await api('accrue', {
    uid,
    orderId: String(order.id),
    total: Number(order.total||0),
    currency: String(order.currency || 'UZS')
  });
  if (ok) setLocalLoyalty(balance);
  return { ok };
}

/** Подтвердить начисление (когда статус 'выдан' ИЛИ прошло 24ч) */
export async function confirmAccrual(orderId){
  const uid = getUID();
  const { ok, balance } = await api('confirmAccrual', { uid, orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance);
  return { ok };
}

/** Получить рефералов/лимиты/статистику для аккаунта */
export async function fetchMyReferrals(){
  const uid = getUID();
  const { data } = await api('getReferrals', { uid });
  return data;
}

/** Админ: расчёт по заказу (для дашборда) */
export async function adminCalcForOrder(orderId){
  const { calc } = await api('adminCalc', { orderId:String(orderId) });
  return calc;
}

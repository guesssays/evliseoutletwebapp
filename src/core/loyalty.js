// src/core/loyalty.js
// Клиентская логика лояльности/рефералок + безопасные вызовы API с TG initData

import { getUID, k } from './state.js';

export const CASHBACK_CFG = {
  POINT_IS_SUM: 1,
  BASE_RATE: 0.05,
  REF_FIRST_MULTIPLIER: 2,
  REFERRER_EARN_RATE: 0.05,
  MAX_CART_DISCOUNT_FRAC: 0.30,
  MIN_REDEEM: 30000,
  MAX_REDEEM: 150000,
  PENDING_DELAY_MS: 24*60*60*1000,
  MONTHLY_REF_LIMIT: 10,
};

export const BOT_USERNAME = 'evliseoutletbot';

const LKEY_BALANCE='loyalty_balance';
const LKEY_REDEEM_RES='loyalty_redeem_reservations';
const LKEY_REF='loyalty_ref';
const LKEY_INVITER='pending_inviter_uid';

function tgInitData(){
  try{ return window?.Telegram?.WebApp?.initData || ''; }catch{ return ''; }
}

/* ===== Local state ===== */
export function getLocalLoyalty(){ try{ const raw=localStorage.getItem(k(LKEY_BALANCE)); return raw?JSON.parse(raw):{available:0,pending:0,history:[]}; }catch{ return {available:0,pending:0,history:[]}; } }
export function setLocalLoyalty(obj){ localStorage.setItem(k(LKEY_BALANCE), JSON.stringify({ available:Number(obj.available||0), pending:Number(obj.pending||0), history:Array.isArray(obj.history)?obj.history:[] })); }
export function getLocalReservations(){ try{ return JSON.parse(localStorage.getItem(k(LKEY_REDEEM_RES))||'[]'); }catch{ return []; } }
export function setLocalReservations(list){ localStorage.setItem(k(LKEY_REDEEM_RES), JSON.stringify(Array.isArray(list)?list:[])); }
export function getLocalRef(){ try{ return JSON.parse(localStorage.getItem(k(LKEY_REF))||'{}'); }catch{ return {}; } }
export function setLocalRef(obj){ localStorage.setItem(k(LKEY_REF), JSON.stringify(obj||{})); }

/* ===== Serverless API with initData header ===== */
const API='/.netlify/functions/loyalty';
async function api(op, body={}){
  const r = await fetch(API, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Tg-Init-Data': tgInitData(),
    },
    body: JSON.stringify({ op, ...body })
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data?.ok===false) throw new Error(data?.error || 'loyalty api error');
  return data;
}

/* ===== Pending inviter ===== */
function setPendingInviter(uid){ try{ if (uid) localStorage.setItem(k(LKEY_INVITER), String(uid)); }catch{} }
function getPendingInviter(){ try{ return localStorage.getItem(k(LKEY_INVITER)); }catch{ return null; } }
function clearPendingInviter(){ try{ localStorage.removeItem(k(LKEY_INVITER)); }catch{} }

/* ===== Public (user) methods — uid НЕ отправляем, сервер берёт его из initData ===== */
export async function fetchMyLoyalty(){
  const { balance } = await api('getBalance');
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
    const sp = window?.Telegram?.WebApp?.initDataUnsafe?.start_param || '';
    if (sp && String(sp).startsWith('ref_')) setPendingInviter(String(sp).slice(4));
    const parse=(qs='')=>{ const p=new URLSearchParams(qs); const s=p.get('start')||''; const r=p.get('ref')||''; if (s && s.startsWith('ref_')) return s.slice(4); if (r) return r; return ''; };
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
  if (!inviterUid) return { ok:false, reason:'bad_inviter' };
  const { ok, reason } = await api('bindReferral', { inviter:String(inviterUid) });
  if (ok) setLocalRef({ inviter:String(inviterUid) });
  return { ok, reason };
}

export function previewEarnForPrice(priceUZS, opts={ refDouble:false }){
  const rate = CASHBACK_CFG.BASE_RATE * (opts.refDouble ? CASHBACK_CFG.REF_FIRST_MULTIPLIER : 1);
  return Math.max(0, Math.floor(Number(priceUZS||0)*rate));
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

export async function reserveRedeem(points, orderId, shortId=null){
  if (!points || points < CASHBACK_CFG.MIN_REDEEM) return { ok:false, reason:'min' };
  const { ok, balance } = await api('reserveRedeem', { pts:Math.floor(points), orderId:String(orderId), shortId: shortId?String(shortId):null });
  if (ok){
    setLocalLoyalty(balance);
    const res = getLocalReservations();
    res.push({ orderId:String(orderId), pts:Math.floor(points), ts:Date.now() });
    setLocalReservations(res);
  }
  return { ok };
}

export async function finalizeRedeem(orderId, action){
  const { ok, balance } = await api('finalizeRedeem', { orderId:String(orderId), action:String(action) });
  if (ok){
    setLocalLoyalty(balance);
    const res = getLocalReservations().filter(r => String(r.orderId)!==String(orderId));
    setLocalReservations(res);
  }
  return { ok };
}

export async function confirmAccrual(orderId){
  const { ok, balance } = await api('confirmAccrual', { orderId:String(orderId) });
  if (ok) setLocalLoyalty(balance);
  return { ok };
}

export async function fetchMyReferrals(){ const { data } = await api('getReferrals'); return data; }

/* ===== Admin/server-only stubs — не вызывать из браузера ===== */
export async function finalizeRedeemFor(uid, orderId, action){ return { ok:false }; }
export async function confirmAccrualFor(uid, orderId){ return { ok:false }; }
export async function loyaltyVoidAccrualFor(uid, orderId){ return { ok:false }; }
export async function accrueOnOrderPlaced(order){ return { ok:true }; }
export async function adminCalcForOrder(orderId){ return null; }

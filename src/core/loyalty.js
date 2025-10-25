// src/core/loyalty.js
// Клиентская обвязка к serverless-функции лояльности + локальные хелперы.
// Отправляем на бэкенд сырое Telegram initData и, для диагностики,
// имя бота через X-Bot-Username (жёстко из константы).

import { getUID, k } from './state.js';

/* =========================== helpers =========================== */

// Сырая строка initData (не initDataUnsafe!), как рекомендует Telegram.
function getTgInitDataRaw() {
  try {
    return typeof window?.Telegram?.WebApp?.initData === 'string'
      ? window.Telegram.WebApp.initData
      : '';
  } catch { return ''; }
}

/* =========================== конфиг =========================== */

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

// Какой бот используется в ссылке-приглашении
export const BOT_USERNAME = 'EvliseOutletBot';

/* ===== заголовки ===== */

// Имя бота для заголовка (жёстко из константы)
function botUnameHeader() {
  const uname = (typeof BOT_USERNAME === 'string' ? BOT_USERNAME : '').replace(/^@/, '');
  return uname ? '@' + uname : '';
}

// Заголовки для запросов: всегда добавляем X-Tg-Init-Data и X-Bot-Username.
function reqHeaders(initData) {
  const h = { 'Content-Type': 'application/json' };
  h['X-Tg-Init-Data'] = String(initData || ''); // fallback
  h['X-Bot-Username'] = botUnameHeader();
  return h;
}

/* ========================= локальное хранилище ========================= */

const LKEY_BALANCE    = 'loyalty_balance';
const LKEY_REDEEM_RES = 'loyalty_redeem_reservations';
const LKEY_REF        = 'loyalty_ref';
const LKEY_INVITER    = 'pending_inviter_uid';

export function getLocalLoyalty() {
  try {
    const raw = localStorage.getItem(k(LKEY_BALANCE));
    const v = raw ? JSON.parse(raw) : {};
    return {
      available: Number(v.available || 0),
      pending:   Number(v.pending   || 0),
      history:   Array.isArray(v.history) ? v.history : [],
    };
  } catch { return { available: 0, pending: 0, history: [] }; }
}

export function setLocalLoyalty(obj) {
  localStorage.setItem(
    k(LKEY_BALANCE),
    JSON.stringify({
      available: Number(obj?.available || 0),
      pending:   Number(obj?.pending   || 0),
      history:   Array.isArray(obj?.history) ? obj.history : [],
    })
  );
}

export function getLocalReservations() {
  try { return JSON.parse(localStorage.getItem(k(LKEY_REDEEM_RES)) || '[]'); }
  catch { return []; }
}
export function setLocalReservations(list) {
  localStorage.setItem(k(LKEY_REDEEM_RES), JSON.stringify(Array.isArray(list) ? list : []));
}

export function getLocalRef() {
  try { return JSON.parse(localStorage.getItem(k(LKEY_REF)) || '{}'); }
  catch { return {}; }
}
export function setLocalRef(obj) {
  localStorage.setItem(k(LKEY_REF), JSON.stringify(obj || {}));
}

/* =========================== сетевой слой =========================== */

const API = '/.netlify/functions/loyalty';
const FETCH_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), Math.max(1, ms));
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

// Операции, для которых нужен admin-token (X-Internal-Auth). Они выполняются
// только в админке/серверных сценариях и не пройдут без токена на бэке.
const ADMIN_OPS = new Set([
  'admincalc',
  'voidaccrual',
  'accrue',
  'confirmaccrual',
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

// Алиасы имён операций → нормализованное имя (которое ждёт бэкенд)
const OP_ALIAS = new Map([
  ['getbalance', 'getbalance'],
  ['getBalance', 'getbalance'],
  ['bindReferral', 'bindreferral'],
  ['bindreferral', 'bindreferral'],
  ['getReferrals', 'getreferrals'],
  ['getreferrals', 'getreferrals'],
  ['reserveRedeem', 'reserveredeem'],
  ['reserveredeem', 'reserveredeem'],
  ['finalizeRedeem', 'finalizeredeem'],
  ['finalizeredeem', 'finalizeredeem'],
  ['accrue', 'accrue'],
  ['confirmAccrual', 'confirmaccrual'],
  ['confirmaccrual', 'confirmaccrual'],
  ['voidAccrual', 'voidaccrual'],
  ['voidaccrual', 'voidaccrual'],
  ['adminCalc', 'admincalc'],
  ['admincalc', 'admincalc'],
]);

function normalizeOp(op) {
  const raw = String(op || '').trim();
  if (!raw) return '';
  if (OP_ALIAS.has(raw)) return OP_ALIAS.get(raw);
  const low = raw.toLowerCase();
  return OP_ALIAS.get(low) || low;
}

async function api(op, body = {}) {
  const norm = normalizeOp(op);
  const initData = getTgInitDataRaw();

  // Блокируем все внешние (не админские) вызовы, если initData пуст.
  // Исключение: админ-операции — но только если реально передан admin-токен.
  const hasAdminToken = !!getAdminToken();
  if (!initData && !(ADMIN_OPS.has(norm) && hasAdminToken)) {
    throw new Error('initData_empty'); // перехватывай по месту вызова и покажи "Откройте приложение через Telegram"
  }

  // Заголовки каждого запроса: X-Tg-Init-Data + X-Bot-Username (fallback)
  const headers = reqHeaders(initData);

  // Для админ-операций добавляем admin header (если есть токен)
  if (ADMIN_OPS.has(norm) && hasAdminToken) {
    headers['X-Internal-Auth'] = getAdminToken();
  }

  // Основной источник — тело запроса: initData (сырой) + дублирование base64
  let initData64 = '';
  try { if (initData) initData64 = btoa(initData); } catch { initData64 = ''; }

  const res = await withTimeout(fetch(API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ op: norm, initData, initData64, ...body }),
  }), FETCH_TIMEOUT_MS);

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.reason || `loyalty api error (HTTP ${res.status})`);
  }
  return data;
}

/* ======================= referrals (приглашения) ======================= */

function setPendingInviter(uid) { try { if (uid) localStorage.setItem(k(LKEY_INVITER), String(uid)); } catch {} }
function getPendingInviter()    { try { return localStorage.getItem(k(LKEY_INVITER)); } catch { return null; } }
function clearPendingInviter()  { try { localStorage.removeItem(k(LKEY_INVITER)); } catch {} }

export function makeReferralLink() {
  const uid = getUID();
  const start = `ref_${uid}`;
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(start)}`;
}

export function captureInviterFromContext() {
  try {
    // a) из Telegram Mini App
    const sp = window?.Telegram?.WebApp?.initDataUnsafe?.start_param || '';
    if (sp && String(sp).startsWith('ref_')) {
      const inviter = String(sp).slice(4);
      if (inviter) setPendingInviter(inviter);
    }
    // b) из обычного веб-URL
    const parse = (searchOrHash = '') => {
      const p = new URLSearchParams(searchOrHash);
      const qpStart = p.get('start') || '';
      const qpRef   = p.get('ref') || '';
      if (qpStart && qpStart.startsWith('ref_')) return qpStart.slice(4);
      if (qpRef) return qpRef;
      return '';
    };
    const qInv = parse((location.search || '').slice(1)) ||
                 parse((location.hash.split('?')[1] || ''));
    if (qInv) setPendingInviter(qInv);
  } catch {}
}

export async function tryBindPendingInviter() {
  const me = getUID();
  const inviter = getPendingInviter();
  if (!inviter || !me || String(inviter) === String(me)) return;
  try {
    const { ok, reason } = await ensureReferralBound(inviter);
    if (ok || reason) clearPendingInviter();
  } catch {}
}

export async function ensureReferralBound(inviterUid) {
  const me = getUID();
  if (!inviterUid || String(inviterUid) === String(me)) return { ok: false, reason: 'self' };
  const { ok, reason } = await api('bindReferral', { inviter: String(inviterUid), invitee: String(me) });
  if (ok) setLocalRef({ inviter: String(inviterUid) });
  return { ok, reason };
}

/* ===================== вычисления на клиенте ===================== */

export function previewEarnForPrice(priceUZS, opts = { refDouble: false }) {
  const rate = CASHBACK_CFG.BASE_RATE * (opts.refDouble ? CASHBACK_CFG.REF_FIRST_MULTIPLIER : 1);
  const pts = Math.floor(Number(priceUZS || 0) * rate);
  return Math.max(0, pts);
}

export function computeMaxRedeem(total) {
  const bal = getLocalLoyalty();
  const maxByFrac = Math.floor(Number(total || 0) * CASHBACK_CFG.MAX_CART_DISCOUNT_FRAC);
  const capByMax  = CASHBACK_CFG.MAX_REDEEM;
  const hardCap   = Math.min(maxByFrac, capByMax);
  const allowed   = Math.min(hardCap, Math.floor(bal.available || 0));
  if (allowed < CASHBACK_CFG.MIN_REDEEM) return 0;
  return allowed;
}

/* =========================== публичные методы =========================== */

export async function fetchMyLoyalty() {
  try {
    const uid = getUID();
    const { balance } = await api('getBalance', { uid });
    setLocalLoyalty(balance || {});
    return balance || getLocalLoyalty();
  } catch {
    return getLocalLoyalty();
  }
}

/** ВАЖНО: добавили параметр `total` — чтобы сервер мог валидировать правило 30%/MAX_REDEEM,
 *  если заказ ещё не создан в сторадже.
 */
export async function reserveRedeem(points, orderId, shortId = null, total = null) {
  const uid = getUID();
  if (!points || points < CASHBACK_CFG.MIN_REDEEM) return { ok: false, reason: 'min' };

  const payload = {
    uid,
    pts: Math.floor(points),
    orderId: String(orderId),
    shortId: shortId ? String(shortId) : null,
  };
  if (total != null) payload.total = Number(total) || 0;

  const { ok, balance } = await api('reserveRedeem', payload);
  if (ok) {
    setLocalLoyalty(balance || {});
    const res = getLocalReservations();
    res.push({ orderId: String(orderId), pts: Math.floor(points), ts: Date.now() });
    setLocalReservations(res);
  }
  return { ok };
}

export async function finalizeRedeem(orderId, action /* 'cancel' | 'commit' */) {
  const uid = getUID();
  const { ok, balance } = await api('finalizeRedeem', { uid, orderId: String(orderId), action: String(action) });
  if (ok) {
    setLocalLoyalty(balance || {});
    const res = getLocalReservations().filter(r => String(r.orderId) !== String(orderId));
    setLocalReservations(res);
  }
  return { ok };
}

// Админские варианты (когда выполняем за другого пользователя)
export async function finalizeRedeemFor(uid, orderId, action) {
  const { ok, balance } = await api('finalizeRedeem', { uid: String(uid), orderId: String(orderId), action: String(action) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}
export async function confirmAccrualFor(uid, orderId) {
  const { ok, balance } = await api('confirmAccrual', { uid: String(uid), orderId: String(orderId) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}
export async function loyaltyVoidAccrualFor(uid, orderId) {
  const { ok, balance } = await api('voidAccrual', { uid: String(uid), orderId: String(orderId) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

// Внутренняя операция — инициировать pending-начисление при создании заказа (админ/сервер)
export async function accrueOnOrderPlaced(order) {
  const uid = String(order.userId || getUID());
  const { ok, balance } = await api('accrue', {
    uid,
    orderId: String(order.id),
    total: Number(order.total || 0),
    currency: String(order.currency || 'UZS'),
    shortId: order?.shortId ? String(order.shortId) : null,
  });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

// Подтверждение начисления пользователем
export async function confirmAccrual(orderId) {
  const uid = getUID();
  const { ok, balance } = await api('confirmAccrual', { uid, orderId: String(orderId) });
  if (ok) setLocalLoyalty(balance || {});
  return { ok };
}

export async function fetchMyReferrals() {
  const uid = getUID();
  const { data } = await api('getReferrals', { uid });
  return data;
}

export async function adminCalcForOrder(orderId) {
  const { calc } = await api('adminCalc', { orderId: String(orderId) });
  return calc;
}

// src/core/loyalty.js
// Клиентская обвязка к serverless-функции лояльности + локальные хелперы.
// Новое: динамический X-Bot-Username из TG, мягкий режим без initData для readonly,
// корректная base64 для Unicode и защита от слишком длинных заголовков.

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

// Безопасная base64 для Unicode-строк
function b64u(str='') {
  try {
    // encodeURIComponent → %XX → unescape → btoa
    return btoa(unescape(encodeURIComponent(String(str))));
  } catch { 
    try { return btoa(String(str)); } catch { return ''; }
  }
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

// Какой бот используется в ссылке-приглашении (fallback, если TG контекст недоступен)
export const BOT_USERNAME = 'EvliseOutletBot';

/* ===== заголовки ===== */

// Имя бота для заголовка: сначала берём из TG, потом из константы
function resolveBotUsername() {
  try {
    const uname = (
      window?.Telegram?.WebApp?.initDataUnsafe?.bot?.username ||
      window?.Telegram?.WebApp?.Bot?.username ||
      BOT_USERNAME ||
      ''
    ).toString().replace(/^@/, '');
    return uname ? '@' + uname : '';
  } catch {
    const uname = (BOT_USERNAME || '').toString().replace(/^@/, '');
    return uname ? '@' + uname : '';
  }
}

// Заголовки для запросов: добавляем X-Bot-Username всегда.
// X-Tg-Init-Data кладём только если не слишком длинный (чтобы не уткнуться в лимиты заголовков).
function reqHeaders(initData) {
  const h = { 'Content-Type': 'application/json' };
  h['X-Bot-Username'] = resolveBotUsername();
  const RAW_HEADER_LIMIT = 4000; // безопасная «софткрышка»
  if (initData && initData.length <= RAW_HEADER_LIMIT) {
    h['X-Tg-Init-Data'] = String(initData);
  }
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

// Операции, для которых нужен admin-token (X-Internal-Auth).
const ADMIN_OPS = new Set([
  'admincalc',
  'voidaccrual',
  'accrue',
  'confirmaccrual',
]);

// Операции, которые можно вызывать без initData (совпадает с серверным readonly)
const READONLY_OPS_WITHOUT_INIT = new Set([
  'getbalance',
  'getreferrals',
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

// Алиасы имён операций → нормализованное имя
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

// для быстрой диагностики в UI/консоли
let __lastInitMeta = { usedHeader: false, sentRawLen: 0, sentB64Len: 0, botUname: '' };
export function getLastInitMeta() { return { ...__lastInitMeta }; }

async function api(op, body = {}) {
  const norm = normalizeOp(op);
  const initData = getTgInitDataRaw();

  const hasAdminToken = !!getAdminToken();
  const canSkipInit =
    READONLY_OPS_WITHOUT_INIT.has(norm) ||
    (ADMIN_OPS.has(norm) && hasAdminToken);

  if (!initData && !canSkipInit) {
    // перехватывай по месту вызова и покажи «Откройте мини-приложение через Telegram»
    const e = new Error('initData_empty');
    e.code = 'initData_empty';
    throw e;
  }

  // Заголовки: X-Bot-Username всегда; X-Tg-Init-Data — если не слишком длинный
  const headers = reqHeaders(initData);

  // Админ-операции: добавляем admin header (если есть токен)
  if (ADMIN_OPS.has(norm) && hasAdminToken) {
    headers['X-Internal-Auth'] = getAdminToken();
  }

  // В тело кладём initData (сырой) и корректный base64-вариант
  const payload = { op: norm, ...body };
  if (initData) {
    payload.initData = initData;
    payload.initData64 = b64u(initData);
  }

  // Диагностика того, что реально отправили
  __lastInitMeta = {
    usedHeader: !!headers['X-Tg-Init-Data'],
    sentRawLen: (payload.initData || '').length,
    sentB64Len: (payload.initData64 || '').length,
    botUname: headers['X-Bot-Username'] || '',
  };

  const res = await withTimeout(fetch(API, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }), FETCH_TIMEOUT_MS);

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false) {
    // разворачиваем дружественные коды
    const reason = data?.error || data?.reason || `loyalty api error (HTTP ${res.status})`;
    const err = new Error(reason);
    if (data?.error === 'bot_mismatch') {
      err.code = 'bot_mismatch';
      err.clientBot = data?.clientBot;
      err.serverBot = data?.serverBot;
    }
    throw err;
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
  return `https://t.me/${(resolveBotUsername() || '').replace('@','')}?start=${encodeURIComponent(start)}`;
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

/** Добавлен параметр `total` — чтобы сервер валидировал правило 30%/MAX_REDEEM,
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

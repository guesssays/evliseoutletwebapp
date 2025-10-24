// src/core/loyaltyAdmin.js
// Админ-вызовы к serverless-функции лояльности (только с internal-token)

import { getAdminToken } from './orders.js';

/** Единственный эндпоинт лояльности */
const ENDPOINT = '/.netlify/functions/loyalty';

/** Берём admin-token (localStorage('admin_api_token') через getAdminToken()) */
function adminToken() {
  return (getAdminToken() || '').toString();
}

/** Нормализуем имя операции — бэкенд ожидает lower-case */
function normalizeOp(op) {
  return String(op || '').trim().toLowerCase();
}

/** Безопасный парс JSON */
async function safeJson(res) {
  try { return await res.json(); } catch { return {}; }
}

/**
 * Базовый вызов admin API
 * @param {string} op - имя операции (будет приведено к lower-case)
 * @param {object} payload - тело запроса
 * @param {object} [opts]
 * @param {number} [opts.timeout=15000] - таймаут в мс
 */
async function call(op, payload = {}, opts = {}) {
  const { timeout = 15000 } = opts;

  const headers = { 'Content-Type': 'application/json' };
  const token = adminToken();
  if (token) headers['X-Internal-Auth'] = token;

  // Защита от подвисаний сети
  const ctrl = new AbortController();
  const tId = setTimeout(() => ctrl.abort(), Math.max(1, timeout));

  let res, data;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ op: normalizeOp(op), ...payload }),
      signal: ctrl.signal,
    });
    data = await safeJson(res);
  } finally {
    clearTimeout(tId);
  }

  if (!res?.ok || data?.ok === false) {
    const status = res?.status ?? 0;
    const msg = data?.error || data?.reason || `loyalty admin api error (HTTP ${status})`;
    throw new Error(msg);
  }
  return data;
}

/* ===================== Публичные admin-вызовы ===================== */

/**
 * Подсчёт итогов по заказу (админский просмотр)
 * @returns {Promise<null|{orderId:string, uid:string, total:number, usedPoints:number, buyerCashback:number, referrer:string|null, referrerBonus:number, pendingReleased:boolean, createdAt:number, releasedAt:number|null, shortId:string|null}>}
 */
export async function adminCalc(orderId) {
  const j = await call('admincalc', { orderId: String(orderId) });
  return j.calc || null;
}

/** Получить баланс пользователя */
export async function getBalance(uid) {
  const j = await call('getbalance', { uid: String(uid) });
  return j.balance || { available: 0, pending: 0, history: [] };
}

/** Подтвердить начисление по заказу (ручной релиз) */
export async function confirmAccrual(uid, orderId) {
  // На бэке оп называется confirmaccrual (lower-case),
  // internal-ветка разрешает указать uid в body.
  const j = await call('confirmaccrual', { uid: String(uid), orderId: String(orderId) });
  return j?.ok !== false;
}

/**
 * Финализировать резерв списания баллов
 * @param {'cancel'|'commit'} action
 */
export async function finalizeRedeem(uid, orderId, action) {
  const act = String(action || '').toLowerCase();
  if (act !== 'cancel' && act !== 'commit') {
    throw new Error("action must be 'cancel' or 'commit'");
  }
  const j = await call('finalizeredeem', { uid: String(uid), orderId: String(orderId), action: act });
  return j?.ok !== false;
}

/** Аннулировать начисления/резервы по заказу (напр., при отмене) */
export async function voidAccrual(orderId, uid = null) {
  const j = await call('voidaccrual', { orderId: String(orderId), ...(uid ? { uid: String(uid) } : {}) });
  return j?.ok !== false;
}

/**
 * (Опционально) Инициировать начисление при создании заказа — internal-only.
 * Удобно вызывать из админки/серверных сценариев.
 */
export async function accrue({ uid, orderId, total, currency = 'UZS', shortId = null }) {
  const j = await call('accrue', {
    uid: String(uid),
    orderId: String(orderId),
    total: Number(total || 0),
    currency: String(currency || 'UZS'),
    shortId: shortId ? String(shortId) : null,
  });
  return j?.ok !== false;
}

export default {
  adminCalc,
  getBalance,
  confirmAccrual,
  finalizeRedeem,
  voidAccrual,
  accrue,
};

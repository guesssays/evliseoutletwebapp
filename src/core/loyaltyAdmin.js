// src/core/loyaltyAdmin.js
// Админ-вызовы к serverless-функции лояльности (только с internal-token)

import { getAdminToken } from './orders.js';

function adminToken() {
  // Единый источник правды — localStorage('admin_api_token') через getAdminToken()
  return (getAdminToken() || '').toString();
}

async function call(op, payload) {
  const headers = { 'Content-Type': 'application/json' };
  const token = adminToken();
  if (token) headers['X-Internal-Auth'] = token;

  const r = await fetch('/.netlify/functions/loyalty', {
    method: 'POST',
    headers,
    body: JSON.stringify({ op, ...payload })
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok === false) {
    const msg = j?.error || j?.reason || 'loyalty admin api error';
    throw new Error(msg);
  }
  return j;
}

export async function adminCalc(orderId) {
  const j = await call('admincalc', { orderId: String(orderId) });
  return j.calc || null;
}

export async function getBalance(uid) {
  const j = await call('getbalance', { uid: String(uid) });
  return j.balance || { available:0, pending:0, history:[] };
}

export async function confirmAccrual(uid, orderId) {
  // На бэке оп называется confirmaccrual (в нижнем регистре),
  // internal-ветка разрешает указать uid в body.
  const j = await call('confirmaccrual', { uid: String(uid), orderId: String(orderId) });
  return j?.ok !== false;
}

export async function finalizeRedeem(uid, orderId, action /* 'cancel' | 'commit' */) {
  const j = await call('finalizeredeem', { uid: String(uid), orderId: String(orderId), action: String(action) });
  return j?.ok !== false;
}

export async function voidAccrual(orderId, uid = null) {
  const j = await call('voidaccrual', { orderId: String(orderId), ...(uid?{uid:String(uid)}:{}) });
  return j?.ok !== false;
}

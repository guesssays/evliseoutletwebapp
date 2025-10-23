// src/core/loyaltyAdmin.js
// Клиент для админ-операций лояльности. Требует, чтобы сервер узнавал админа по initData.

function getTgInitDataRaw(){
  try { return window?.Telegram?.WebApp?.initData || ''; } catch { return ''; }
}

const API = '/.netlify/functions/loyalty';

async function call(op, body = {}){
  const r = await fetch(API, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Tg-Init-Data': getTgInitDataRaw(),
    },
    body: JSON.stringify({ op, ...body })
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.reason || 'loyalty admin api error');
  return j;
}

// ▼ используется в Admin.js
export async function adminCalc(orderId){
  const { calc } = await call('adminCalc', { orderId:String(orderId) });
  return calc || null;
}

export async function getBalance(uid){
  const { balance } = await call('getBalance', { uid:String(uid) });
  return balance || { available:0, pending:0, history:[] };
}

export async function confirmAccrual(uid, orderId){
  const { ok } = await call('confirmAccrualFor', { uid:String(uid), orderId:String(orderId) });
  return ok === true;
}

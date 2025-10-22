// Тонкий клиент к /.netlify/functions/loyalty для нужд админки

const ENDPOINT = '/.netlify/functions/loyalty';

async function call(op, payload = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ op, ...payload })
  });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || data?.ok === false) {
    const msg = data?.error || data?.reason || 'loyalty call failed';
    throw new Error(msg);
  }
  return data;
}

export async function adminCalc(orderId) {
  const r = await call('admincalc', { orderId: String(orderId) });
  return r.calc || null;
}

export async function getBalance(uid) {
  const r = await call('getbalance', { uid: String(uid) });
  return r.balance || { available:0, pending:0, history:[] };
}

export async function confirmAccrual(uid, orderId) {
  // Переводит начисления pending -> available (по пользователю заказа и его инвайтеру)
  const r = await call('confirmaccrual', { uid: String(uid), orderId: String(orderId) });
  return r.balance || null;
}

export async function getReferrals(uid) {
  const r = await call('getreferrals', { uid: String(uid) });
  return r.data || null;
}

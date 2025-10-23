// src/core/loyaltyAdmin.js
// Вызовы админских операций к лояльности (server-side only endpoints).

export async function adminCalc(orderId){
  const r = await fetch('/.netlify/functions/loyalty', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Internal-Auth': window?.ENV?.ADMIN_API_TOKEN || '' // если прокинут через инжект, иначе на прокси-функции
    },
    body: JSON.stringify({ op:'admincalc', orderId:String(orderId) })
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok===false) return null;
  return j.calc || null;
}

export async function getBalance(uid){
  const r = await fetch('/.netlify/functions/loyalty', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Internal-Auth': window?.ENV?.ADMIN_API_TOKEN || ''
    },
    body: JSON.stringify({ op:'getbalance', uid:String(uid) })
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok===false) return null;
  return j.balance || null;
}

export async function confirmAccrual(uid, orderId){
  const r = await fetch('/.netlify/functions/loyalty', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Internal-Auth': window?.ENV?.ADMIN_API_TOKEN || ''
    },
    body: JSON.stringify({ op:'confirmaccrual', uid:String(uid), orderId:String(orderId) })
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok===false) throw new Error(j?.error||'confirm failed');
  return true;
}

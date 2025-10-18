// Централизованные заказы через serverless API + локальные события
// ВАЖНО: все функции асинхронные

export const ORDER_STATUSES = [
  'новый','принят','собирается в китае','вылетел в узб',
  'на таможне','на почте','забран с почты','выдан','отменён',
];

export const STATUS_LABELS = {
  'новый':'В обработке',
  'принят':'Подтверждён',
  'собирается в китае':'Собирается продавцом',
  'вылетел в узб':'Вылетел из Китая',
  'на таможне':'На таможне в Узбекистане',
  'на почте':'В отделении почты',
  'забран с почты':'Получен с почты',
  'выдан':'Выдан',
  'отменён':'Отменён',
};

export function getStatusLabel(k){ return STATUS_LABELS[k] || k; }

const ENDPOINT = '/.netlify/functions/orders';

/* -------- базовые вызовы API -------- */
async function apiGET(params){
  const url = new URL(ENDPOINT, location.origin);
  Object.entries(params||{}).forEach(([k,v])=> url.searchParams.set(k,String(v)));
  const r = await fetch(url.toString(), { method:'GET' });
  const j = await r.json();
  if (!j?.ok) throw new Error(j?.error||'API error');
  return j;
}
async function apiPOST(body){
  const r = await fetch(ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
  const j = await r.json();
  if (!j?.ok) throw new Error(j?.error||'API error');
  return j;
}

/* -------- публичный API -------- */
export async function getOrders(){
  const { orders } = await apiGET({ op:'list' });
  return Array.isArray(orders) ? orders : [];
}
export async function getOrderById(id){
  const { order } = await apiGET({ op:'get', id });
  return order || null;
}
export async function addOrder(order){
  const { id } = await apiPOST({ op:'add', order });
  // локальный сигнал клиенту
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
  return id;
}
export async function acceptOrder(orderId){
  const { order } = await apiPOST({ op:'accept', id: orderId });
  if (order){
    try{
      window.dispatchEvent(new CustomEvent('admin:orderAccepted', {
        detail: { id: order.id, userId: order.userId }
      }));
    }catch{}
  }
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
  return order;
}
export async function cancelOrder(orderId, reason=''){
  const { order } = await apiPOST({ op:'cancel', id: orderId, reason });
  if (order){
    try{
      window.dispatchEvent(new CustomEvent('admin:orderCanceled', {
        detail: { id: order.id, reason: order.cancelReason, userId: order.userId }
      }));
    }catch{}
  }
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
  return order;
}
export async function updateOrderStatus(orderId, status){
  const { order } = await apiPOST({ op:'status', id: orderId, status });
  if (order){
    try{
      window.dispatchEvent(new CustomEvent('admin:statusChanged', {
        detail: { id: order.id, status: order.status, userId: order.userId }
      }));
    }catch{}
  }
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
  return order;
}

/* фильтрация по пользователю */
export async function getOrdersForUser(userId){
  if (!userId) return [];
  const all = await getOrders();
  return all.filter(o => String(o.userId||'') === String(userId));
}

/* демо-сидирование отключено */
export function seedOrdersOnce(){ /* no-op */ }
export function clearAllOrders(){ /* no-op: теперь централизовано */ }

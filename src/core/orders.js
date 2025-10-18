// src/core/orders.js
// Простое локальное хранилище заказов + утилиты для админки/клиента
import { getUID } from './state.js';

const KEY = 'nas_orders';

// === централизованный backend ===
const API_BASE = '/.netlify/functions/orders';

// Небольшой таймаут, чтобы UI не «подвисал» при сетевых проблемах
const FETCH_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = FETCH_TIMEOUT_MS){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

async function apiGetList(){
  try{
    const res = await withTimeout(fetch(`${API_BASE}?op=list`, { method:'GET' }));
    const data = await res.json();
    if (res.ok && data?.ok && Array.isArray(data.orders)) return data.orders;
    throw new Error('bad response');
  }catch(e){
    // оффлайн/фолбэк — вернём локальный кэш
    return getOrdersLocal();
  }
}
async function apiGetOne(id){
  try{
    const res = await withTimeout(fetch(`${API_BASE}?op=get&id=${encodeURIComponent(id)}`, { method:'GET' }));
    const data = await res.json();
    if (res.ok && data?.ok) return data.order || null;
    return null;
  }catch{ return null; }
}
async function apiPost(op, body){
  const res = await withTimeout(fetch(API_BASE, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ op, ...body })
  }));
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'api error');
  return data;
}

/**
 * Статусы (ключи)
 */
export const ORDER_STATUSES = [
  'новый',
  'принят',
  'собирается в китае',
  'вылетел в узб',
  'на таможне',
  'на почте',
  'забран с почты',
  'выдан',
  'отменён',
];

/** Отображаемые названия */
export const STATUS_LABELS = {
  'новый':                 'В обработке',
  'принят':                'Подтверждён',
  'собирается в китае':    'Собирается продавцом',
  'вылетел в узб':         'Вылетел из Китая',
  'на таможне':            'На таможне в Узбекистане',
  'на почте':              'В отделении почты',
  'забран с почты':        'Получен с почты',
  'выдан':                 'Выдан',
  'отменён':               'Отменён',
};

export function getStatusLabel(statusKey){
  return STATUS_LABELS[statusKey] || String(statusKey || '');
}

/** Этапы, доступные администратору */
export const ADMIN_STAGE_OPTIONS = [
  'принят',
  'собирается в китае',
  'вылетел в узб',
  'на таможне',
  'на почте',
  'забран с почты',
  'выдан',
];

// ======== ЛОКАЛЬНЫЙ КЭШ ========
function getOrdersLocal(){
  try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch{ return []; }
}
function setOrdersLocal(list){
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Сохранить и уведомить UI */
export function saveOrders(list){
  setOrdersLocal(list);
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
}

/** Тихо заменить кэш */
function replaceOrdersCacheSilently(list){
  setOrdersLocal(list);
}

/** Полная очистка (на всякий случай) */
export function clearAllOrders(){
  try{
    localStorage.removeItem(KEY);
    try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
  }catch{}
}

function writeHistory(order, status, extra = {}){
  const rec = { ts: Date.now(), status, ...extra };
  order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
}

// ======== СЕРВЕР-ПЕРВЫЕ API (с фолбэком) ========

export async function getOrders(){
  const list = await apiGetList();
  replaceOrdersCacheSilently(list);
  return list;
}

export async function addOrder(order){
  const idLocal = order.id ?? String(Date.now());
  const now = Date.now();
  const initialStatus = order.status ?? 'новый';

  const safeUserId = order.userId ?? getUID() ?? null;

  const next = {
    id: idLocal,
    userId: safeUserId,
    username: order.username ?? '',
    productId: order.productId ?? null,
    size: order.size ?? null,
    color: order.color ?? null,
    link: order.link ?? (order.productId ? `#/product/${order.productId}` : ''),
    cart: Array.isArray(order.cart) ? order.cart : [],
    total: Number(order.total || 0),
    address: typeof order.address === 'string' ? order.address : (order.address?.address || ''),
    phone: order.phone ?? '',
    payerFullName: order.payerFullName ?? '',
    paymentScreenshot: order.paymentScreenshot ?? '',
    status: initialStatus,
    accepted: !!order.accepted,
    canceled: !!order.canceled,
    cancelReason: order.cancelReason || '',
    canceledAt: order.canceledAt || null,
    completedAt: order.completedAt || null,
    createdAt: order.createdAt ?? now,
    currency: order.currency || 'UZS',
    history: order.history ?? [{ ts: now, status: initialStatus }],
  };

  try{
    const { id } = await apiPost('add', { order: next });
    try{
      const fresh = await apiGetList();
      replaceOrdersCacheSilently(fresh);
    }catch{
      const list = getOrdersLocal();
      saveOrders([next, ...list]);
    }
    return id || next.id;
  }catch{
    const list = getOrdersLocal();
    saveOrders([next, ...list]);
    return next.id;
  }
}

export async function getOrdersForUser(userId){
  const list = await getOrders();
  if (!userId) return [];
  return list.filter(o => String(o.userId||'') === String(userId));
}

export async function acceptOrder(orderId){
  try{
    await apiPost('accept', { id: String(orderId) });
    const one = await apiGetOne(orderId);
    if (one){
      const list = getOrdersLocal();
      const i = list.findIndex(o => String(o.id) === String(orderId));
      if (i>-1) list[i] = one; else list.unshift(one);
      replaceOrdersCacheSilently(list);
    }else{
      const fresh = await apiGetList();
      replaceOrdersCacheSilently(fresh);
    }
  }catch{
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(orderId));
    if (i === -1) return;
    const o = list[i];
    if (o.status !== 'новый' || o.canceled) return;
    o.accepted = true;
    o.status = 'принят';
    writeHistory(o, 'принят');
    saveOrders(list);
    return;
  }
  saveOrders(getOrdersLocal());
}

export async function cancelOrder(orderId, reason = ''){
  try{
    await apiPost('cancel', { id: String(orderId), reason: String(reason||'') });
    const one = await apiGetOne(orderId);
    if (one){
      const list = getOrdersLocal();
      const i = list.findIndex(o => String(o.id) === String(orderId));
      if (i>-1) list[i] = one; else list.unshift(one);
      replaceOrdersCacheSilently(list);
    }else{
      const fresh = await apiGetList();
      replaceOrdersCacheSilently(fresh);
    }
  }catch{
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(orderId));
    if (i === -1) return;
    const o = list[i];
    if (o.status !== 'новый') return;
    o.canceled = true;
    o.cancelReason = String(reason || '').trim();
    o.canceledAt = Date.now();
    o.accepted = false;
    o.status = 'отменён';
    writeHistory(o, 'отменён', { comment: o.cancelReason });
    saveOrders(list);
    return;
  }
  saveOrders(getOrdersLocal());
}

export async function updateOrderStatus(orderId, status){
  if (!ORDER_STATUSES.includes(status)) return;

  try{
    await apiPost('status', { id:String(orderId), status:String(status) });
    const one = await apiGetOne(orderId);
    if (one){
      const list = getOrdersLocal();
      const i = list.findIndex(o => String(o.id) === String(orderId));
      if (i>-1) list[i] = one; else list.unshift(one);
      replaceOrdersCacheSilently(list);
    }else{
      const fresh = await apiGetList();
      replaceOrdersCacheSilently(fresh);
    }
  }catch{
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(orderId));
    if (i === -1) return;
    const o = list[i];
    if (o.status === 'новый') return;
    if (o.status === 'отменён' || o.canceled) return;
    o.status = status;
    if (!o.accepted && status !== 'отменён') o.accepted = true;
    if (status === 'выдан'){ o.completedAt = Date.now(); }
    writeHistory(o, status);
    saveOrders(list);
    return;
  }

  saveOrders(getOrdersLocal());
}

export function markCompleted(orderId){
  updateOrderStatus(orderId, 'выдан');
}

/* Демосидирование отключено */
export function seedOrdersOnce(){ /* no-op */ }

// src/core/orders.js

// Простое локальное хранилище заказов + утилиты для админки/клиента
import { getUID } from './state.js';
// ▼ Лояльность
import {
  accrueOnOrderPlaced,
  finalizeRedeem as loyaltyFinalizeRedeem,      // для клиента (own uid)
  confirmAccrual as loyaltyConfirmAccrual,      // для клиента (own uid)
  finalizeRedeemFor as loyaltyFinalizeRedeemFor, // ⬅ для конкретного uid (админ-выдача/отмена)
  confirmAccrualFor as loyaltyConfirmAccrualFor, // ⬅ для конкретного uid (админ-выдача)
  loyaltyVoidAccrualFor,                         // ⬅ НОВОЕ: погасить pending-начисления по заказу
} from './loyalty.js';

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

/* ===================== КАНОНИЗАЦИЯ СТАТУСОВ ===================== */
function canonStatus(s = ''){
  const x = String(s || '').trim().toLowerCase();
  // любые варианты "отменен" → "отменён"
  if (x === 'отменен') return 'отменён';
  return x || 'новый';
}

function normalizeOrder(o = {}){
  // привести статус к канону
  o.status = canonStatus(o.status || 'новый');

  // если сервер вернул canceled: true — форсируем статус «отменён»
  if (o.canceled) {
    o.status = 'отменён';
    o.accepted = false;
  }
  return o;
}
/* =============================================================== */

async function apiGetList(){
  try{
    const res = await withTimeout(fetch(`${API_BASE}?op=list`, { method:'GET' }));
    const data = await res.json();
    if (res.ok && data?.ok && Array.isArray(data.orders)) return data.orders.map(normalizeOrder);
    throw new Error('bad response');
  }catch(e){
    // оффлайн/фолбэк — вернём локальный кэш
    return getOrdersLocal().map(normalizeOrder);
  }
}
async function apiGetOne(id){
  try{
    const res = await withTimeout(fetch(`${API_BASE}?op=get&id=${encodeURIComponent(id)}`, { method:'GET' }));
    const data = await res.json();
    if (res.ok && data?.ok) return data.order ? normalizeOrder(data.order) : null;
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
  // подстрахуемся, если где-то обращение идёт напрямую без canonStatus:
  'отменен':               'Отменён',
};

export function getStatusLabel(statusKey){
  const key = canonStatus(statusKey);
  return STATUS_LABELS[key] || String(key || '');
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
  setOrdersLocal((list||[]).map(normalizeOrder));
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
}

/** Тихо заменить кэш */
function replaceOrdersCacheSilently(list){
  setOrdersLocal((list||[]).map(normalizeOrder));
}

/** Полная очистка (на всякий случай) */
export function clearAllOrders(){
  try{
    localStorage.removeItem(KEY);
    try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
  }catch{}
}

function writeHistory(order, status, extra = {}){
  const rec = { ts: Date.now(), status: canonStatus(status), ...extra };
  order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
}

// ======== СЕРВЕР-ПЕРВЫЕ API (с фолбэком) ========

export async function getOrders(){
  const list = await apiGetList();
  const local = getOrdersLocal();
  // Страховка: если сервер по какой-то причине вернул пусто, а локально есть данные — не затираем.
  if (Array.isArray(list) && list.length === 0 && Array.isArray(local) && local.length > 0){
    return local.map(normalizeOrder);
  }
  replaceOrdersCacheSilently(list);
  return list.map(normalizeOrder);
}

export async function addOrder(order){
  const idLocal = order.id ?? String(Date.now());
  const now = Date.now();
  const initialStatus = canonStatus(order.status ?? 'новый');

  const safeUserId = order.userId ?? getUID() ?? null;

  const next = normalizeOrder({
    id: idLocal,
    userId: safeUserId,
    username: order.username ?? '',
    productId: order.productId ?? null,
    size: order.size ?? null,
    color: order.color ?? null,
    link: order.link ?? (order.productId ? `#/product/${order.productId}` : ''),
    cart: Array.isArray(order.cart) ? order.cart : [],
    total: Number(order.total || 0), // ВНИМАНИЕ: это "к оплате" (после списания)
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
  });

  let createdId = next.id;

  try{
    const { id } = await apiPost('add', { order: next });
    createdId = id || next.id;
    try{
      const fresh = await apiGetList();
      replaceOrdersCacheSilently(fresh);
    }catch{
      const list = getOrdersLocal();
      saveOrders([next, ...list]);
    }
  }catch{
    const list = getOrdersLocal();
    saveOrders([next, ...list]);
  }

  // ▼ Начисления (pending) — даже если баллы не списывались
  try { await accrueOnOrderPlaced({ ...next, id: createdId }); } catch {}

  return createdId;
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
    if (canonStatus(o.status) !== 'новый' || o.canceled) return;
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
    if (canonStatus(o.status) !== 'новый') return;
    o.canceled = true;
    o.cancelReason = String(reason || '').trim();
    o.canceledAt = Date.now();
    o.accepted = false;
    o.status = 'отменён';
    writeHistory(o, 'отменён', { comment: o.cancelReason });
    saveOrders(list);
  }

  // ▼ НОВОЕ: корректное гашение лояльности именно по UID покупателя (а не текущего администратора)
  try {
    const list = getOrdersLocal();
    const cur  = list.find(o => String(o.id) === String(orderId));
    const uid  = String(cur?.userId || '');

    if (uid) {
      // 1) Откатить резерв списания (если был)
      try { await loyaltyFinalizeRedeemFor(uid, orderId, 'cancel'); } catch {}
      // 2) Погасить pending-начисления (покупатель + реферер — на бэке)
      try { await loyaltyVoidAccrualFor(uid, orderId); } catch {}
    } else {
      // безопасный фолбэк — откат по текущему пользователю
      try { await loyaltyFinalizeRedeem(orderId, 'cancel'); } catch {}
    }
  } catch {}

  saveOrders(getOrdersLocal());
}

export async function updateOrderStatus(orderId, status){
  const stCanon = canonStatus(status);
  if (!ORDER_STATUSES.includes(stCanon)) return;

  let updatedOrder = null;

  try{
    await apiPost('status', { id:String(orderId), status:String(stCanon) });
    const one = await apiGetOne(orderId);
    if (one){
      updatedOrder = one;
      const list = getOrdersLocal();
      const i = list.findIndex(o => String(o.id) === String(orderId));
      if (i>-1) list[i] = one; else list.unshift(one);
      replaceOrdersCacheSilently(list);
    }else{
      const fresh = await apiGetList();
      replaceOrdersCacheSilently(fresh);
      updatedOrder = fresh.find(o => String(o.id)===String(orderId)) || null;
    }
  }catch{
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(orderId));
    if (i === -1) return;
    const o = list[i];
    const cur = canonStatus(o.status);
    if (cur === 'новый') return;
    if (cur === 'отменён' || o.canceled) return;
    o.status = stCanon;
    if (!o.accepted && stCanon !== 'отменён') o.accepted = true;
    if (stCanon === 'выдан'){ o.completedAt = Date.now(); }
    writeHistory(o, stCanon);
    saveOrders(list);
    updatedOrder = o;
  }

  // ▼ При выдаче — коммитим резервы и подтверждаем начисления ДЛЯ ПОКУПАТЕЛЯ
  if (stCanon === 'выдан'){
    const uid = String(updatedOrder?.userId || '');
    if (uid){
      try { await loyaltyFinalizeRedeemFor(uid, orderId, 'commit'); } catch {}
      try { await loyaltyConfirmAccrualFor(uid, orderId); } catch {}
    }else{
      // безопасный фолбэк (на случай отсутствия uid) — по текущему пользователю
      try { await loyaltyFinalizeRedeem(orderId, 'commit'); } catch {}
      try { await loyaltyConfirmAccrual(orderId); } catch {}
    }
  }

  saveOrders(getOrdersLocal());
}

export function markCompleted(orderId){
  updateOrderStatus(orderId, 'выдан');
}

/* Демосидирование отключено */
export function seedOrdersOnce(){ /* no-op */ }

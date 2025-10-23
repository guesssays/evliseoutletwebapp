// src/core/orders.js

// Простое локальное хранилище заказов + утилиты для админки/клиента
import { getUID } from './state.js';
// ▼ Бот-уведомления (со shortId)
import { notifyStatusChanged } from './botNotify.js';

const KEY = 'nas_orders';

// === централизованный backend ===
const API_BASE = '/.netlify/functions/orders';

// Небольшой таймаут, чтобы UI не «подвисал» при сетевых проблемах
const FETCH_TIMEOUT_MS = 10000;

// --- админ-операции, которые требуют internal-токен на сервере
const ADMIN_OPS = new Set(['accept', 'cancel', 'status']);

/* ===================== ADMIN TOKEN (клиент) ===================== */
// Где берём токен:
//  1) window.__ADMIN_API_TOKEN__ (можно положить в index.html админки),
//  2) localStorage('admin_api_token') — если вы логините админа в UI,
//  3) window.ADMIN_API_TOKEN (вдруг так удобнее).
export function setAdminToken(token = '') {
  try { localStorage.setItem('admin_api_token', String(token || '')); } catch {}
}
export function getAdminToken() {
  try {
    return (
      (typeof window !== 'undefined' && (window.__ADMIN_API_TOKEN__ || window.ADMIN_API_TOKEN)) ||
      localStorage.getItem('admin_api_token') ||
      ''
    );
  } catch {
    return '';
  }
}
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

let __lastStoreKind = 'unknown';

async function apiGetList(){
  try{
    const res = await withTimeout(fetch(`${API_BASE}?op=list`, { method:'GET' }));
    const data = await res.json();
    if (res.ok && data?.ok && Array.isArray(data.orders)) {
      __lastStoreKind = data?.meta?.store || 'unknown';
      return data.orders.map(normalizeOrder);
    }
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
  // добавим internal-токен для админских операций, если доступен на клиенте
  const headers = { 'Content-Type': 'application/json' };
  if (ADMIN_OPS.has(op)) {
    const token = getAdminToken();
    if (token) headers['X-Internal-Auth'] = token;
  }
  const res = await withTimeout(fetch(API_BASE, {
    method:'POST',
    headers,
    body: JSON.stringify({ op, ...body })
  }));
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'api error');
  return data;
}

/* ===== utils для безопасного обновления локального кэша ===== */

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

/** Слияние списков по id, с приоритетом свежих данных и сортировкой по createdAt desc */
function mergeById(oldList = [], fresh = []){
  const map = new Map(oldList.map(o => [String(o.id), o]));
  for (const o of fresh) map.set(String(o.id), o);
  return Array.from(map.values()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}

/* ===================== Публичные API ===================== */

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
  // подстрахуемся
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

// ======== СЕРВЕР-ПЕРВЫЕ API (с фолбэком) ========

export async function getOrders(){
  const list = await apiGetList();
  const local = getOrdersLocal();
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
    shortId: order.shortId ?? order.code ?? null,   // ⬅️ сохраняем короткий номер и на клиенте
    userId: safeUserId,
    username: order.username ?? '',
    productId: order.productId ?? null,
    size: order.size ?? null,
    color: order.color ?? null,
    link: order.link ?? (order.productId ? `#/product/${order.productId}` : ''),
    cart: Array.isArray(order.cart) ? order.cart : [],
    total: Number(order.total || 0), // к оплате (после списания)
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
      const localBefore = getOrdersLocal();
      const nextList =
        (__lastStoreKind === 'memory' || fresh.length < localBefore.length)
          ? mergeById(localBefore, fresh)
          : fresh;
      replaceOrdersCacheSilently(nextList);
    }catch{
      const list = getOrdersLocal();
      saveOrders([next, ...list]);
    }
  }catch{
    const list = getOrdersLocal();
    saveOrders([next, ...list]);
  }

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
      const localBefore = getOrdersLocal();
      const nextList =
        (__lastStoreKind === 'memory' || fresh.length < localBefore.length)
          ? mergeById(localBefore, fresh)
          : fresh;
      replaceOrdersCacheSilently(nextList);
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
      const localBefore = getOrdersLocal();
      const nextList =
        (__lastStoreKind === 'memory' || fresh.length < localBefore.length)
          ? mergeById(localBefore, fresh)
          : fresh;
      replaceOrdersCacheSilently(nextList);
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

  // ❗️Клиент больше НЕ трогает лояльность — всё делает сервер в orders.js
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
      const localBefore = getOrdersLocal();
      const nextList =
        (__lastStoreKind === 'memory' || fresh.length < localBefore.length)
          ? mergeById(localBefore, fresh)
          : fresh;
      replaceOrdersCacheSilently(nextList);
      updatedOrder = nextList.find(o => String(o.id)===String(orderId)) || null;
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

  // ▼ Бот-уведомление со shortId (без принудительного chat_id здесь)
  try {
    notifyStatusChanged(null, {
      orderId: updatedOrder?.id,
      shortId: updatedOrder?.shortId ?? null,
      title: updatedOrder?.cart?.[0]?.title || updatedOrder?.title || ''
    });
  } catch {}

  // ❗️Лояльность коммит/отмена и подтверждение начислений — теперь ТОЛЬКО на сервере.
  saveOrders(getOrdersLocal());
}

/* Демосидирование отключено */
export function seedOrdersOnce(){ /* no-op */ }

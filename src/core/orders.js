// src/core/orders.js
// Простое локальное хранилище заказов + утилиты для админки/клиента
import { getUID } from './state.js';

const KEY = 'nas_orders';

// === NEW: централизованный backend ===
const API_BASE = '/.netlify/functions/orders';

async function apiGetList(){
  try{
    const res = await fetch(`${API_BASE}?op=list`, { method:'GET' });
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
    const res = await fetch(`${API_BASE}?op=get&id=${encodeURIComponent(id)}`, { method:'GET' });
    const data = await res.json();
    if (res.ok && data?.ok) return data.order || null;
    return null;
  }catch{ return null; }
}
async function apiPost(op, body){
  const res = await fetch(API_BASE, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ op, ...body })
  });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'api error');
  return data;
}

/**
 * Внутренние ключи статусов (не менять — завязаны сохранённые заказы).
 * Отображаемые названия берутся из STATUS_LABELS.
 *
 * - 'новый'                 — стартовый
 * - 'принят'                — подтверждён
 * - 'собирается в китае'    — сборка в Китае
 * - 'вылетел в узб'         — отгружен из Китая
 * - 'на таможне'            — на таможне
 * - 'на почте'              — в отделении почты
 * - 'забран с почты'        — получен с почты
 * - 'выдан'                 — выдан
 * - 'отменён'               — отменён
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

/** Отображаемые названия для всех экранов/уведомлений (единый источник правды) */
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

/** Утилита получения «человеческого» названия статуса */
export function getStatusLabel(statusKey){
  return STATUS_LABELS[statusKey] || String(statusKey || '');
}

/**
 * Этапы, доступные к выбору ТОЛЬКО после принятия.
 * (ключи, не отображаемые названия)
 */
export const ADMIN_STAGE_OPTIONS = [
  'принят',
  'собирается в китае',
  'вылетел в узб',
  'на таможне',
  'на почте',
  'забран с почты',
  'выдан',
];

// ======== ЛОКАЛЬНЫЙ КЭШ (оставляем как было) ========
function getOrdersLocal(){
  try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch{ return []; }
}
function setOrdersLocal(list){
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** 
 * Сохранить заказы в локальный кэш и уведомить UI.
 * Используйте ТОЛЬКО когда действительно меняете данные, чтобы не вызвать лишние перерисовки.
 */
export function saveOrders(list){
  setOrdersLocal(list);
  // общее событие для перерисовок
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
}

/** Тихое обновление кэша (без события) — для чтения/синхронизации */
function replaceOrdersCacheSilently(list){
  setOrdersLocal(list);
}

/** Полная очистка всех заказов (для миграции/сброса) */
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

// ======== СЕРВЕР-ПЕРВЫЕ API (с фолбэком в локальный кэш) ========

/** Получить ВСЕ заказы (для админки) — теперь с сервера.
 *  ВАЖНО: не эмитим orders:updated здесь, чтобы не ловить циклы перерисовки.
 */
export async function getOrders(){
  const list = await apiGetList();
  // поддержим локальный кэш для офлайна/быстрых перерисовок — БЕЗ события
  replaceOrdersCacheSilently(list);
  return list;
}

/** Добавить заказ (сервер-первый, возвращает id) */
export async function addOrder(order){
  const idLocal = order.id ?? String(Date.now());
  const now = Date.now();
  const initialStatus = order.status ?? 'новый';

  // КРИТИЧЕСКИЙ ФИКС: userId всегда задаём через getUID() при отсутствии
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

  // 1) Пытаемся отправить на сервер
  try{
    const { id } = await apiPost('add', { order: next });
    // после успешной записи — актуализируем локальный кэш из сервера (тихо)
    try{
      const fresh = await apiGetList();
      replaceOrdersCacheSilently(fresh);
    }catch{
      // если не вышло — хотя бы добавим локально и уведомим UI
      const list = getOrdersLocal();
      saveOrders([next, ...list]);
    }
    return id || next.id;
  }catch{
    // 2) оффлайн/ошибка — добавим локально и уведомим UI, админ увидит после онлайна
    const list = getOrdersLocal();
    saveOrders([next, ...list]);
    return next.id;
  }
}

/** Выборка заказов конкретного пользователя */
export async function getOrdersForUser(userId){
  const list = await getOrders();
  if (!userId) return [];
  return list.filter(o => String(o.userId||'') === String(userId));
}

/** Принять «новый» заказ */
export async function acceptOrder(orderId){
  try{
    await apiPost('accept', { id: String(orderId) });
    // синхронизируем кэш — БЕЗ события
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
    // фолбэк: локально
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(orderId));
    if (i === -1) return;
    const o = list[i];
    if (o.status !== 'новый' || o.canceled) return;

    o.accepted = true;
    o.status = 'принят';
    writeHistory(o, 'принят');
    saveOrders(list); // локально изменили — уведомим UI
    return;
  }

  // после серверной операции самим уведомим UI одним событием
  saveOrders(getOrdersLocal());
}

/** Отменить «новый» заказ с комментарием (виден клиенту) */
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
    // фолбэк локально
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

  // синхронизировали с сервером — уведомим UI единым событием
  saveOrders(getOrdersLocal());
}

/** Обновить статус уже принятого заказа */
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
    // локальный фолбэк
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(orderId));
    if (i === -1) return;
    const o = list[i];

    if (o.status === 'новый') return; // сначала accept/cancel
    if (o.status === 'отменён' || o.canceled) return;

    o.status = status;
    if (!o.accepted && status !== 'отменён') o.accepted = true;

    if (status === 'выдан'){
      o.completedAt = Date.now();
    }
    writeHistory(o, status);
    saveOrders(list);
    return;
  }

  // после серверной операции — одно событие на UI
  saveOrders(getOrdersLocal());
}

/** Быстрая финализация */
export function markCompleted(orderId){
  updateOrderStatus(orderId, 'выдан');
}

/* ===== Демосидирование отключено ===== */
export function seedOrdersOnce(){ /* no-op */ }

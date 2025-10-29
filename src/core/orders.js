// src/core/orders.js
// Работа с заказами: клиент → сервер (remote-first) + локальный кэш.
// Также включает admin token-хэндлинг и «лёгкий» список без paymentScreenshot.
// Полный заказ (с чеком) подтягиваем по запросу getOrderById(id).

import { getUID } from './state.js';
import { notifyStatusChanged } from './botNotify.js'; // если файла нет — можно убрать импорт

const KEY = 'nas_orders';
const API_BASE = '/.netlify/functions/orders';
const FETCH_TIMEOUT_MS = 10000;
const ADMIN_OPS = new Set(['accept', 'cancel', 'status']);

/* ===== Admin token ===== */
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

/* ===== Telegram initData ===== */
function getTgInitData() {
  try {
    const raw =
      (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ||
      '';
    return String(window?.__TG_INIT_DATA__ || raw || '').trim();
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

/* ===== Канонизация статусов ===== */
function canonStatus(s = ''){
  const x = String(s || '').trim().toLowerCase();
  if (x === 'отменен') return 'отменён';
  return x || 'новый';
}
function normalizeOrder(o = {}){
  o.status = canonStatus(o.status || 'новый');
  if (o.canceled) { o.status = 'отменён'; o.accepted = false; }
  return o;
}

let __lastStoreKind = 'unknown';

/* ===== Базовые заголовки для API ===== */
function baseHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const initData = getTgInitData();
  if (initData) headers['X-Tg-Init-Data'] = initData; // для серверной привязки uid
  return headers;
}

/* ===== API low-level ===== */
async function apiGetList(){
  try{
    // Лёгкая выдача: сервер не присылает paymentScreenshot
    const url = `${API_BASE}?op=list&light=1&limit=500&ts=${Date.now()}`;
    const res = await withTimeout(fetch(url, {
      method: 'GET',
      headers: { ...baseHeaders(), 'Cache-Control':'no-store' }
    }));
    const data = await res.json();
    if (res.ok && data?.ok && Array.isArray(data.orders)) {
      __lastStoreKind = data?.meta?.store || 'unknown';
      return data.orders.map(normalizeOrder);
    }
    throw new Error('bad response');
  }catch(e){
    return getOrdersLocal().map(normalizeOrder);
  }
}
async function apiGetOne(id){
  try{
    const res = await withTimeout(fetch(`${API_BASE}?op=get&id=${encodeURIComponent(id)}&ts=${Date.now()}`, {
      method:'GET',
      headers: { ...baseHeaders(), 'Cache-Control':'no-store' }
    }));
    const data = await res.json();
    if (res.ok && data?.ok) return data.order ? normalizeOrder(data.order) : null;
    return null;
  }catch{ return null; }
}
async function apiPost(op, body){
  const headers = baseHeaders();
  // Админские операции — добавляем внутренний токен
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

/* ===== Local cache ===== */
function getOrdersLocal(){
  try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch{ return []; }
}
function setOrdersLocal(list){
  localStorage.setItem(KEY, JSON.stringify(list));
}
export function saveOrders(list){
  setOrdersLocal((list||[]).map(normalizeOrder));
  try{ window.dispatchEvent(new CustomEvent('orders:updated')); }catch{}
}
function replaceOrdersCacheSilently(list){
  setOrdersLocal((list||[]).map(normalizeOrder));
}
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
function mergeById(oldList = [], fresh = []){
  const map = new Map(oldList.map(o => [String(o.id), o]));
  for (const o of fresh) map.set(String(o.id), o);
  return Array.from(map.values()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}

/* ===== Публичные ===== */
export const ORDER_STATUSES = [
  'новый','принят','собирается в китае','вылетел в узб','на таможне','на почте','забран с почты','выдан','отменён',
];
export const STATUS_LABELS = {
  'новый':'В обработке','принят':'Подтверждён','собирается в китае':'Собирается продавцом',
  'вылетел в узб':'Вылетел из Китая','на таможне':'На таможне в Узбекистане','на почте':'В отделении почты',
  'забран с почты':'Получен с почты','выдан':'Выдан','отменён':'Отменён','отменен':'Отменён',
};
export function getStatusLabel(statusKey){
  const key = canonStatus(statusKey);
  return STATUS_LABELS[key] || String(key || '');
}
export const ADMIN_STAGE_OPTIONS = ['принят','собирается в китае','вылетел в узб','на таможне','на почте','забран с почты','выдан'];

/* ====== Server-first ====== */
export async function getOrders(){
  const list = await apiGetList();
  const local = getOrdersLocal();
  if (Array.isArray(list) && list.length === 0 && Array.isArray(local) && local.length > 0){
    return local.map(normalizeOrder);
  }
  replaceOrdersCacheSilently(list);
  return list.map(normalizeOrder);
}

/**
 * Точечная подгрузка полного заказа.
 * Возвращает объект с paymentScreenshot (если он есть).
 * По умолчанию обновляет локальный кэш этой записью.
 */
export async function getOrderById(id, { updateCache = true } = {}) {
  const one = await apiGetOne(id);
  if (one && updateCache) {
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(id));
    if (i > -1) list[i] = one; else list.unshift(one);
    replaceOrdersCacheSilently(list);
  }
  return one;
}

// === ДОБАВЬ это в src/core/orders.js ===
// Получить полный заказ по id (с paymentScreenshot) и обновить локальный кэш этой записи
export async function getOrderById(id, { updateCache = true } = {}) {
  const one = await apiGetOne(id);
  if (updateCache && one) {
    const list = getOrdersLocal();
    const i = list.findIndex(o => String(o.id) === String(id));
    if (i > -1) list[i] = one; else list.unshift(one);
    replaceOrdersCacheSilently(list);
  }
  return one;
}


export async function addOrder(order){
  const idLocal = order.id ?? String(Date.now());
  const now = Date.now();
  const initialStatus = canonStatus(order.status ?? 'новый');

  // Сервер всё равно проверит X-Tg-Init-Data и uid, но на клиенте не даём оформить «гостевой»
  const safeUserId = order.userId ?? getUID() ?? null;
  if (!safeUserId) {
    const err = new Error('Требуется авторизация через Telegram. Откройте приложение внутри Telegram.');
    throw err;
  }

  const next = normalizeOrder({
    id: idLocal,
    shortId: order.shortId ?? order.code ?? null,
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
  let updated = null;
  try{
    const { order } = await apiPost('accept', { id: String(orderId) });
    updated = order || null;
    const one = updated || await apiGetOne(orderId);
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
    if (i !== -1) {
      const o = list[i];
      if (canonStatus(o.status) === 'новый' && !o.canceled) {
        o.accepted = true; o.status = 'принят'; writeHistory(o, 'принят');
        updated = o;
        saveOrders(list);
      }
    }
  }
  saveOrders(getOrdersLocal());
  return updated;
}

export async function cancelOrder(orderId, reason = ''){
  let updated = null;
  try{
    const { order } = await apiPost('cancel', { id: String(orderId), reason: String(reason||'') });
    updated = order || null;
    const one = updated || await apiGetOne(orderId);
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
    if (i !== -1) {
      const o = list[i];
      if (canonStatus(o.status) === 'новый') {
        o.canceled = true;
        o.cancelReason = String(reason || '').trim();
        o.canceledAt = Date.now();
        o.accepted = false;
        o.status = 'отменён';
        writeHistory(o, 'отменён', { comment: o.cancelReason });
        updated = o;
        saveOrders(list);
      }
    }
  }
  saveOrders(getOrdersLocal());
  return updated;
}

export async function updateOrderStatus(orderId, status){
  const stCanon = canonStatus(status);
  if (!ORDER_STATUSES.includes(stCanon)) return null;

  let updatedOrder = null;

  try{
    const { order } = await apiPost('status', { id:String(orderId), status:String(stCanon) });
    updatedOrder = order || null;
    const one = updatedOrder || await apiGetOne(orderId);
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
    if (i !== -1) {
      const o = list[i];
      const cur = canonStatus(o.status);
      if (cur !== 'новый' && cur !== 'отменён' && !o.canceled) {
        o.status = stCanon;
        if (!o.accepted && stCanon !== 'отменён') o.accepted = true;
        if (stCanon === 'выдан'){ o.completedAt = Date.now(); }
        writeHistory(o, stCanon);
        updatedOrder = o;
        saveOrders(list);
      }
    }
  }

  try {
    if (typeof window !== 'undefined' && window.__ALLOW_CLIENT_NOTIFY__ === true && updatedOrder) {
      notifyStatusChanged(null, {
        orderId: updatedOrder?.id,
        shortId: updatedOrder?.shortId ?? null,
        title: updatedOrder?.cart?.[0]?.title || updatedOrder?.title || ''
      });
    }
  } catch {}

  saveOrders(getOrdersLocal());
  return updatedOrder;
}

/* Демосидирование отключено */
export function seedOrdersOnce(){ /* no-op */ }

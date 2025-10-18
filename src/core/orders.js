// core/orders.js
// Простое локальное хранилище заказов + утилиты для админки/клиента
const KEY = 'nas_orders';

/**
 * Полный список статусов, включая служебные.
 * - 'новый'        — стартовый, доступно только: принять или отменить (с комментарием)
 * - 'принят'       — после принятия
 * - '...этапы...'  — меняем только после принятия
 * - 'выдан'        — финальный, переходит во «Завершённые»
 * - 'отменён'      — отдельное состояние (фиксируется причина)
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

/**
 * Этапы, доступные к выбору ТОЛЬКО после принятия.
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

export function getOrders(){
  try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch{ return []; }
}

export function saveOrders(list){
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('orders:updated'));
}

/** Полная очистка всех заказов (для миграции/сброса) */
export function clearAllOrders(){
  try{
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent('orders:updated'));
  }catch{}
}

function writeHistory(order, status, extra = {}){
  const rec = { ts: Date.now(), status, ...extra };
  order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
}

export function addOrder(order){
  const list = getOrders();
  const id = order.id ?? String(Date.now());
  const now = Date.now();
  const initialStatus = order.status ?? 'новый';

  const next = {
    id,

    // Идентификация пользователя (для клиентского фильтра)
    userId: order.userId ?? null,     // <== добавлено
    username: order.username ?? '',

    // поддержка одиночного товара + корзины из нескольких
    productId: order.productId ?? null,
    size: order.size ?? null,
    color: order.color ?? null,
    link: order.link ?? (order.productId ? `#/product/${order.productId}` : ''),
    cart: Array.isArray(order.cart) ? order.cart : [],
    total: Number(order.total || 0),

    // контактные
    address: typeof order.address === 'string' ? order.address : (order.address?.address || ''),
    phone: order.phone ?? '',
    payerFullName: order.payerFullName ?? '',

    // оплата
    paymentScreenshot: order.paymentScreenshot ?? '',

    // статусы
    status: initialStatus,
    accepted: !!order.accepted,

    // отмена/завершение
    canceled: !!order.canceled,
    cancelReason: order.cancelReason || '',
    canceledAt: order.canceledAt || null,
    completedAt: order.completedAt || null,

    // мета
    createdAt: order.createdAt ?? now,
    currency: order.currency || 'UZS',
    history: order.history ?? [{ ts: now, status: initialStatus }],
  };

  list.unshift(next);
  saveOrders(list);
  return next.id;
}

/** Выборка заказов конкретного пользователя */
export function getOrdersForUser(userId){
  const list = getOrders();
  if (!userId) return [];
  return list.filter(o => String(o.userId||'') === String(userId));
}

/** Принять «новый» заказ */
export function acceptOrder(orderId){
  const list = getOrders();
  const i = list.findIndex(o => String(o.id) === String(orderId));
  if (i === -1) return;
  const o = list[i];
  if (o.status !== 'новый' || o.canceled) return;

  o.accepted = true;
  o.status = 'принят';
  writeHistory(o, 'принят');
  saveOrders(list);
}

/** Отменить «новый» заказ с комментарием */
export function cancelOrder(orderId, reason = ''){
  const list = getOrders();
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
}

/** Обновить статус уже принятого заказа */
export function updateOrderStatus(orderId, status){
  if (!ORDER_STATUSES.includes(status)) return;

  const list = getOrders();
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
}

/** Быстрая финализация */
export function markCompleted(orderId){
  updateOrderStatus(orderId, 'выдан');
}

/* ===== Демосидирование отключено (сохранена функция для совместимости) ===== */
export function seedOrdersOnce(){ /* no-op: демо-данные отключены */ }

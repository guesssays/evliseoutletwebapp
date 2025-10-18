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
    username: order.username ?? '',
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

/**
 * Обновить статус уже принятого заказа.
 * Если выставлен 'выдан' — помечаем как завершённый.
 */
export function updateOrderStatus(orderId, status){
  if (!ORDER_STATUSES.includes(status)) return;

  const list = getOrders();
  const i = list.findIndex(o => String(o.id) === String(orderId));
  if (i === -1) return;
  const o = list[i];

  // Нельзя менять статус у «новый» — сначала acceptOrder()/cancelOrder()
  if (o.status === 'новый') return;
  // Нельзя менять отменённый
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

/* ===== Демо-данные при первом старте ===== */
export function seedOrdersOnce(){
  if (getOrders().length) return;

  addOrder({
    productId: 101,
    size: 'M',
    color: 'Черный',
    address: 'г. Ташкент, ул. Мирзо Улугбека, 10',
    phone: '+998 90 123-45-67',
    username: 'customer_one',
    payerFullName: 'Иванов Иван',
    cart: [],
    total: 299000,
    link: '#/product/101',
    status: 'новый',
  });

  addOrder({
    productId: 205,
    size: 'L',
    address: 'г. Самарканд, ул. Регистан, 7',
    phone: '+998 91 765-43-21',
    username: 'client_two',
    payerFullName: 'Петров Пётр',
    cart: [],
    total: 399000,
    link: '#/product/205',
    status: 'принят',
    accepted: true,
  });

  // Пример завершённого заказа
  addOrder({
    productId: 309,
    size: 'XL',
    address: 'г. Бухара, ул. Ляби-Хауз, 3',
    phone: '+998 93 555-55-55',
    username: 'done_user',
    payerFullName: 'Сидоров Семён',
    cart: [],
    total: 459000,
    link: '#/product/309',
    status: 'выдан',
    accepted: true,
    completedAt: Date.now() - 3600_000,
    history: [
      { ts: Date.now() - 48*3600_000, status: 'новый' },
      { ts: Date.now() - 47*3600_000, status: 'принят' },
      { ts: Date.now() - 6*3600_000,  status: 'на почте' },
      { ts: Date.now() - 3600_000,    status: 'выдан' },
    ],
  });
}

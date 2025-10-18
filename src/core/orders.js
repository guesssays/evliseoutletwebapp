// Простое локальное хранилище заказов + утилиты для админки/клиента
const KEY = 'nas_orders';

export const ORDER_STATUSES = [
  'новый',
  'принят',
  'собирается в китае',
  'вылетел в узб',
  'на таможне',
  'на почте',
  'забран с почты',
  'готов к отправке',
];

export function getOrders(){
  try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch{ return []; }
}

export function saveOrders(list){
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('orders:updated'));
}

export function addOrder(order){
  const list = getOrders();
  const id = order.id ?? String(Date.now());
  const now = Date.now();
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
    status: order.status ?? 'новый',
    accepted: !!order.accepted,

    // мета
    createdAt: order.createdAt ?? now,
    currency: order.currency || 'UZS',
    history: order.history ?? [{ ts: now, status: order.status ?? 'новый' }],
  };
  list.unshift(next);
  saveOrders(list);
  return next.id;
}

export function acceptOrder(orderId){
  const list = getOrders();
  const i = list.findIndex(o => String(o.id) === String(orderId));
  if (i === -1) return;
  list[i].accepted = true;
  list[i].status = 'принят';
  list[i].history = [...(list[i].history||[]), { ts: Date.now(), status:'принят' }];
  saveOrders(list);
}

export function updateOrderStatus(orderId, status){
  const list = getOrders();
  const i = list.findIndex(o => String(o.id) === String(orderId));
  if (i === -1) return;
  list[i].status = status;
  list[i].history = [...(list[i].history||[]), { ts: Date.now(), status }];
  saveOrders(list);
}

export function markCompleted(orderId){
  updateOrderStatus(orderId, 'готов к отправке');
}

// демо-наполнение при первом старте
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
}

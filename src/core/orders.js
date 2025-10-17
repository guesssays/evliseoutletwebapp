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
  // Сообщим приложению, что заказы обновились
  window.dispatchEvent(new CustomEvent('orders:updated'));
}

export function addOrder(order){
  const list = getOrders();
  const id = order.id ?? String(Date.now());
  const now = Date.now();
  const next = {
    id,
    productId: order.productId ?? null,
    size: order.size ?? null,
    color: order.color ?? null,
    address: order.address ?? '',
    phone: order.phone ?? '',
    username: order.username ?? '',
    payerFullName: order.payerFullName ?? '',
    paymentScreenshot: order.paymentScreenshot ?? '',
    link: order.link ?? (order.productId ? `#/product/${order.productId}` : ''),
    status: order.status ?? 'новый',
    accepted: !!order.accepted,
    createdAt: order.createdAt ?? now,
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

export function seedOrdersOnce(){
  // Для демо: если пусто — подбросим пару заказов
  if (getOrders().length) return;
  addOrder({
    productId: 101,
    size: 'M',
    color: 'Черный',
    address: 'г. Ташкент, ул. Мирзо Улугбека, 10',
    phone: '+998 90 123-45-67',
    username: 'customer_one',
    payerFullName: 'Иванов Иван',
    paymentScreenshot: '',
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
    paymentScreenshot: '',
    link: '#/product/205',
    status: 'принят',
    accepted: true,
  });
}

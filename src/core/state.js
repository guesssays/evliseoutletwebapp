// простое хранилище состояния (русский интерфейс, Telegram user, корзина)
export const state = {
  products: [],
  categories: [],
  cart: { items: [] },
  user: null,           // Telegram user
  filters: { category: 'all', query: '' },
  orders: []            // заказ + статусы (для ручного обновления админами)
};

export function persistCart(){
  localStorage.setItem('nas_cart', JSON.stringify(state.cart));
}
export function loadCart(){
  try{ state.cart = JSON.parse(localStorage.getItem('nas_cart')) || {items:[]}; }catch{ /* noop */ }
}
export function updateCartBadge(){
  const n = state.cart.items.reduce((s,i)=>s+i.qty,0);
  const b = document.getElementById('cartBadge'); if (b) b.textContent = n;
}

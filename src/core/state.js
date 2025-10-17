// единое состояние приложения
export const state = {
  products: [],
  categories: [],
  cart: { items: [] },
  user: null,
  filters: { category: 'all', query: '', size:[], colors:[], materials:[], minPrice:null, maxPrice:null, inStock:false },
  orders: [],
  addresses: { // простое локальное хранилище адресов
    list: [],
    defaultId: null
  }
};

export function persistCart(){ localStorage.setItem('nas_cart', JSON.stringify(state.cart)); }
export function loadCart(){ try{ state.cart = JSON.parse(localStorage.getItem('nas_cart')) || {items:[]}; }catch{} }
export function updateCartBadge(){
  const n = state.cart.items.reduce((s,i)=>s+i.qty,0);
  const b = document.getElementById('cartBadge'); if (b) b.textContent = n;
}

// адреса
const ADDR_KEY = 'nas_addresses';
export function loadAddresses(){
  try{
    const data = JSON.parse(localStorage.getItem(ADDR_KEY) || '{}');
    state.addresses = { list: data.list || [], defaultId: data.defaultId || null };
  }catch{}
}
export function persistAddresses(){
  localStorage.setItem(ADDR_KEY, JSON.stringify(state.addresses));
}

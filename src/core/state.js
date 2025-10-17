export const PRICE_CURRENCY = 'UZS';
export const RUB_TO_UZS = 1;
export const DEFAULT_LANG  = localStorage.getItem('evlise_lang')  || 'ru';
export const DEFAULT_THEME = localStorage.getItem('evlise_theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

export const state = {
  products: [],
  categories: [],
  cart: { items: [] },
  user: null,
  filters: { category: 'all', query: '', size:[], colors:[], materials:[], minPrice:null, maxPrice:null, inStock:false },
  orders: [],
  addresses: { list: [], defaultId: null }
};

export function persistCart(){ localStorage.setItem('nas_cart', JSON.stringify(state.cart)); }
export function loadCart(){
  try{
    const parsed = JSON.parse(localStorage.getItem('nas_cart') || '{"items":[]}');
    // нормализуем структуру
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    state.cart = { items: items.map(it => ({
      productId: String(it.productId),
      size: it.size ?? null,
      color: it.color ?? null,
      qty: Number(it.qty) || 0
    }))};
  }catch{
    state.cart = { items: [] };
  }
}

export function updateCartBadge(){
  const n = state.cart.items.reduce((s,i)=>s + (Number(i.qty)||0), 0);

  // поддерживаем несколько вариантов селекторов бейджа, чтобы не зависеть от id
  const badges = [...document.querySelectorAll('#cartBadge, [data-cart-badge], .cart-badge')];
  if (!badges.length) return; // нет бейджа в DOM — просто выходим

  badges.forEach(b=>{
    if (n > 0){
      b.textContent = String(n);
      b.style.display = 'inline-block';
    }else{
      b.textContent = '';
      b.style.display = 'none';
    }
  });
}

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

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
  addresses: { list: [], defaultId: null },
  profile: { phone:'', payerFullName:'' } // НОВОЕ: сохраняемые поля пользователя
};

export function persistCart(){ localStorage.setItem('nas_cart', JSON.stringify(state.cart)); }

export function loadCart(){
  try{
    const parsed = JSON.parse(localStorage.getItem('nas_cart') || '{"items":[]}');
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

export function pruneCartAgainstProducts(products){
  const ids = new Set(products.map(p => String(p.id)));
  const before = state.cart.items.length;
  state.cart.items = state.cart.items.filter(it => {
    const okId = ids.has(String(it.productId));
    const okQty = Number(it.qty) > 0;
    return okId && okQty;
  });
  if (state.cart.items.length !== before) persistCart();
}

export function updateCartBadge(){
  const n = state.cart.items.reduce((s,i)=> s + (Number(i.qty) || 0), 0);
  const badges = [...document.querySelectorAll('#cartBadge, [data-cart-badge], .cart-badge')];
  if (!badges.length) return;
  badges.forEach(b=>{
    if (n > 0){
      b.textContent = String(n);
      b.style.display = 'inline-block';
      b.hidden = false;
      b.setAttribute('aria-hidden','false');
    }else{
      b.textContent = '';
      b.style.display = 'none';
      b.hidden = true;
      b.setAttribute('aria-hidden','true');
    }
  });
}

/* === Адреса === */
const ADDR_KEY = 'nas_addresses';
export function loadAddresses(){
  try{
    const data = JSON.parse(localStorage.getItem(ADDR_KEY) || '{}');
    state.addresses = { list: data.list || [], defaultId: data.defaultId || null };
  }catch{
    state.addresses = { list: [], defaultId: null };
  }
}
export function persistAddresses(){
  localStorage.setItem(ADDR_KEY, JSON.stringify(state.addresses));
}

/* === Профиль (телефон/ФИО плательщика) === */
const PROF_KEY = 'nas_profile';
export function loadProfile(){
  try{
    const data = JSON.parse(localStorage.getItem(PROF_KEY) || '{}');
    state.profile = {
      phone: data.phone || '',
      payerFullName: data.payerFullName || ''
    };
  }catch{
    state.profile = { phone:'', payerFullName:'' };
  }
}
export function persistProfile(){
  localStorage.setItem(PROF_KEY, JSON.stringify({
    phone: state.profile?.phone || '',
    payerFullName: state.profile?.payerFullName || ''
  }));
}

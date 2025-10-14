export const state = {
  products: [],
  categories: [],
  filters: { size: [], colors: [], materials: [], minPrice: null, maxPrice: null, inStock: false },
  cart: JSON.parse(localStorage.getItem('evlise_cart') || '{"items":[]}'),
  favorites: JSON.parse(localStorage.getItem('evlise_fav') || '[]'),
  orderNote: localStorage.getItem('evlise_note') || ""
};
export function persistCart(){ localStorage.setItem('evlise_cart', JSON.stringify(state.cart)); }
export function updateCartBadge(){
  const count = state.cart.items.reduce((s,x)=>s+x.qty,0);
  const el = document.querySelector('#cartCount'); if (el) el.textContent = count;
}

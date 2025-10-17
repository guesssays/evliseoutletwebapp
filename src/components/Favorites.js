import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderFavorites(){
  const v=document.getElementById('view');
  const fav = new Set(JSON.parse(localStorage.getItem('nas_fav')||'[]'));
  const list = state.products.filter(p=>fav.has(p.id));
  if (!list.length){
    v.innerHTML = `<div class="section-title">Избранное</div><section class="checkout"><div class="cart-sub">Список избранного пуст</div></section>`;
    return;
  }
  v.innerHTML = `<div class="section-title">Избранное</div><div class="grid" id="productGrid"></div>`;
  drawProducts(list);
}

// src/components/Favorites.js
import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderFavorites(){
  const v=document.getElementById('view');
  const favIds = state.favorites; // Set<string>
  const list = state.products.filter(p=> favIds.has(String(p.id)));
  if (!list.length){
    v.innerHTML = `<div class="section-title">Избранное</div>
      <section class="checkout"><div class="cart-sub">Список избранного пуст</div></section>`;
    return;
  }
  v.innerHTML = `<div class="section-title">Избранное</div><div class="grid" id="productGrid"></div>`;
  drawProducts(list);
}

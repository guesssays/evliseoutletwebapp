// src/components/Favorites.js
import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderFavorites(){
  const v = document.getElementById('view');
  const favIds = state.favorites; // Set<string>
  const list = state.products.filter(p => favIds.has(String(p.id)));

  const header = `
    <div class="section-title" style="display:flex;align-items:center;gap:10px">
      <button class="square-btn" id="favBack"><i data-lucide="chevron-left"></i></button>
      Избранное
    </div>
  `;

  if (!list.length){
    v.innerHTML = `
      ${header}
      <section class="checkout">
        <div class="cart-sub">Список избранного пуст</div>
      </section>
    `;
    window.lucide?.createIcons && lucide.createIcons();
    document.getElementById('favBack')?.addEventListener('click', ()=> history.back());
    return;
  }

  v.innerHTML = `
    ${header}
    <div class="grid" id="productGrid"></div>
  `;
  drawProducts(list);

  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('favBack')?.addEventListener('click', ()=> history.back());
}

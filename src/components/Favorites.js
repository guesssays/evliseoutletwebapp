// src/components/Favorites.js
import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderFavorites(){
  const v = document.getElementById('view');
  const favIds = state.favorites; // Set<string>
  const list = state.products.filter(p => favIds.has(String(p.id)));

  const header = `
    <div class="page-title">
      <button class="square-btn" id="favBack" aria-label="Назад">
        <i data-lucide="chevron-left"></i>
      </button>
      <h1>Избранное</h1>
    </div>
  `;

  if (!list.length){
    v.innerHTML = `
      <div class="view">
        ${header}
        <section class="checkout">
          <div class="cart-sub">Список избранного пуст</div>
        </section>
      </div>
    `;
    window.lucide?.createIcons && lucide.createIcons();
    document.getElementById('favBack')?.addEventListener('click', ()=> history.back());
    return;
  }

  v.innerHTML = `
    <div class="view">
      ${header}
      <div class="grid" id="productGrid" data-fav-mode="1"></div>
    </div>
  `;
  drawProducts(list);

  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('favBack')?.addEventListener('click', ()=> history.back());
}

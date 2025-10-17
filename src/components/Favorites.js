import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderFavorites(){
  const v=document.getElementById('view');
  v.innerHTML = `<div class="section-title">Избранное</div><div class="grid" id="productGrid"></div>`;
  const fav = new Set(JSON.parse(localStorage.getItem('nas_fav')||'[]'));
  drawProducts(state.products.filter(p=>fav.has(p.id)));
}

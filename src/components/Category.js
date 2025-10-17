import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderCategory({ slug }){
  const v = document.getElementById('view');
  const title = state.categories.find(c=>c.slug===slug)?.name || 'Категория';
  const list = state.products.filter(p=>p.category===slug);

  // небольшой нижний отступ, чтобы сетка не упиралась в таббар
  v.innerHTML = `
    <div class="section-title">${title}</div>
    <div class="grid home-bottom-pad" id="productGrid"></div>
  `;

  drawProducts(list);
}

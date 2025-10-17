import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderCategory({ slug }){
  const v = document.getElementById('view');

  // заголовок из справочника категорий (по slug)
  const title = state.categories.find(c=>c.slug===slug)?.name || 'Категория';

  // ГЛАВНАЯ ПРАВКА: фильтруем по categoryId
  let list;
  if (slug === 'all') {
    list = state.products;
  } else if (slug === 'new') {
    list = state.products.slice(0, 24);
  } else {
    list = state.products.filter(p => p.categoryId === slug);
  }

  v.innerHTML = `
    <div class="section-title">${title}</div>
    <div class="grid home-bottom-pad" id="productGrid"></div>
  `;

  drawProducts(list);
}

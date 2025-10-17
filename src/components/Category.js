import { state } from '../core/state.js';
import { drawProducts } from './Home.js';

export function renderCategory({slug}){
  const v=document.getElementById('view');
  const list = state.products.filter(p=>p.category===slug);
  v.innerHTML = `<div class="section-title">${state.categories.find(c=>c.slug===slug)?.name || 'Категория'}</div>
  <div class="grid" id="productGrid"></div>`;
  drawProducts(list);
}

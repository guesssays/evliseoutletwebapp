import { el } from '../core/dom.js';
import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { drawProducts } from './Home.js';
import { openFilterModal, renderActiveFilterChips } from './Filters.js';

export function renderCategory({slug}, router){
  closeDrawerIfNeeded();
  const cat = state.categories.find(c=>c.slug===slug); if (!cat){ renderHome(router); return; }
  const products = state.products.filter(p=>p.category===slug);
  const view=document.querySelector('#view');
  view.innerHTML = `
    <section class="section">
      <div class="row" style="justify-content:space-between; align-items:end">
        <div><div class="h1">${cat.name}</div><div class="sub">${products.length} ${t('items')}</div></div>
        <button class="chip" id="openFilter">${t('filters')}</button>
      </div>
      <div class="toolbar" id="activeFilters"></div>
      <div class="grid" id="productGrid"></div>
    </section>`;
  drawProducts(products);
  el('#openFilter').onclick=()=>openFilterModal(router);
  renderActiveFilterChips();
}
function closeDrawerIfNeeded(){ const d=document.querySelector('#drawer'); const o=document.querySelector('#overlay'); d.classList.remove('open'); o.classList.remove('show'); }

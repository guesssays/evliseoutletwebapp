import { state } from '../core/state.js';
import { el } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { priceFmt } from '../core/utils.js';
import { openFilterModal, renderActiveFilterChips, applyFilters } from './Filters.js';

export function renderHome(router){
  closeDrawerIfNeeded();
  const view=document.querySelector('#view');
  view.innerHTML = `
    <section class="section">
      <div class="h1">Browse</div>
      <div class="grid" id="catGrid"></div>
    </section>

    <section class="section">
      <div class="row" style="justify-content:space-between; align-items:end">
        <div><div class="h1">${t('newItems')}</div><div class="sub">Из Instagram и складов</div></div>
        <button class="chip" id="openFilter">${t('filters')}</button>
      </div>
      <div class="toolbar" id="activeFilters"></div>
      <div class="grid" id="productGrid"></div>
    </section>`;

  const catGrid=el('#catGrid');
  state.categories.forEach(c=>{
    const a=document.createElement('a'); a.className='card'; a.href=`#/category/${c.slug}`;
    a.innerHTML=`<div class="card-img-wrap"><img src="${c.image}" alt="${c.name}"></div><div class="card-body"><div class="card-title">${c.name}</div></div>`;
    catGrid.appendChild(a);
  });

  drawProducts(state.products.slice(0,12));
  el('#openFilter').onclick=()=>openFilterModal(router);
  renderActiveFilterChips();
  if (window.lucide?.createIcons) lucide.createIcons();
}
function closeDrawerIfNeeded(){ const d=document.querySelector('#drawer'); const o=document.querySelector('#overlay'); d.classList.remove('open'); o.classList.remove('show'); }

export function drawProducts(list){
  const grid = el('#productGrid'); grid.innerHTML='';
  const filtered = applyFilters(list);
  for (const p of filtered){
    const tCard=document.getElementById('product-card'); const node=tCard.content.firstElementChild.cloneNode(true);
    node.href=`#/product/${p.id}`;
    node.querySelector('img').src=p.images[0]; node.querySelector('img').alt=p.title;
    node.querySelector('.card-title').textContent=p.title;
    node.querySelector('.card-price').textContent=priceFmt(p.price);
    grid.appendChild(node);
  }
  if (!filtered.length) grid.innerHTML=`<div class="sub">${t('notFound')}</div>`;
}

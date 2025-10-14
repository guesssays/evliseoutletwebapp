import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { drawProducts } from './Home.js';

export function renderFavorites(){
  closeDrawerIfNeeded();
  const favSet = new Set(state.favorites);
  const list = state.products.filter(p=>favSet.has(p.id));
  const view=document.querySelector('#view');
  view.innerHTML = `<section class="section"><div class="h1">${t('favorites')}</div><div class="grid" id="productGrid"></div></section>`;
  if (list.length) drawProducts(list); else document.querySelector('#productGrid').innerHTML=`<div class="sub">${t('emptyFav')}</div>`;
}
function closeDrawerIfNeeded(){ const d=document.querySelector('#drawer'); const o=document.querySelector('#overlay'); d.classList.remove('open'); o.classList.remove('show'); }

import { state } from '../core/state.js';
import { priceFmt, colorToHex } from '../core/utils.js';
import { addToCart } from './cartActions.js';

export function renderProduct({id}){
  const p = state.products.find(x=> String(x.id)===String(id)); if (!p){ location.hash='#/'; return; }
  const v=document.getElementById('view');
  v.innerHTML = `
    <div class="product">
      <div class="p-hero">
        <img src="${p.images[0]}" alt="${p.title}">
        <button class="hero-btn hero-back" id="goBack"><i data-lucide="chevron-left"></i></button>
        <button class="hero-btn hero-fav" id="favBtn"><i data-lucide="heart"></i></button>
      </div>
      <div class="p-body">
        <div class="qty-row" style="justify-content:flex-end">
          <div class="qty-ctrl">
            <button class="ctrl" id="dec"><i data-lucide="minus"></i></button>
            <span id="qty">1</span>
            <button class="ctrl" id="inc"><i data-lucide="plus"></i></button>
          </div>
        </div>

        <div class="p-title">${p.title}</div>
        <div class="p-desc">${p.description || 'Описание скоро будет обновлено.'}</div>

        <div class="specs"><b>Материал:</b> ${p.material || '—'}</div>

        <div class="p-options">
          ${(p.sizes?.length||0) ? `
          <div>
            <div class="opt-title">Размер</div>
            <div class="sizes" id="sizes">${p.sizes.map(s=>`<button class="size" data-v="${s}">${s}</button>`).join('')}</div>
          </div>`:''}
          <div>
            <div class="opt-title">Цвет</div>
            <div class="colors" id="colors">${(p.colors||[]).map(c=>`<button class="sw" title="${c}" data-v="${c}" style="background:${colorToHex(c)}"></button>`).join('')}</div>
          </div>
        </div>

        ${p.sizeChart ? `
        <div class="opt-title" style="margin-top:8px">Размерная сетка</div>
        <div class="table-wrap">
          <table class="size-table">
            <thead><tr>${p.sizeChart.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
            <tbody>
              ${p.sizeChart.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>`:''}
      </div>

      <div class="cta">
        <button id="addBtn" class="btn"><i data-lucide="shopping-bag"></i>
          <span>Добавить в корзину | ${priceFmt(p.price)}</span>
          ${p.oldPrice ? `<span class="muted-old">${priceFmt(p.oldPrice)}</span>`:''}
        </button>
      </div>
    </div>`;
  window.lucide?.createIcons();

  // qty + опции
  let qty=1, size=null, color=(p.colors||[])[0]||null;
  const qtyEl=document.getElementById('qty');
  document.getElementById('inc').onclick = ()=>{ qty++; qtyEl.textContent=qty; };
  document.getElementById('dec').onclick = ()=>{ qty=Math.max(1,qty-1); qtyEl.textContent=qty; };
  const sizes=document.getElementById('sizes'); if (sizes){ sizes.addEventListener('click', e=>{ const b=e.target.closest('.size'); if(!b)return; sizes.querySelectorAll('.size').forEach(x=>x.classList.remove('active')); b.classList.add('active'); size=b.getAttribute('data-v'); }); }
  const colors=document.getElementById('colors'); if (colors){ colors.addEventListener('click', e=>{ const b=e.target.closest('.sw'); if(!b)return; colors.querySelectorAll('.sw').forEach(x=>x.classList.remove('active')); b.classList.add('active'); color=b.getAttribute('data-v'); }); colors.querySelector('.sw')?.classList.add('active'); }

  document.getElementById('goBack').onclick=()=> history.back();
  document.getElementById('addBtn').onclick=()=> addToCart(p, size, color, qty);
}

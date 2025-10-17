import { state } from '../core/state.js';
import { priceFmt, colorToHex } from '../core/utils.js';
import { addToCart } from './cartActions.js';

export function renderProduct({id}){
  const p = state.products.find(x=> String(x.id)===String(id));
  if (!p){ location.hash='#/'; return; }

  const favSet = new Set(JSON.parse(localStorage.getItem('nas_fav')||'[]'));
  const isFav = favSet.has(p.id);

  const images = Array.isArray(p.images) && p.images.length ? p.images : [p.images?.[0] || ''];
  const realPhotos = Array.isArray(p.realPhotos) ? p.realPhotos : [];

  const v=document.getElementById('view');
  v.innerHTML = `
    <div class="product">
      <!-- ГАЛЕРЕЯ -->
      <div class="p-hero">
        <div class="gallery" role="region" aria-label="Галерея товара">
          <div class="gallery-main">
            <img id="mainImg" src="${images[0]||''}" alt="${escapeHtml(p.title)}">
            <button class="hero-btn hero-back" id="goBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
            <button class="hero-btn hero-fav ${isFav?'active':''}" id="favBtn" aria-pressed="${isFav?'true':'false'}" aria-label="В избранное"><i data-lucide="heart"></i></button>
          </div>

          ${images.length>1 ? `
          <div class="thumbs" id="thumbs" role="tablist" aria-label="Миниатюры">
            ${images.map((src, i)=>`
              <button class="thumb ${i===0?'active':''}" role="tab" aria-selected="${i===0?'true':'false'}" data-index="${i}" aria-controls="mainImg">
                <img loading="lazy" src="${src}" alt="Фото ${i+1}">
              </button>
            `).join('')}
          </div>` : '' }
        </div>
      </div>

      <div class="p-body">
        <div class="qty-row" style="justify-content:flex-end">
          <div class="qty-ctrl">
            <button class="ctrl" id="dec" aria-label="Уменьшить"><i data-lucide="minus"></i></button>
            <span id="qty">1</span>
            <button class="ctrl" id="inc" aria-label="Увеличить"><i data-lucide="plus"></i></button>
          </div>
        </div>

        <div class="p-title">${escapeHtml(p.title)}</div>
        <div class="p-desc">${p.description ? escapeHtml(p.description) : 'Описание скоро будет обновлено.'}</div>
        <div class="specs"><b>Материал:</b> ${p.material ? escapeHtml(p.material) : '—'}</div>

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
            <thead><tr>${p.sizeChart.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${p.sizeChart.rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>`:''}

        ${realPhotos.length ? `
        <div class="opt-title" style="margin-top:14px">Реальные фото</div>
        <div class="real-photos">
          ${realPhotos.map((src,i)=>`
            <div class="real-photo">
              <img loading="lazy" src="${src}" alt="Реальное фото ${i+1}">
            </div>
          `).join('')}
        </div>` : ''}

      </div>

      <div class="cta">
        <button id="addBtn" class="btn">
          <i data-lucide="shopping-bag"></i>
          <span>Добавить в корзину&nbsp;|&nbsp;${priceFmt(p.price)}</span>
        </button>
      </div>
    </div>`;

  window.lucide?.createIcons && lucide.createIcons();

  // qty + опции
  let qty=1, size=null, color=(p.colors||[])[0]||null;
  const qtyEl=document.getElementById('qty');
  document.getElementById('inc').onclick = ()=>{ qty++; qtyEl.textContent=qty; };
  document.getElementById('dec').onclick = ()=>{ qty=Math.max(1,qty-1); qtyEl.textContent=qty; };
  const sizes=document.getElementById('sizes');
  if (sizes){
    sizes.addEventListener('click', e=>{
      const b=e.target.closest('.size'); if(!b)return;
      sizes.querySelectorAll('.size').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); size=b.getAttribute('data-v');
    });
  }
  const colors=document.getElementById('colors');
  if (colors){
    colors.addEventListener('click', e=>{
      const b=e.target.closest('.sw'); if(!b)return;
      colors.querySelectorAll('.sw').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); color=b.getAttribute('data-v');
    });
    colors.querySelector('.sw')?.classList.add('active');
  }

  // Навигация назад
  document.getElementById('goBack').onclick=()=> history.back();

  // Избранное (сердце)
  const favBtn = document.getElementById('favBtn');
  favBtn.onclick = ()=>{
    let list = JSON.parse(localStorage.getItem('nas_fav')||'[]');
    const i = list.indexOf(p.id);
    const nowFav = i===-1;
    if (nowFav) list.push(p.id); else list.splice(i,1);
    localStorage.setItem('nas_fav', JSON.stringify(list));
    favBtn.classList.toggle('active', nowFav);
    favBtn.setAttribute('aria-pressed', String(nowFav));
  };

  // Галерея: миниатюры -> главное фото
  const thumbs = document.getElementById('thumbs');
  const mainImg = document.getElementById('mainImg');
  if (thumbs && mainImg){
    thumbs.addEventListener('click', (e)=>{
      const t = e.target.closest('.thumb'); if (!t) return;
      const idx = Number(t.getAttribute('data-index'))||0;
      mainImg.src = images[idx] || images[0] || '';
      thumbs.querySelectorAll('.thumb').forEach(x=>{
        x.classList.toggle('active', x===t);
        x.setAttribute('aria-selected', x===t ? 'true':'false');
      });
    });

    // keyboard: arrows на табах
    thumbs.addEventListener('keydown', (e)=>{
      const all = Array.from(thumbs.querySelectorAll('.thumb'));
      const curr = all.findIndex(x=> x.classList.contains('active'));
      if (e.key==='ArrowRight' || e.key==='ArrowDown'){
        const n = all[Math.min(all.length-1, curr+1)];
        n?.focus(); n?.click(); e.preventDefault();
      }else if (e.key==='ArrowLeft' || e.key==='ArrowUp'){
        const pbtn = all[Math.max(0, curr-1)];
        pbtn?.focus(); pbtn?.click(); e.preventDefault();
      }
    });
  }

  // Добавить в корзину
  document.getElementById('addBtn').onclick=()=> addToCart(p, size, color, qty);
}

/* утилита экранирования */
function escapeHtml(s=''){
  return s.replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

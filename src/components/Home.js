import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

export function renderHome(router){
  const v = document.getElementById('view');
  // нижний отступ, чтобы сетка не упиралась в таббар
  v.innerHTML = `<div class="grid home-bottom-pad" id="productGrid"></div>`;
  drawCategoriesChips(router);
  drawProducts(state.products);
}

/**
 * Рендер чипов категорий + единоразовый обработчик.
 * Главная правка: фильтрация теперь по p.categoryId.
 */
export function drawCategoriesChips(router){
  const wrap = document.getElementById('catChips');
  if (!wrap) return;

  const mk=(slug, name, active)=>`<button class="chip ${active?'active':''}" data-slug="${slug}">${name}</button>`;

  wrap.innerHTML='';
  wrap.insertAdjacentHTML('beforeend', mk('all','Все товары', state.filters.category==='all'));
  // «Новинки» как отдельная логическая категория
  wrap.insertAdjacentHTML('beforeend', mk('new','Новинки', state.filters.category==='new'));
  state.categories.forEach(c=>{
    // не дублируем «Новинки», она уже добавлена вручную
    if (c.slug === 'new') return;
    wrap.insertAdjacentHTML('beforeend', mk(c.slug,c.name, state.filters.category===c.slug));
  });

  if (!wrap.dataset.bound){
    wrap.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip'); if (!b) return;

      const slug = b.getAttribute('data-slug');
      if (slug === state.filters.category) return;

      // переключаем активный чип без полного перерендера
      wrap.querySelector('.chip.active')?.classList.remove('active');
      b.classList.add('active');

      state.filters.category = slug;

      let list;
      if (slug === 'all') {
        list = state.products;
      } else if (slug === 'new') {
        // «Новинки»: просто первые N товаров (можно заменить на сортировку по дате, если появится)
        list = state.products.slice(0, 24);
      } else {
        list = state.products.filter(p => p.categoryId === slug);
      }

      drawProducts(list);
    });
    wrap.dataset.bound = '1';
  }
}

/**
 * Рисуем карточки товаров.
 * Главная правка: подпись категории берётся по p.categoryId.
 */
export function drawProducts(list){
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML='';

  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = list.filter(p=>
    p.title.toLowerCase().includes(q) ||
    (p.subtitle||'').toLowerCase().includes(q)
  );

  const fav = new Set(JSON.parse(localStorage.getItem('nas_fav')||'[]'));

  const frag = document.createDocumentFragment();
  for (const p of filtered){
    const t = document.getElementById('product-card');
    if (!t) continue;
    const node = t.content.firstElementChild.cloneNode(true);

    node.href = `#/product/${p.id}`;

    const im = node.querySelector('img');
    if (im){ im.src = p.images?.[0] || ''; im.alt = p.title; }

    const titleEl = node.querySelector('.title');
    if (titleEl) titleEl.textContent = p.title;

    // подпись категории → из state.categories по slug=categoryId
    const subEl = node.querySelector('.subtitle');
    if (subEl) {
      const labelById = state.categories.find(c => c.slug === p.categoryId)?.name || '';
      subEl.textContent = p.categoryLabel || labelById;
    }

    const priceEl = node.querySelector('.price');
    if (priceEl) priceEl.textContent = priceFmt(p.price);

    const favBtn = node.querySelector('.fav');
    if (favBtn){
      const isFav = fav.has(p.id);
      favBtn.classList.toggle('active', isFav);
      favBtn.setAttribute('aria-pressed', String(isFav));
      favBtn.onclick = (ev)=>{
        ev.preventDefault();
        toggleFav(p.id, favBtn);
      };
    }

    frag.appendChild(node);
  }

  grid.appendChild(frag);
  window.lucide?.createIcons && lucide.createIcons();
}

function toggleFav(id, btn){
  let list = JSON.parse(localStorage.getItem('nas_fav')||'[]');
  const was = list.includes(id);
  if (was) list = list.filter(x=>x!==id); else list.push(id);
  localStorage.setItem('nas_fav', JSON.stringify(list));
  btn.classList.toggle('active', !was);
  btn.setAttribute('aria-pressed', String(!was));
}

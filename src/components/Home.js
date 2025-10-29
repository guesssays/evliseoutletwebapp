// src/components/Home.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { applyFilters } from './Filters.js';
import { ScrollReset } from '../core/scroll-reset.js';


function findCategoryBySlug(slug){
  for (const g of state.categories){
    if (g.slug === slug) return g;
    for (const ch of (g.children||[])){
      if (ch.slug === slug) return ch;
    }
  }
  return null;
}
function expandSlugs(slug){
  const c = findCategoryBySlug(slug);
  if (!c) return [slug];
  if (c.children && c.children.length) return c.children.map(x=>x.slug);
  return [c.slug];
}
function categoryNameBySlug(slug){
  return findCategoryBySlug(slug)?.name || '';
}

export function renderHome(router){
  const v = document.getElementById('view');
  v.innerHTML = `<div class="grid home-bottom-pad" id="productGrid"></div>`;
  drawCategoriesChips(router);
  drawProducts(state.products);
  try { window.dispatchEvent(new CustomEvent('view:home-mounted')); } catch {}

  // ⛔ локальная кнопка «вверх» — не нужна (ScrollTop.js уже смонтирован)
}

/** Рендер чипов категорий (верхние группы + «Все», «Новинки»). */
export function drawCategoriesChips(router){
  const wrap = document.getElementById('catChips');
  if (!wrap) return;

  const mk=(slug, name, active)=>`<button class="chip ${active?'active':''}" data-slug="${slug}">${name}</button>`;

  wrap.innerHTML='';
  wrap.insertAdjacentHTML('beforeend', mk('all','Все товары', state.filters.category==='all'));
  wrap.insertAdjacentHTML('beforeend', mk('new','Новинки', state.filters.category==='new'));

  state.categories.forEach(c=>{
    if (c.slug === 'new') return;
    wrap.insertAdjacentHTML('beforeend', mk(c.slug, c.name, state.filters.category===c.slug));
  });

  if (!wrap.dataset.bound){
    wrap.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip'); if (!b) return;

      const slug = b.getAttribute('data-slug');
      if (slug === state.filters.category) return;

      wrap.querySelector('.chip.active')?.classList.remove('active');
      b.classList.add('active');

      state.filters.category = slug;

      let list;
      if (slug === 'all') {
        list = state.products;
      } else if (slug === 'new') {
        list = state.products.slice(0, 24);
      } else {
        const pool = new Set(expandSlugs(slug));
        list = state.products.filter(p => pool.has(p.categoryId));
      }

      // Далее drawProducts сам применит остальные фильтры
      drawProducts(list);

      // прокрутим к началу списка для UX
      try { (document.scrollingElement || document.documentElement).scrollTo({top:0, behavior:'smooth'}); } catch {}
    });
    wrap.dataset.bound = '1';
  }
}

/** Рисуем карточки товаров. */
export function drawProducts(list){
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML='';

  // 1) применяем выбранные фильтры (категории/размер/цвет/цена/наличие)
  const base = applyFilters(Array.isArray(list) ? list : []);

  // 2) затем текстовый поиск
  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = q
    ? base.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.subtitle||'').toLowerCase().includes(q)
      )
    : base;

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

    const subEl = node.querySelector('.subtitle');
    if (subEl) {
      const labelById = categoryNameBySlug(p.categoryId) || '';
      subEl.textContent = p.categoryLabel || labelById;
    }

    const priceEl = node.querySelector('.price');
    if (priceEl) priceEl.textContent = priceFmt(p.price);

const favBtn = node.querySelector('.fav');
if (favBtn){
  const active = isFav(p.id);
  favBtn.classList.toggle('active', active);
  favBtn.setAttribute('aria-pressed', String(active));

  // делаем настоящей кнопкой
  try { favBtn.setAttribute('type','button'); favBtn.setAttribute('role','button'); } catch {}

  favBtn.onclick = (ev)=>{
    try {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation?.();
    } catch {}

    // Не даём скролл-ресетам «дёрнуть» страницу
    try { ScrollReset.quiet(900); } catch {}

    const now = toggleFav(p.id);

    // 🔴 ВАЖНО: мгновенно обновляем UI
    favBtn.classList.toggle('active', now);
    favBtn.setAttribute('aria-pressed', String(now));

    // Глобальный синк (карточка товара / фикс-хедер и т.д.)
    try {
      window.dispatchEvent(new CustomEvent('fav:changed', {
        detail: { id: p.id, active: now }
      }));
    } catch {}

    // Режим «Избранное»: если товар снят из избранного — убираем карточку из сетки
    try {
      const grid = favBtn.closest('#productGrid');
      if (grid && grid.dataset.favMode === '1' && !now) {
        const card = favBtn.closest('.card') || favBtn.closest('a.card');
        card?.remove();
        if (!grid.querySelector('.card')) {
          const v = document.getElementById('view');
          v.innerHTML = `
            <div class="section-title" style="display:flex;align-items:center;gap:10px">
              <button class="square-btn" id="favBack"><i data-lucide="chevron-left"></i></button>
              Избранное
            </div>
            <section class="checkout">
              <div class="cart-sub">Список избранного пуст</div>
            </section>
          `;
          window.lucide?.createIcons && lucide.createIcons();
          document.getElementById('favBack')?.addEventListener('click', ()=> history.back());
        }
      }
    } catch {}
  };

  // Блокируем якорь/навигацию при клике на иконку
  try { ScrollReset.guardNoResetClick(favBtn, { duration: 900, preventAnchorNav: true }); } catch {}
}



    frag.appendChild(node);
  }

  grid.appendChild(frag);
  window.lucide?.createIcons && lucide.createIcons();
}

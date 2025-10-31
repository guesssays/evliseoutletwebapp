// src/components/Home.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { applyFilters } from './Filters.js';

/* ================== helpers: категории ================== */
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

/* ================== скелетоны ================== */
function calcSkeletonCount(){
  // 2 колонки на большинстве экранов → показываем «первый экран»
  // берём ~6–8 карточек (в зависимости от высоты)
  const h = (window.visualViewport?.height || window.innerHeight || 700);
  const rows = Math.max(3, Math.min(4, Math.round(h / 260))); // грубо: 3–4 ряда
  const cols = (window.innerWidth <= 380) ? 1 : 2;
  return rows * cols; // 6–8
}

function renderSkeletonGrid(container, count){
  const frag = document.createDocumentFragment();
  for (let i=0;i<count;i++){
    const el = document.createElement('a');
    el.className = 'card is-skeleton';
    el.setAttribute('aria-hidden','true');
    el.innerHTML = `
      <div class="card-img">
        <div class="skel skel-img"></div>
      </div>
      <div class="card-body">
        <div class="skel skel-title"></div>
        <div class="skel skel-sub"></div>
        <div class="price-row">
          <div class="skel skel-price"></div>
          <div class="skel skel-chip"></div>
        </div>
      </div>
    `;
    frag.appendChild(el);
  }
  container.appendChild(frag);
}

/* ============= progressive rendering (батчи) ============= */
function createProductNode(p){
  const t = document.getElementById('product-card');
  // если есть шаблон — используем его
  let node;
  if (t) {
    node = t.content.firstElementChild.cloneNode(true);
  } else {
    // минимальный фолбэк (если шаблон не подключён)
    node = document.createElement('a');
    node.className = 'card';
    node.innerHTML = `
      <div class="card-img"><img alt=""></div>
      <button class="fav" aria-pressed="false" type="button"><i data-lucide="heart"></i></button>
      <div class="card-body">
        <div class="title"></div>
        <div class="subtitle"></div>
        <div class="price-row">
          <div class="price"></div>
        </div>
      </div>
    `;
  }

  // anchor guard (клик по сердцу не открывает карточку)
  node.addEventListener('click', (e) => {
    if (e.target?.closest?.('.fav')) e.preventDefault();
  }, { capture: true, passive: false });

  node.href = `#/product/${p.id}`;
  node.dataset.id = String(p.id);

  const im = node.querySelector('img');
  if (im){
    // первые карточки — приоритет выше, остальные — lazy
    im.loading = 'lazy';
    im.decoding = 'async';
    im.alt = p.title;
    im.src = p.images?.[0] || '';
  }

  const titleEl = node.querySelector('.title'); if (titleEl) titleEl.textContent = p.title;
  const subEl   = node.querySelector('.subtitle');
  if (subEl){
    const label = p.categoryLabel || categoryNameBySlug(p.categoryId) || '';
    subEl.textContent = label;
  }
  const priceEl = node.querySelector('.price'); if (priceEl) priceEl.textContent = priceFmt(p.price);

  const favBtn = node.querySelector('.fav, button.fav');
  if (favBtn){
    const active = isFav(p.id);
    favBtn.classList.toggle('active', active);
    favBtn.setAttribute('aria-pressed', String(active));
    try { favBtn.setAttribute('type','button'); favBtn.setAttribute('role','button'); } catch {}
  }

  return node;
}

function progressiveAppend(grid, list, {firstBatch=12, batch=16, delay=0} = {}){
  // первый батч кидаем сразу → скрываем скелетоны
  const total = list.length;
  let idx = 0;

  const appendSlice = (from, to) => {
    const frag = document.createDocumentFragment();
    for (let i=from; i<to; i++){
      frag.appendChild(createProductNode(list[i]));
    }
    grid.appendChild(frag);
    window.lucide?.createIcons && lucide.createIcons();
  };

  const first = Math.min(firstBatch, total);
  if (first > 0){
    appendSlice(0, first);
    idx = first;
    // удаляем скелетоны плавно
    grid.querySelectorAll('.is-skeleton')?.forEach(el => el.remove());
  } else {
    // пусто — просто убираем скелетоны
    grid.querySelectorAll('.is-skeleton')?.forEach(el => el.remove());
  }

  // остальные — батчами, отдаём управление кадрам/простою
  const pump = () => {
    if (idx >= total) return;
    const next = Math.min(idx + batch, total);
    appendSlice(idx, next);
    idx = next;
    // используем requestIdleCallback если есть, иначе setTimeout(0)
    if ('requestIdleCallback' in window){
      requestIdleCallback(pump, { timeout: 120 });
    } else {
      setTimeout(pump, delay);
    }
  };

  // стартуем следующий тик
  if (idx < total){
    if ('requestIdleCallback' in window){
      requestIdleCallback(pump, { timeout: 120 });
    } else {
      setTimeout(pump, delay);
    }
  }
}

/* ================== публичные функции ================== */
export function renderHome(router){
  const v = document.getElementById('view');
  v.innerHTML = `<div class="grid home-bottom-pad" id="productGrid"></div>`;
  const grid = document.getElementById('productGrid');

  // 1) сразу показываем скелетоны, чтобы не было пустого «серединного» провала
  renderSkeletonGrid(grid, calcSkeletonCount());

  // 2) рисуем чипы (быстро)
  drawCategoriesChips(router);

  // 3) запускаем рендер товаров (progressive)
  //   переносим в next frame, чтобы дать браузеру нарисовать UI + скелетоны
  requestAnimationFrame(() => {
    drawProducts(state.products);
    try { window.dispatchEvent(new CustomEvent('view:home-mounted')); } catch {}
  });
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

      // при переключении категорий тоже даём скелетоны и прогрессивный рендер
      const grid = document.getElementById('productGrid');
      if (grid){
        grid.innerHTML = '';
        renderSkeletonGrid(grid, calcSkeletonCount());
      }

      drawProducts(list);
      try { (document.scrollingElement || document.documentElement).scrollTo({top:0, behavior:'smooth'}); } catch {}
    });
    wrap.dataset.bound = '1';
  }
}

/** Рисуем карточки товаров (с фильтрами, поиском и прогрессивной подгрузкой). */
export function drawProducts(list){
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  // не убираем скелетоны сейчас — пусть исчезнут после первого батча
  const base = applyFilters(Array.isArray(list) ? list : []);
  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = q
    ? base.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.subtitle||'').toLowerCase().includes(q)
      )
    : base;

  // делегированный guard на клик по .fav (не даём открывать карточку)
  if (!grid.dataset.anchorGuard) {
    grid.addEventListener('click', (e) => {
      if (e.target?.closest?.('.fav, button.fav')) e.preventDefault();
    }, { capture: true, passive: false });
    grid.dataset.anchorGuard = '1';
  }

  // делегат избранного
  if (!grid.dataset.favHandlerBound) {
    grid.addEventListener('click', (ev) => {
      const favBtn = ev.target.closest('.fav, button.fav');
      if (!favBtn) return;

      ev.preventDefault();

      const card = favBtn.closest('.card, a.card');
      const href = card?.getAttribute('href') || '';
      let pid = card?.dataset?.id || '';
      if (!pid && href.startsWith('#/product/')) pid = href.replace('#/product/', '').trim();
      if (!pid) return;

      const now = toggleFav(pid);
      favBtn.classList.toggle('active', now);
      favBtn.setAttribute('aria-pressed', String(now));

      try {
        window.dispatchEvent(new CustomEvent('fav:changed', { detail: { id: pid, active: now } }));
        window.dispatchEvent(new CustomEvent('favorites:updated'));
      } catch {}

      const gridEl = favBtn.closest('#productGrid');
      if (gridEl && gridEl.dataset.favMode === '1' && !now) {
        card?.remove();
        if (!gridEl.querySelector('.card:not(.is-skeleton)')) {
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
    }, { passive:false });

    grid.dataset.favHandlerBound = '1';
  }

  // прогрессивно добавляем карточки
  // — первые 12 сразу, далее по 16 (регулируется)
  progressiveAppend(grid, filtered, { firstBatch: 12, batch: 16, delay: 0 });
}

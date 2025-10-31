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
  const h = (window.visualViewport?.height || window.innerHeight || 700);
  const rows = Math.max(3, Math.min(4, Math.round(h / 260))); // 3–4 ряда
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

/* ============= helpers: пустое состояние ============= */
function renderEmptyState(grid, { title='Ничего не найдено', sub='Попробуйте изменить фильтры или запрос' } = {}){
  grid.innerHTML = `
    <div class="section" style="grid-column:1/-1;padding:10px 0 0">
      <div class="notes-empty">
        <b style="display:block;font-weight:800;margin-bottom:6px">${title}</b>
        <div>${sub}</div>
      </div>
    </div>
  `;
}

/* ============= progressive rendering (батчи) ============= */
function createProductNode(p){
  const t = document.getElementById('product-card');
  let node;
  if (t) {
    node = t.content.firstElementChild.cloneNode(true);
  } else {
    node = document.createElement('a');
    node.className = 'card';
    node.innerHTML = `
      <div class="card-img">
        <img alt="">
      </div>
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

  // === IMG + пер-карточный скелет до загрузки ===
  const imgWrap = node.querySelector('.card-img');
  const im = node.querySelector('img');
  if (imgWrap && im){
    // добавляем overlay-скелет только для конкретной карточки
    const ov = document.createElement('b');
    ov.className = 'img-skel';           // стилизуем в CSS
    imgWrap.appendChild(ov);

    // начальное состояние: img невидим (fade-in после load)
    im.loading = 'lazy';
    im.decoding = 'async';
    im.alt = p.title;
    im.src = p.images?.[0] || '';
    im.classList.remove('is-ready');

    const clear = () => {
      ov.remove();
      im.classList.add('is-ready');      // включает opacity:1 через CSS
    };

    // успех
    im.addEventListener('load', clear, { once: true });
    // фолбэк по таймеру, если onload не прилетел (например, кэш/ошибка)
    setTimeout(() => {
      if (ov.isConnected) clear();
    }, 2000);
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
  const total = list.length;
  let idx = 0;

  if (total === 0) return;

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
    // удаляем ТОЛЬКО сеточные скелетоны; пер-карточные остаются до onload
    grid.querySelectorAll('.is-skeleton')?.forEach(el => el.remove());
  }

  const pump = () => {
    if (idx >= total) return;
    const next = Math.min(idx + batch, total);
    appendSlice(idx, next);
    idx = next;
    if ('requestIdleCallback' in window){
      requestIdleCallback(pump, { timeout: 120 });
    } else {
      setTimeout(pump, delay);
    }
  };

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

  // 1) сразу показываем скелетоны
  renderSkeletonGrid(grid, calcSkeletonCount());

  // 2) рисуем чипы
  drawCategoriesChips(router);

  // 3) запускаем рендер товаров (progressive) в следующий кадр
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

      // На переключении — показываем скелетоны и затем рендерим
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

  const source = Array.isArray(list) ? list : [];
  const base = applyFilters(source);

  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = q
    ? base.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.subtitle||'').toLowerCase().includes(q)
      )
    : base;

  // Делегированный guard на клик по .fav
  if (!grid.dataset.anchorGuard) {
    grid.addEventListener('click', (e) => {
      if (e.target?.closest?.('.fav, button.fav')) e.preventDefault();
    }, { capture: true, passive: false });
    grid.dataset.anchorGuard = '1';
  }

  // Делегат избранного
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

  // Пустые состояния
  if (source.length === 0 && (state.products?.length || 0) === 0){
    // ждём данные — оставляем сеточные скелетоны
    return;
  }
  if (source.length === 0 && (state.products?.length || 0) > 0){
    grid.querySelectorAll('.is-skeleton')?.forEach(el => el.remove());
    renderEmptyState(grid, {
      title: 'По вашему запросу ничего не найдено',
      sub: 'Измените фильтры или строку поиска'
    });
    return;
  }
  if (source.length > 0 && filtered.length === 0){
    grid.querySelectorAll('.is-skeleton')?.forEach(el => el.remove());
    renderEmptyState(grid, {
      title: 'Ничего не найдено',
      sub: 'Сбросьте часть фильтров или измените запрос'
    });
    return;
  }

  // Прогрессивно добавляем карточки; сеточные скелетоны удалятся после первого батча,
  // а пер-карточные (overlay .img-skel) останутся до загрузки конкретного img.
  progressiveAppend(grid, filtered, { firstBatch: 12, batch: 16, delay: 0 });
}

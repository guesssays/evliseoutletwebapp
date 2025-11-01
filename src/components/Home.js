// src/components/Home.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { applyFilters } from './Filters.js';
import { ScrollReset } from '../core/scroll-reset.js';

// 🔸 Акции
import {
  promoIsActive,
  getPromoBanners,
  promoBadgesFor,
  discountInfo,
  effectivePrice,
  shouldShowOnHome, // ⬅️ добавлено
} from '../core/promo.js';

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

/* ================== helpers: наличие ================== */
// единый способ понять, «в наличии» ли товар, даже если поля разрознены
function isInStock(p){
  return p?.inStock === true
    || p?.inStockNow === true
    || p?.readyStock === true
    || p?.stockType === 'ready'
    || (Array.isArray(p?.tags) && p.tags.includes('in-stock'));
}
// нормализуем к полю p.inStock, чтобы остальной код и стили работали стабильно
function normalizeStockFlags(products){
  if (!Array.isArray(products)) return;
  for (const p of products){
    if (typeof p.inStock === 'undefined' || p.inStock === null) {
      p.inStock = isInStock(p);
    }
  }
}

/* ===== skeleton suppressor ===== */
function suppressGridSkeleton(ms = 900){
  try { window.__suppressHomeSkeletonUntil = Date.now() + Math.max(0, ms|0); } catch {}
}
function shouldShowGridSkeleton(){
  const until = Number(window.__suppressHomeSkeletonUntil || 0);
  return Date.now() > until;
}

/* ================== скелетоны ================== */

// ⬇️ Публичная функция показа стартовой сетки скелетонов
export function showHomeSkeleton() {
  if (!shouldShowGridSkeleton()) return; // не показываем при супрессии

  const v = document.getElementById('view');
  if (!v) return;
  // Каркас такой же, как в renderHome, но только скелет-сетка
  v.innerHTML = `
    <div class="chips" id="catChips"></div>
    <div class="grid home-bottom-pad" id="productGrid"></div>`;
  const grid = v.querySelector('#productGrid');
  if (!grid) return;

  const count = calcSkeletonCount();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement('a');
    card.className = 'card is-skeleton';
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = `
      <div class="card-img">
        <div class="img-skel"></div>
      </div>
      <div class="card-body">
        <div class="title skel skel-title"></div>
        <div class="subtitle skel skel-sub"></div>
        <div class="price-row"><div class="price skel skel-price"></div></div>
      </div>`;
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function calcSkeletonCount(){
  const h = (window.visualViewport?.height || window.innerHeight || 700);
  const rows = Math.max(3, Math.min(4, Math.round(h / 260))); // 3–4 ряда
  const cols = (window.innerWidth <= 380) ? 1 : 2;
  return rows * cols; // 6–8
}

function renderSkeletonGrid(container, count){
  if (!shouldShowGridSkeleton()) return; // не генерим сетку при супрессии

  const frag = document.createDocumentFragment();
  for (let i=0;i<count;i++){
    const el = document.createElement('a');
    el.className = 'card is-skeleton';
    el.setAttribute('aria-hidden','true');
    el.innerHTML = `
      <div class="card-img">
        <div class="img-skel"></div>
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
    // overlay-скелет только для конкретной карточки
    const ov = document.createElement('b');
    ov.className = 'img-skel';
    imgWrap.appendChild(ov);

    // fade-in после load
    im.loading = 'lazy';
    im.decoding = 'async';
    im.alt = p.title;
    im.src = p.images?.[0] || '';
    im.classList.remove('is-ready');

    const clear = () => {
      ov.remove();
      im.classList.add('is-ready');
    };

    im.addEventListener('load', clear, { once: true });
    setTimeout(() => { if (ov.isConnected) clear(); }, 2000);
  }

  const titleEl = node.querySelector('.title'); if (titleEl) titleEl.textContent = p.title;

  // Подпись/лейбл
  const subEl   = node.querySelector('.subtitle');
  if (subEl){
    const label = p.categoryLabel || categoryNameBySlug(p.categoryId) || '';
    subEl.textContent = label || (p.inStock ? 'В наличии' : '');
  }

  // 🔸 Цена с учётом акции + зачёркнутая старая при скидке
  const priceEl = node.querySelector('.price');
  if (priceEl){
    const di = discountInfo(p);
    const cur = priceFmt(effectivePrice(p));
    if (di) {
      priceEl.innerHTML = `<span class="old">${priceFmt(di.oldPrice)}</span> <span class="cur">${cur}</span>`;
    } else {
      priceEl.innerHTML = `<span class="cur">${cur}</span>`;
    }
  }

  // 🔸 Промо-бейджи (левый верх карточки)
  const badges = promoBadgesFor(p);
  if (badges.length){
    const media = node.querySelector('.card-img') || node;
    const wrap = document.createElement('div');
    wrap.className = 'promo-badges';
    wrap.innerHTML = badges.map(b => `
      <span class="promo-badge ${b.type}">
        ${b.type==='discount' ? '<i data-lucide="percent"></i>' : '<i data-lucide="zap"></i>'}
        <span>${b.label}</span>
      </span>
    `).join('');
    media.appendChild(wrap);
  }

  const favBtn = node.querySelector('.fav, button.fav');
  if (favBtn){
    const active = isFav(p.id);
    favBtn.classList.toggle('active', active);
    favBtn.setAttribute('aria-pressed', String(active));
    try { favBtn.setAttribute('type','button'); favBtn.setAttribute('role','button'); } catch {}
  }

  return node;
}

function renderPromoBannerNode(bn){
  const a = document.createElement('a');
  a.className = 'promo-banner';
  a.href = '#/promo';
  a.setAttribute('aria-label','Перейти к акции');
  a.innerHTML = `<img src="${bn?.img||''}" alt="${escapeHtml(bn?.alt||'Акция')}" loading="lazy">`;
  return a;
}

function progressiveAppend(grid, list, {firstBatch=12, batch=16, delay=0} = {}){
  const total = list.length;
  let idx = 0;

  if (total === 0) return;

  // 🔸 Врезки баннеров
  const promo = promoIsActive();
  const banners = promo ? getPromoBanners() : [];
  let bnIndex = 0;
  let insertedProducts = 0;

  // Если акция активна — первым элементом рендерим баннер
  if (promo && banners.length){
    grid.appendChild(renderPromoBannerNode(banners[bnIndex % banners.length]));
    bnIndex++;
  }

  const appendSlice = (from, to) => {
    const frag = document.createDocumentFragment();
    for (let i=from; i<to; i++){
      frag.appendChild(createProductNode(list[i]));
      insertedProducts++;

      // после каждого 6го — баннер
      if (promo && banners.length && (insertedProducts % 6 === 0)){
        frag.appendChild(renderPromoBannerNode(banners[bnIndex % banners.length]));
        bnIndex++;
      }
    }
    grid.appendChild(frag);
    window.lucide?.createIcons && lucide.createIcons();
  };

  const first = Math.min(firstBatch, total);
  if (first > 0){
    appendSlice(0, first);
    idx = first;
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
  if (!v) return;

  // ✅ нормализуем наличие
  normalizeStockFlags(state.products);

  // если ещё нет товаров — показываем скелет сразу
  if (!Array.isArray(state.products) || state.products.length === 0) {
    showHomeSkeleton();
    try { window.dispatchEvent(new CustomEvent('view:home-mounted')); } catch {}
    return;
  }

  v.innerHTML = `
    <div class="chips" id="catChips"></div>
    <div class="grid home-bottom-pad" id="productGrid"></div>`;
  const grid = document.getElementById('productGrid');

  // 0) «зонтик» против фликера
  if (!grid.dataset.quietGuardBound){
    ScrollReset.guardNoResetClick(grid, { duration: 1100 });
    grid.dataset.quietGuardBound = '1';
  }

  // 1) сеточные скелетоны (если не подавлены)
  if (shouldShowGridSkeleton()) {
    renderSkeletonGrid(grid, calcSkeletonCount());
  }

  // 2) чипы категорий
  drawCategoriesChips(router);

  // 3) прогрессивный рендер
  requestAnimationFrame(() => {
    drawProducts(state.products);
    try { window.dispatchEvent(new CustomEvent('view:home-mounted')); } catch {}
  });
}

/** Рендер чипов категорий (верхние группы + «Все», «Новинки», «В наличии», «Акции»). */
export function drawCategoriesChips(router){
  const wrap = document.getElementById('catChips');
  if (!wrap) return;

  const mk=(slug, name, active)=>`<button class="chip ${active?'active':''}" data-slug="${slug}">${name}</button>`;

  wrap.innerHTML='';
  // 🔸 при активной акции — показываем чип "Акции" самым первым
  if (promoIsActive()){
    wrap.insertAdjacentHTML('beforeend', mk('promo','Акции', state.filters.category==='promo'));
  }
  wrap.insertAdjacentHTML('beforeend', mk('all','Все товары', state.filters.category==='all'));
  wrap.insertAdjacentHTML('beforeend', mk('new','Новинки', state.filters.category==='new'));
  wrap.insertAdjacentHTML('beforeend', mk('instock','В наличии', state.filters.category==='instock'));
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

      // 🔸 переход на страницу акции
      if (slug === 'promo'){
        location.hash = '#/promo';
        return;
      }

      let list;
      if (slug === 'all') {
        list = state.products;
        state.filters.inStock = false;
      } else if (slug === 'new') {
        list = state.products.slice(0, 24);
        state.filters.inStock = false;
      } else if (slug === 'instock') {
        state.filters.inStock = true;
        list = state.products.filter(isInStock);
      } else {
        const pool = new Set(expandSlugs(slug));
        list = state.products.filter(p => pool.has(p.categoryId));
        state.filters.inStock = false;
      }

      // На переключении — показываем сеточные скелетоны и затем рендерим
      const grid = document.getElementById('productGrid');
      if (grid){
        grid.innerHTML = '';
        if (shouldShowGridSkeleton()) {
          renderSkeletonGrid(grid, calcSkeletonCount());
        }
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

  // ⬇️ главный предфильтр общей сетки: скрываем лимитки вне акции
  const visibleSource = source.filter(shouldShowOnHome);

  // Дальше — твои фильтры
  const base = applyFilters(visibleSource);

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

  // Делегат избранного (+ подавление скролл-ресета/скелетона вокруг клика)
  if (!grid.dataset.favHandlerBound) {
    grid.addEventListener('click', (ev) => {
      const favBtn = ev.target.closest('.fav, button.fav');
      if (!favBtn) return;

      ev.preventDefault();

      try {
        ScrollReset.quiet(1200);
        ScrollReset.suppress(1200);
      } catch {}

      suppressGridSkeleton(1600);

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
    return; // ждём данные — оставляем сеточные скелетоны
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

  // Прогрессивно добавляем карточки
  progressiveAppend(grid, filtered, { firstBatch: 12, batch: 16, delay: 0 });
}

/* utils */
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

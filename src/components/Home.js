// src/components/Home.js
import { state, isFav, toggleFav, k } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { applyFilters } from './Filters.js';
import { ScrollReset } from '../core/scroll-reset.js';
import {
  promoIsActive,
  getPromoBanners,
  promoBadgesFor,
  discountInfo,
  effectivePrice,
  shouldShowOnHome,
  clearPromoTheme,
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
function isInStock(p){
  return p?.inStock === true
    || p?.inStockNow === true
    || p?.readyStock === true
    || p?.stockType === 'ready'
    || (Array.isArray(p?.tags) && p.tags.includes('in-stock'));
}
function normalizeStockFlags(products){
  if (!Array.isArray(products)) return;
  for (const p of products){
    if (typeof p.inStock === 'undefined' || p.inStock === null) {
      p.inStock = isInStock(p);
    }
  }
}

/* ===== Новинки: rolling-окно на 12 ===== */
/* ===== Новинки: всегда мгновенно отдаём top-N из текущих товаров ===== */
function getNewestWindow(limit = 12){
  const products = Array.isArray(state.products) ? state.products.slice() : [];

  // 1) базовый быстрый путь — первые N товаров как "самые новые"
  const topNow = products.slice(0, limit).map(p => ({ ...p, __isNew: true }));

  // 2) пробуем мягко использовать прошлое окно (если оно осмысленное)
  let win = [];
  try { win = JSON.parse(localStorage.getItem(k('news_window')) || '[]'); } catch {}
  if (!Array.isArray(win)) win = [];

  // если кэш пустой или короче лимита — просто возвращаем topNow и обновляем кэш
  if (win.length < limit){
    try { localStorage.setItem(k('news_window'), JSON.stringify(products.slice(0, limit).map(p => String(p.id)))); } catch {}
    return topNow;
  }

  // 3) если кэш есть — валидируем id против текущего ассортимента
  const byId = new Map(products.map(p => [String(p.id), p]));
  const validated = win
    .map(id => byId.get(String(id)))
    .filter(Boolean)
    .slice(0, limit)
    .map(p => ({ ...p, __isNew: true }));

  // если после валидации что-то «усохло» — дополним topNow (без дублей)
  if (validated.length < limit){
    const have = new Set(validated.map(p => String(p.id)));
    for (const p of products){
      if (validated.length >= limit) break;
      const id = String(p.id);
      if (!have.has(id)){
        validated.push({ ...p, __isNew: true });
        have.add(id);
      }
    }
  }

  // 4) обновим кэш аккуратно
  try {
    const ids = validated.map(p => String(p.id));
    localStorage.setItem(k('news_window'), JSON.stringify(ids));
  } catch {}

  return validated;
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
export function showHomeSkeleton() {
  if (!shouldShowGridSkeleton()) return;

  const v = document.getElementById('view');
  if (!v) return;

  // на вход в Home — снимаем любую промо-тему
  try { clearPromoTheme(); } catch {}

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
  const rows = Math.max(3, Math.min(4, Math.round(h / 260)));
  const cols = (window.innerWidth <= 380) ? 1 : 2;
  return rows * cols;
}

function renderSkeletonGrid(container, count){
  if (!shouldShowGridSkeleton()) return;

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

  node.addEventListener('click', (e) => {
    if (e.target?.closest?.('.fav')) e.preventDefault();
  }, { capture: true, passive: false });

  node.href = `#/product/${p.id}`;
  node.dataset.id = String(p.id);

  // IMG + overlay skeleton
  const imgWrap = node.querySelector('.card-img');
  const im = node.querySelector('img');
  if (imgWrap && im){
    const ov = document.createElement('b');
    ov.className = 'img-skel';
    imgWrap.appendChild(ov);

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

  const subEl   = node.querySelector('.subtitle');
  if (subEl){
    const label = p.categoryLabel || categoryNameBySlug(p.categoryId) || '';
    subEl.textContent = label || (p.inStock ? 'В наличии' : '');
  }

  // Цена
  const priceEl = node.querySelector('.price');
  if (priceEl){
    const di = discountInfo(p);
    const eff = priceFmt(effectivePrice(p));
    if (di) {
      priceEl.innerHTML = `<span class="cur deal">${eff}</span>`;
    } else {
      priceEl.innerHTML = `<span class="cur">${eff}</span>`;
    }
  }

  // Бейдж 🔥 для новинок — левый верх, без текста
  if (p.__isNew) {
    const media = node.querySelector('.card-img') || node;
    const hot = document.createElement('div');
    hot.className = 'promo-badges';
    hot.style.right = 'auto';
    hot.style.left  = '8px';
    hot.style.top   = '8px';
    hot.innerHTML = `
      <span class="promo-badge hot" aria-label="Новинка">
        <i data-lucide="flame"></i>
      </span>
    `;
    media.appendChild(hot);
  }

  // Промо-бейджи (скидка/x2)
  const badges = promoBadgesFor(p);
  if (badges.length){
    const media = node.querySelector('.card-img') || node;
    const wrap = document.createElement('div');
    wrap.className = 'promo-badges';
    // Жёстко фиксируем позиционирование, чтобы не растягивалось
    wrap.style.left   = '8px';
    wrap.style.bottom = '8px';
    wrap.style.top    = 'auto';
    wrap.style.right  = 'auto';
wrap.innerHTML = badges.map(b => `
  <span class="promo-badge ${b.type}">
    ${b.type==='discount' ? '<i data-lucide="percent"></i>' : '<i data-lucide="zap"></i>'}
    <span class="lbl">${b.label}</span>
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

/* ================== публичные функции ================== */
export function renderHome(router){
  const v = document.getElementById('view');
  if (!v) return;

// === одноразовый форс-сброс категории на "all" после выхода с промо ===
try {
  const h = location.hash || '';
  const isHome = (h === '#/' || h === '' || h.startsWith('#/home'));
  const forcedAt = Number(window.__forceHomeAllOnce || 0);
  const forceRecent = forcedAt && (Date.now() - forcedAt < 4000); // 4s окно
  const cameFromPromo = (window.__prevHash === '#/promo'); // ✅ вот тут главное
  if (isHome && (forceRecent || cameFromPromo)) {
    state.filters = state.filters || {};
    state.filters.category = 'all';
    window.__forceHomeAllOnce = 0; // одноразово
  }
} catch {}


  // Снимаем промо-оформление
  try { clearPromoTheme(); } catch {}

  // Если мы на главной, а фильтр почему-то 'promo' — сбросим на 'all'
  try {
    const h = location.hash || '';
    if ((h === '#/' || h === '' || h.startsWith('#/home')) && state?.filters?.category === 'promo') {
      state.filters.category = 'all';
    }
  } catch {}

  // Нормализуем флаги наличия
  normalizeStockFlags(state.products);

  // Если нет товаров — показываем скелет
  if (!Array.isArray(state.products) || state.products.length === 0) {
    showHomeSkeleton();
    try { window.dispatchEvent(new CustomEvent('view:home-mounted')); } catch {}
    return;
  }

  // Актуализируем окно «Новинок» (мягко)
  try { getNewestWindow(12); } catch {}

  v.innerHTML = `
    <div class="chips" id="catChips"></div>
    <div class="grid home-bottom-pad" id="productGrid"></div>`;
  const grid = document.getElementById('productGrid');

  // anti-flicker для кликов по избранному
  if (!grid.dataset.quietGuardBound){
    ScrollReset.guardNoResetClick(grid, { duration: 1100 });
    grid.dataset.quietGuardBound = '1';
  }

  // Показать скелет (если не подавлен)
  if (shouldShowGridSkeleton()) {
    renderSkeletonGrid(grid, calcSkeletonCount());
  }

  // Нарисовать чипсы (они сами подсветят активную категорию по state.filters.category)
  drawCategoriesChips(router);

  // Рендерим список по текущему выбранному слагу
  requestAnimationFrame(() => {
    const slug = state?.filters?.category || 'all';
    let list;

    if (slug === 'all') {
      state.filters.inStock = false;
      list = state.products;
    } else if (slug === 'new') {
      state.filters.inStock = false;
      list = getNewestWindow(12);
    } else if (slug === 'instock') {
      state.filters.inStock = true;
      list = state.products.filter(isInStock);
    } else {
      state.filters.inStock = false;
      const pool = new Set(expandSlugs(slug));
      list = state.products.filter(p => pool.has(p.categoryId));
    }

    drawProducts(list);
    try { window.dispatchEvent(new CustomEvent('view:home-mounted')); } catch {}
  });
}

export function drawCategoriesChips(router){
  const wrap = document.getElementById('catChips');
  if (!wrap) return;

  const mk=(slug, name, active)=>`<button class="chip ${active?'active':''}" data-slug="${slug}">${name}</button>`;

  // нормализация активного слага: promo недопустим на Home
  let cur = (state.filters?.category || 'all');
  if (cur === 'promo' && !location.hash.startsWith('#/promo')) {
    cur = 'all';
    try { state.filters.category = 'all'; } catch {}
  }

  // helpers для сортировки верхних групп + исключаем «Другое»
  const isOther = (g)=>{
    const s = (g.slug||'').toLowerCase();
    const n = (g.name||'').toLowerCase();
    return ['другое','разное','other','misc'].includes(s) || ['другое','разное','other','misc'].includes(n);
  };
  const sortKey = (g)=>{
    const s = (g.slug||'').toLowerCase();
    const n = (g.name||'').toLowerCase();
    if (['top','верх','verh','up'].includes(s) || ['верх'].includes(n)) return 0;
    if (['bottom','низ','niz','down'].includes(s) || ['низ'].includes(n)) return 1;
    if (['shoes','обувь','obu'].includes(s) || ['обувь'].includes(n)) return 2;
    if (['bags','сумки','sumki'].includes(s) || ['сумки'].includes(n)) return 3;
    return 99;
  };
  const topGroupsOrdered = (state.categories||[])
    .filter(g => !isOther(g))
    .sort((a,b)=> sortKey(a) - sortKey(b));

  wrap.innerHTML = '';
  wrap.insertAdjacentHTML('beforeend', mk('all','Все товары', cur==='all'));
  if (promoIsActive()){
    wrap.insertAdjacentHTML('beforeend', mk('promo','Акции', cur==='promo'));
  }
  wrap.insertAdjacentHTML('beforeend', mk('new','Новинки', cur==='new'));
  wrap.insertAdjacentHTML('beforeend', mk('instock','В наличии', cur==='instock'));
  topGroupsOrdered.forEach(c=>{
    wrap.insertAdjacentHTML('beforeend', mk(c.slug, c.name, cur===c.slug));
  });

  if (!wrap.dataset.bound){
    wrap.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip'); if (!b) return;

      const slug = b.getAttribute('data-slug');
      if (slug === state.filters.category) return;

      wrap.querySelector('.chip.active')?.classList.remove('active');
      b.classList.add('active');

      state.filters.category = slug;

      if (slug === 'promo'){
        location.hash = '#/promo';
        return;
      }

      let list;
      if (slug === 'all') {
        list = state.products;
        state.filters.inStock = false;
      } else if (slug === 'new') {
        list = getNewestWindow(12);   // <= максимум 12
        state.filters.inStock = false;
      } else if (slug === 'instock') {
        state.filters.inStock = true;
        list = state.products.filter(isInStock);
      } else {
        const pool = new Set(expandSlugs(slug));
        list = state.products.filter(p => pool.has(p.categoryId));
        state.filters.inStock = false;
      }

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

export function drawProducts(list){
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const source = Array.isArray(list) ? list : [];
  const visibleSource = source.filter(shouldShowOnHome);
  const base = applyFilters(visibleSource);

  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = q
    ? base.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.subtitle||'').toLowerCase().includes(q)
      )
    : base;

  if (!grid.dataset.anchorGuard) {
    grid.addEventListener('click', (e) => {
      if (e.target?.closest?.('.fav, button.fav')) e.preventDefault();
    }, { capture: true, passive: false });
    grid.dataset.anchorGuard = '1';
  }

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

  if (source.length === 0 && (state.products?.length || 0) === 0){
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

  progressiveAppend(grid, filtered, { firstBatch: 12, batch: 16, delay: 0 });
}

function progressiveAppend(grid, list, {firstBatch=12, batch=16, delay=0} = {}){
  const total = list.length;
  let idx = 0;
  if (total === 0) return;

  const promo = promoIsActive();
  const banners = promo ? getPromoBanners() : [];
  let bnIndex = 0;
  let insertedProducts = 0;

  if (promo && banners.length){
    grid.appendChild(renderPromoBannerNode(banners[bnIndex % banners.length]));
    bnIndex++;
  }

  const appendSlice = (from, to) => {
    const frag = document.createDocumentFragment();
    for (let i=from; i<to; i++){
      frag.appendChild(createProductNode(list[i]));
      insertedProducts++;

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

function renderPromoBannerNode(bn){
  const a = document.createElement('a');
  a.className = 'promo-banner';
  a.href = '#/promo';
  a.setAttribute('aria-label','Перейти к акции');
  a.innerHTML = `<img src="${bn?.img||''}" alt="${escapeHtml(bn?.alt||'Акция')}" loading="lazy">`;
  return a;
}

/* utils */
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* === Promo → Home: отслеживаем предыдущий hash для дополнительной логики === */
/* === Promo → Home: корректно храним ПРЕДЫДУЩИЙ hash === */
(function trackPrevHash(){
  try {
    // cur — текущий, prev — предыдущий
    window.__curHash = location.hash || '#/';
    window.__prevHash = '#/';

    window.addEventListener('hashchange', () => {
      window.__prevHash = window.__curHash;
      window.__curHash  = location.hash || '';
    }, { passive: true });
  } catch {}
})();

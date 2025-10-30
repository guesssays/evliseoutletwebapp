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

    // 🔒 Глушим клики по .fav на фазе захвата у самой ссылки (<a>), чтобы не допустить навигацию
    node.addEventListener('click', (e) => {
      const favInside = e.target && e.target.closest && e.target.closest('.fav');
      if (favInside) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.cancelBubble = true;
        return false;
      }
    }, { capture: true, passive: false });

    // ВАЖНО: сохраняем id карточки сразу, чтобы делегат мог его считать
    node.href = `#/product/${p.id}`;
    node.dataset.id = String(p.id);

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

    // Кнопка «избранное»: только выставляем состояние и aria,
    // обработчик клика — ТОЛЬКО делегированный ниже.
    const favBtn = node.querySelector('.fav, button.fav');
    if (favBtn){
      const active = isFav(p.id);
      favBtn.classList.toggle('active', active);
      favBtn.setAttribute('aria-pressed', String(active));
      try { favBtn.setAttribute('type','button'); favBtn.setAttribute('role','button'); } catch {}
    }

    frag.appendChild(node);
  }

  grid.appendChild(frag);

  // 🛡️ Доп. capture-страховка на весь grid: если клик пришёл с .fav — не даём всплыть до якорей
  if (!grid.dataset.anchorGuard) {
    grid.addEventListener('click', (e) => {
      if (e.target?.closest?.('.fav, button.fav')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.cancelBubble = true;
        return false;
      }
    }, { capture: true, passive: false });
    grid.dataset.anchorGuard = '1';
  }

  // --- ГЛОБАЛЬНЫЙ делегированный обработчик кликов по сердечкам ---
  if (!grid.dataset.favHandlerBound) {
    grid.addEventListener('click', (ev) => {
      const favBtn = ev.target.closest('.fav, button.fav');
      if (!favBtn) return;

      // не даём якорю/картам перехватить клик
      try {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();
      } catch {}

      try { ScrollReset.quiet(900); } catch {}

      // найдём карточку и productId
      const card = favBtn.closest('.card, a.card');
      const href = card?.getAttribute('href') || '';
      let pid = card?.dataset?.id || '';
      if (!pid && href.startsWith('#/product/')) pid = href.replace('#/product/', '').trim();
      if (!pid) return;

      const now = toggleFav(pid);

      // мгновенно подсветим кнопку
      favBtn.classList.toggle('active', now);
      favBtn.setAttribute('aria-pressed', String(now));

      // глобальный синк (карточка товара / фикс-хедер и т.д.)
      try {
        window.dispatchEvent(new CustomEvent('fav:changed', { detail: { id: pid, active: now } }));
      } catch {}

      // режим «Избранное»: удаляем карточку при снятии из избранного
      const gridEl = favBtn.closest('#productGrid');
      if (gridEl && gridEl.dataset.favMode === '1' && !now) {
        card?.remove();
        if (!gridEl.querySelector('.card')) {
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

  window.lucide?.createIcons && lucide.createIcons();
}

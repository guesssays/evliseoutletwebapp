// src/components/Home.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

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

  // Кнопка «вверх»
  ensureBackToTop();
}

/**
 * Рендер чипов категорий (только верхние группы + «Все», «Новинки»).
 */
export function drawCategoriesChips(router){
  const wrap = document.getElementById('catChips');
  if (!wrap) return;

  const mk=(slug, name, active)=>`<button class="chip ${active?'active':''}" data-slug="${slug}">${name}</button>`;

  wrap.innerHTML='';
  wrap.insertAdjacentHTML('beforeend', mk('all','Все товары', state.filters.category==='all'));
  wrap.insertAdjacentHTML('beforeend', mk('new','Новинки', state.filters.category==='new'));

  // верхний уровень (Верх, Низ, Обувь, Сумки, Разное)
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

      drawProducts(list);
    });
    wrap.dataset.bound = '1';
  }
}

/** Рисуем карточки товаров. */
export function drawProducts(list){
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML='';

  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = list.filter(p=>
    p.title.toLowerCase().includes(q) ||
    (p.subtitle||'').toLowerCase().includes(q)
  );

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
      favBtn.onclick = (ev)=>{
        ev.preventDefault();
        toggleFav(p.id);
      };
    }

    frag.appendChild(node);
  }

  grid.appendChild(frag);
  window.lucide?.createIcons && lucide.createIcons();
}

/* ===== ВСПОМОГАТЕЛЬНОЕ: кнопка «Вверх» ===== */
const BTN_ID = 'backToTopBtn';

function ensureBackToTop(){
  let btn = document.getElementById(BTN_ID);

  if (!btn){
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label','Вернуться к началу');
    btn.innerHTML = `<i data-lucide="arrow-up"></i>`;
    Object.assign(btn.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',                 // будет пересчитано функцией positionBackToTop()
      width: '44px',
      height: '44px',
      borderRadius: '999px',
      border: '1px solid var(--border, rgba(0,0,0,.12))',
      background: 'var(--card, rgba(0,0,0,.04))',
      backdropFilter: 'saturate(180%) blur(8px)',
      boxShadow: '0 6px 18px rgba(0,0,0,.12)',
      display: 'none',                // скрыта по умолчанию, показывается при скролле
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      cursor: 'pointer'
    });
    // чуть увеличим hit area на мобильных
    btn.style.touchAction = 'manipulation';

    document.body.appendChild(btn);
    window.lucide?.createIcons && lucide.createIcons();

    btn.addEventListener('click', ()=>{
      try{ document.activeElement?.blur?.(); }catch{}
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    });
  }

  // Позиционирование с учётом таббара
  function positionBackToTop(){
    const tab = document.getElementById('tabbar');
    const tabH = tab?.offsetHeight || 0;
    // 12px от таббара + 16px общий отступ, но минимум 16px
    const bottom = Math.max(16, tabH + 12);
    btn.style.bottom = `${bottom}px`;
  }

  // Показ/скрытие по скроллу
  function toggleVisibility(){
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    btn.style.display = y > 400 ? 'inline-flex' : 'none';
  }

  // Первичная инициализация
  positionBackToTop();
  toggleVisibility();

  // Обработчики
  window.addEventListener('scroll', toggleVisibility, { passive: true });
  window.addEventListener('resize', positionBackToTop);

  // Если в вашем приложении таббар может менять высоту динамически —
  // можно дергать это событие вручную после изменения таббара:
  // window.dispatchEvent(new Event('tabbar:resize'));
  window.addEventListener('tabbar:resize', positionBackToTop);
}

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
      bottom: '16px', // пересчитывается ниже
      width: '44px',
      height: '44px',
      borderRadius: '999px',
      border: '1px solid var(--border, rgba(0,0,0,.12))',
      background: 'var(--card, rgba(0,0,0,.04))',
      backdropFilter: 'saturate(180%) blur(8px)',
      boxShadow: '0 6px 18px rgba(0,0,0,.12)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      cursor: 'pointer',
      touchAction: 'manipulation'
    });
    document.body.appendChild(btn);
    window.lucide?.createIcons && lucide.createIcons();

    btn.addEventListener('click', ()=>{
      try{ document.activeElement?.blur?.(); }catch{}
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    });
  }

  // --- утилиты ---
  const TABBAR_SELECTORS = ['#tabbar','.tabbar','[data-tabbar]','[role="tablist"]'];

  function findTabbar(){
    for (const sel of TABBAR_SELECTORS){
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function getSafeInsetBottom(){
    // пробуем считать safe-area через CSS env
    // создаём временный элемент с padding-bottom: env(safe-area-inset-bottom)
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:fixed;bottom:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom);';
    document.body.appendChild(tmp);
    const cs = getComputedStyle(tmp);
    const pb = parseFloat(cs.paddingBottom) || 0;
    document.body.removeChild(tmp);
    return pb;
  }

  // Позиционирование с учётом реального перекрытия
  function positionBackToTop(){
    const tab = findTabbar();
    const safe = getSafeInsetBottom();
    let bottom = 16 + safe; // базовый отступ

    if (tab){
      const r = tab.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      // если таббар у нижней кромки и может перекрывать кнопку
      if (r.height > 0 && r.top < vh){
        // насколько зона таббара наезжает снизу (обычно r.bottom ~ vh)
        const overlap = Math.max(0, vh - r.top);
        // 12px буфер над таббаром + safe-area
        bottom = Math.max(16 + safe, overlap + 12 + safe);
      }
    }

    btn.style.bottom = `${Math.round(bottom)}px`;
  }

  function toggleVisibility(){
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    btn.style.display = y > 400 ? 'inline-flex' : 'none';
  }

  // первичный расчёт
  requestAnimationFrame(()=>{
    positionBackToTop();
    toggleVisibility();
  });

  // обработчики
  window.addEventListener('scroll', toggleVisibility, { passive: true });
  window.addEventListener('resize', positionBackToTop);
  window.addEventListener('hashchange', ()=>{ setTimeout(positionBackToTop, 0); });

  // если таббар меняет размер — наблюдаем его
  const tabForObserver = findTabbar();
  if (window.ResizeObserver && tabForObserver){
    const ro = new ResizeObserver(()=> positionBackToTop());
    ro.observe(tabForObserver);
  }

  // поддержка iOS клавиатуры/безрамочных экранов
  if (window.visualViewport){
    window.visualViewport.addEventListener('resize', positionBackToTop);
  }

  // поддержка вашего пользовательского события
  window.addEventListener('tabbar:resize', positionBackToTop);

  // небольшой «пост-тик» после анимаций/иконок
  setTimeout(positionBackToTop, 300);
}

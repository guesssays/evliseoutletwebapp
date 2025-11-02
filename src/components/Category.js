import { state, k } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { isFav, toggleFav } from '../core/state.js';

const DEFAULT_SLUG = 'all';

/* ================== helpers: категории ================== */
function findCategoryBySlug(slug){
  for (const g of state.categories || []){
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
  const c = findCategoryBySlug(slug);
  return c?.name || '';
}
function categoryLabel(slug){
  if (!slug || slug === DEFAULT_SLUG) return 'Все товары';
  if (slug === 'new') return 'Новинки';
  if (slug === 'instock') return 'В наличии';
  return categoryNameBySlug(slug) || 'Все товары';
}

/* ===== Новинки: rolling-окно на 12 ===== */
function getNewestWindow(limit = 12){
  const products = Array.isArray(state.products) ? state.products.slice() : [];
  const idsNow = products.map(p => String(p.id));

  let win = [];
  try { win = JSON.parse(localStorage.getItem(k('news_window')) || '[]'); } catch {}
  if (!Array.isArray(win)) win = [];

  // новые id, которых не было в окне (порядок текущего списка считаем «от новых к старым»)
  const seen = new Set(win);
  const incoming = [];
  for (const id of idsNow){
    if (!seen.has(id)) incoming.push(id);
  }

  // новые вперед + сохранившиеся старые, обрезаем до лимита
  const preserved = win.filter(id => idsNow.includes(id));
  const updated = [...incoming, ...preserved].slice(0, limit);

  try { localStorage.setItem(k('news_window'), JSON.stringify(updated)); } catch {}

  // собираем товары в порядке окна и помечаем флагом
  const byId = new Map(products.map(p => [String(p.id), p]));
  return updated.map(id => {
    const p = byId.get(id);
    return p ? { ...p, __isNew: true } : null;
  }).filter(Boolean);
}

/* ================== рендер сетки ================== */
function drawProducts(list){
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML='';

  const q = (state.filters?.query||'').trim().toLowerCase();
  const filtered = (list||[]).filter(p=>
    String(p.title||'').toLowerCase().includes(q) ||
    String(p.subtitle||'').toLowerCase().includes(q)
  );

  const frag = document.createDocumentFragment();
  for (const p of filtered){
    const t = document.getElementById('product-card');
    if (!t) continue;
    const node = t.content.firstElementChild.cloneNode(true);

    node.href = `#/product/${p.id}`;
    node.dataset.id = String(p.id);

    const im = node.querySelector('img');
    if (im){ im.src = p.images?.[0] || ''; im.alt = p.title || ''; }

    node.querySelector('.title')?.append(p.title || '');

    const subEl = node.querySelector('.subtitle');
    if (subEl) {
      const labelById = categoryNameBySlug(p.categoryId) || '';
      subEl.textContent = p.categoryLabel || labelById;
    }

    const priceEl = node.querySelector('.price');
    if (priceEl) priceEl.textContent = priceFmt(p.price);

    // бейдж 🔥 для новинок — слева сверху (напротив сердечка)
    if (p.__isNew) {
      const media = node.querySelector('.card-img') || node;
      const badge = document.createElement('div');
      badge.className = 'promo-badges';
      badge.style.right = 'auto';
      badge.style.left  = '8px';
      badge.innerHTML = `
        <span class="promo-badge hot">
          <i data-lucide="flame"></i><span>hot</span>
        </span>
      `;
      media.appendChild(badge);
    }

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
  try { window.lucide?.createIcons?.(); } catch {}
}

/**
 * Рендер экрана категории по slug:
 *  - 'all'  → Все товары (дефолт)
 *  - 'new'  → Новинки (rolling-окно 12)
 *  - 'instock' → Только наличие
 *  - иные   → агрегируем дочерние подкатегории
 * @param {{slug:string}} params
 */
export function renderCategory(params){
  const slug = params?.slug || DEFAULT_SLUG;
  state.filters = state.filters || {};
  state.filters.category = slug;

  const v = document.getElementById('view');
  if (!v) return;

  v.innerHTML = `
    <div class="section">
      <h2 style="margin:8px 12px">${categoryLabel(slug)}</h2>
    </div>
    <div class="grid home-bottom-pad" id="productGrid"></div>
  `;

  let list;
  if (slug === 'all') {
    list = state.products || [];
  } else if (slug === 'new') {
    list = getNewestWindow(12);
  } else if (slug === 'instock') {
    state.filters.inStock = true; // синк
    list = (state.products || []).filter(p => !!p.inStock);
  } else {
    const pool = new Set(expandSlugs(slug));
    list = (state.products || []).filter(p => pool.has(p.categoryId));
  }
  if (slug !== 'instock') state.filters.inStock = false;

  drawProducts(list);
}

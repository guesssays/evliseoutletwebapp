// src/components/Filters.js
import { state } from '../core/state.js';
import { openModal, closeModal } from '../core/modal.js';
import { el } from '../core/utils.js';

/* ===== утилиты по категориям ===== */
function allSubcategories() {
  const list = [];
  for (const grp of state.categories || []) {
    for (const ch of grp.children || []) {
      list.push({ value: ch.slug, label: ch.name });
    }
  }
  if (!list.length) {
    const uniq = Array.from(new Set((state.products || []).map(p => p.categoryId).filter(Boolean)));
    return uniq.map(slug => ({ value: slug, label: slug }));
  }
  return list;
}
function categoryNameBySlug(slug) {
  for (const grp of state.categories || []) {
    for (const ch of grp.children || []) {
      if (ch.slug === slug) return ch.name;
    }
  }
  return slug || '';
}

/* ===== определение «обувных» категорий ===== */
const SHOES_SLUG_HINTS = ['shoe', 'shoes', 'sneaker', 'sneakers', 'boots', 'obuv', 'kross', 'kedi', 'kedy', 'krossovki', 'botinki'];
const SHOES_CAT_FALLBACK = new Set(['kedy', 'krossovki', 'botinki']);

function buildShoesCategorySetNow() {
  const set = new Set([...SHOES_CAT_FALLBACK]);
  for (const grp of state.categories || []) {
    const grpIsShoes = /обув/i.test(grp.name || '') || SHOES_SLUG_HINTS.some(h => String(grp.slug||'').includes(h));
    for (const ch of grp.children || []) {
      const slug = String(ch.slug || '');
      const name = String(ch.name || '');
      const looksLikeShoes =
        grpIsShoes ||
        /обув/i.test(name) ||
        SHOES_SLUG_HINTS.some(h => slug.includes(h));
      if (looksLikeShoes) set.add(slug);
    }
  }
  return set;
}

/* — эвристика: «похоже на обувные размеры» (диапазоны/числа 30..50) — */
function looksLikeShoeSizes(sizes = []) {
  let hits = 0;
  for (const s of sizes) {
    const t = String(s).toLowerCase().trim();
    const mRange = t.match(/^(\d+(?:[.,]\d+)?)\s*[-/]\s*(\d+(?:[.,]\d+)?)/);
    if (mRange) { hits++; continue; }
    const mNum = t.match(/\b(\d{2})(?:[.,]\d+)?\b/);
    if (mNum) {
      const n = parseFloat(mNum[1]);
      if (n >= 30 && n <= 50) hits++;
    }
  }
  return hits >= Math.max(1, Math.ceil(sizes.length * 0.3));
}

function isShoesProduct(p) {
  if (!p) return false;
  if (p.kind === 'shoes') return true;
  if (p.sizeChartType === 'shoes') return true;
  if (p.sizeChart && p.sizeChart.type === 'shoes') return true;

  const cats = buildShoesCategorySetNow();
  if (cats.has(p.categoryId)) return true;

  const slug = String(p.slug || '').toLowerCase();
  const cat  = String(p.categoryId || '').toLowerCase();
  if (SHOES_SLUG_HINTS.some(h => slug.includes(h) || cat.includes(h))) return true;

  if (looksLikeShoeSizes(p.sizes || [])) return true;

  return false;
}

/* ===== отображаемые цвета ===== */
const COLOR_MAP = {
  '#000000': 'чёрный', black: 'чёрный',
  '#ffffff': 'белый',  white: 'белый',
  '#1e3a8a':'тёмно-синий', '#3b82f6':'синий', '#60a5fa':'голубой',
  '#93c5fd':'светло-голубой', '#0ea5e9':'голубой',
  '#6b7280':'серый', '#808080':'серый', '#111827':'графит', '#616161':'серый',
  '#b91c1c':'красный', '#ef4444':'красный', '#f472b6':'розовый', '#a855f7':'фиолетовый',
  '#16a34a':'зелёный', '#166534':'тёмно-зелёный',
  '#556b2f':'хаки', '#4b5320':'оливковый', '#1f5132':'тёмно-зелёный',
  '#7b3f00':'коричневый', '#8b5a2b':'коричневый', '#6b4226':'коричневый',
  '#b0a36f':'бежевый', '#c8b796':'бежевый', '#d1b892':'бежевый', '#c19a6b':'бежевый',
  '#a3a380':'оливковый'
};
function colorLabel(c=''){
  const k = String(c).toLowerCase();
  return COLOR_MAP[k] || (k === '' ? '' : k.replace(/^#/, ''));
}

/* ===== сортировка размеров ===== */
const SIZE_RANK_MAP = {
  'xxs': 10, 'xs': 20, 's': 30, 'm': 40, 'l': 50,
  'xl': 60, 'xxl': 70, '2xl': 70, '3xl': 80, '4xl': 90, '5xl': 100, '6xl': 110, '7xl': 120
};
function normalizeSizeToken(x='') {
  return String(x).trim().toLowerCase().replace(/\s+/g, '');
}
function clothingKey(x) {
  const raw = String(x);
  const k = normalizeSizeToken(raw);
  if (k in SIZE_RANK_MAP) return { group: 0, val: SIZE_RANK_MAP[k], raw };
  if (/(one|uni|free)/i.test(k)) return { group: 2, val: Number.POSITIVE_INFINITY, raw };
  const num = parseFloat(k.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isNaN(num)) return { group: 1, val: num, raw };
  return { group: 3, val: raw.localeCompare.bind(raw), raw };
}
function sortClothingSizes(arr) {
  return [...arr].sort((a,b)=>{
    const A = clothingKey(a), B = clothingKey(b);
    if (A.group !== B.group) return A.group - B.group;
    if (typeof A.val === 'function' || typeof B.val === 'function') {
      return String(A.raw).localeCompare(String(B.raw));
    }
    if (A.val !== B.val) return A.val - B.val;
    return String(A.raw).localeCompare(String(B.raw));
  });
}

function shoesNumeric(x='') {
  const s = String(x).trim().toLowerCase();
  let m = s.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
  if (m) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    return (a + b) / 2;
  }
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (m) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    return (a + b) / 2;
  }
  const n = parseFloat(s.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? NaN);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}
function sortShoesSizes(arr) {
  return [...arr].sort((a,b)=>{
    const na = shoesNumeric(a), nb = shoesNumeric(b);
    if (na !== nb) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

/* ===== фильтрация ===== */
export function applyFilters(list){
  const f = state.filters || {};
  const subcats = Array.isArray(f.subcats) ? f.subcats : [];

  const norm = v => String(v ?? '').trim().toLowerCase();
  const wantSizeLegacy  = (f.size || []).map(norm);
  const wantClothes     = (f.sizeClothes || []).map(norm);
  const wantShoes       = (f.sizeShoes || []).map(norm);
  const wantColors      = (f.colors || []).map(norm);

  const shoesCats = buildShoesCategorySetNow();

  const shoesMode =
    wantShoes.length > 0 &&
    wantClothes.length === 0 &&
    wantSizeLegacy.length === 0;

  let effectiveSubcats = subcats;
  if (shoesMode && subcats.length) {
    const onlyShoes = subcats.filter(s => shoesCats.has(s));
    effectiveSubcats = onlyShoes.length ? onlyShoes : [];
  }

  return (list || []).filter(p=>{
    const productIsShoes = isShoesProduct(p);

    if (shoesMode && !productIsShoes) return false;

    if (effectiveSubcats.length){
      if (!p.categoryId || !effectiveSubcats.includes(p.categoryId)) return false;
    }

    const sizes = (p.sizes || []).map(norm);

    const wantForThisProduct = productIsShoes
      ? (wantShoes.length ? wantShoes : wantSizeLegacy)
      : (wantClothes.length ? wantClothes : wantSizeLegacy);

    if (wantForThisProduct.length){
      if (!sizes.some(s => wantForThisProduct.includes(s))) return false;
    }

    if (wantColors.length){
      const colors = (p.colors || []).map(norm);
      if (!colors.some(c => wantColors.includes(c))) return false;
    }

    if (f.minPrice != null && p.price < f.minPrice) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    if (f.inStock && p.soldOut) return false;

    return true;
  });
}

/* ===== сбор значений для модалки ===== */
function collectSizes() {
  const clothes = new Set();
  const shoes   = new Set();
  for (const p of state.products || []) {
    const target = isShoesProduct(p) ? shoes : clothes;
    for (const s of (p.sizes || [])) target.add(s);
  }
  return {
    clothes: sortClothingSizes([...clothes]),
    shoes:   sortShoesSizes([...shoes]),
  };
}

/* helpers */
function chipGroup(items, selected, key, {withSwatch=false}={}){
  return items.map(v=>{
    const val   = (typeof v === 'object') ? v.value : v;
    const label = (typeof v === 'object') ? v.label : v;
    const sw = withSwatch ? `<span class="swatch" style="--sw:${String(val).startsWith('#')?val:'#000'}"></span>` : '';
    return `<button class="chip chip--select ${selected.includes(val)?'active':''}" data-${key}="${val}">${sw}${label}</button>`;
  }).join('');
}
const count = a => (Array.isArray(a)?a.length:0);

/* ===== модалка фильтров ===== */
export function openFilterModal(router){
  const cats = allSubcategories(); // [{value, label}]
  const { clothes: allSizesClothes, shoes: allSizesShoes } = collectSizes();

  const allColorsRaw = Array.from(new Set((state.products || []).flatMap(p=>p.colors||[])));
  const allColors = allColorsRaw.map(v => ({ value: v, label: colorLabel(v) }));

  // начальные значения (совместимость с legacy size)
  const selClothes = state.filters.sizeClothes || [];
  const selShoes   = state.filters.sizeShoes   || [];
  const selLegacy  = state.filters.size        || [];
  const initialClothes = selClothes.length ? selClothes : selLegacy;
  const initialShoes   = selShoes.length   ? selShoes   : selLegacy;

  const selCatsCount   = count(state.filters.subcats);
  const selClothCount  = count(initialClothes);
  const selShoesCount  = count(initialShoes);
  const selColorCount  = count(state.filters.colors);

  openModal({
    title: 'Фильтры',
    body: `
      <div class="filters-modal">
        <div class="filters-hint">
          Выберите категории, размеры или цвета. Нажмите «Сбросить» для очистки.
        </div>

        <section class="filters-card">
          <div class="filters-card__head">
            <div class="filters-card__title">Категория</div>
            <div class="filters-card__meta">${selCatsCount ? `${selCatsCount} выбрано` : 'Не выбрано'}</div>
          </div>
          <div class="filters-card__body">
            <div class="chipbar" id="fCats">${chipGroup(cats, state.filters.subcats || [], 'cat')}</div>
          </div>
        </section>

        <section class="filters-card">
          <div class="filters-card__head">
            <div class="filters-card__title">Размер одежды</div>
            <div class="filters-card__meta">${selClothCount ? `${selClothCount} выбрано` : 'Не выбрано'}</div>
          </div>
          <div class="filters-card__body">
            <div class="chipbar" id="fSizesClothes">${chipGroup(allSizesClothes, initialClothes, 'size-clothes')}</div>
          </div>
        </section>

        <section class="filters-card">
          <div class="filters-card__head">
            <div class="filters-card__title">Размер обуви</div>
            <div class="filters-card__meta">${selShoesCount ? `${selShoesCount} выбрано` : 'Не выбрано'}</div>
          </div>
          <div class="filters-card__body">
            <div class="chipbar" id="fSizesShoes">${chipGroup(allSizesShoes, initialShoes, 'size-shoes')}</div>
            <div class="filters-note">Если выбрать размер обуви без категории — покажем всю обувь с этим размером.</div>
          </div>
        </section>

        <section class="filters-card">
          <div class="filters-card__head">
            <div class="filters-card__title">Цвет</div>
            <div class="filters-card__meta">${selColorCount ? `${selColorCount} выбрано` : 'Не выбрано'}</div>
          </div>
          <div class="filters-card__body">
            <div class="chipbar" id="fColors">
              ${allColors.map(({value,label})=>`
                <button class="chip chip--select ${ (state.filters.colors||[]).includes(value)?'active':''}" data-color="${value}">
                  <span class="swatch" style="--sw:${String(value).startsWith('#')?value:'#000'}"></span>${label}
                </button>`).join('')}
            </div>
          </div>
        </section>

        <div class="filters-inline">
          <label class="toggle">
            <input id="fStock" type="checkbox" ${state.filters.inStock?'checked':''}>
            <span>Только в наличии</span>
          </label>
          <button id="clearBtn" class="pill pill--ghost" type="button">
            <i class="i-x"></i> Сбросить всё
          </button>
        </div>
      </div>
    `,
    actions: [
      { label: 'Отмена', variant: 'secondary', onClick: closeModal },
      { label: 'Применить', onClick: ()=>{
        state.filters.inStock = el('#fStock').checked;
        const pick=(sel,attr)=> Array.from(el(sel).querySelectorAll('.chip.active')).map(b=>b.getAttribute(attr));
        state.filters.subcats     = pick('#fCats','data-cat');
        state.filters.sizeClothes = pick('#fSizesClothes','data-size-clothes');
        state.filters.sizeShoes   = pick('#fSizesShoes','data-size-shoes');
        state.filters.colors      = pick('#fColors','data-color');
        state.filters.size = []; // legacy off
        closeModal(); router(); renderActiveFilterChips();
      }}
    ],
    onOpen: ()=>{
      ['#fCats','#fSizesClothes','#fSizesShoes','#fColors'].forEach(s=>{
        el(s).addEventListener('click', e=>{
          const btn = e.target.closest('.chip'); if(!btn) return;
          btn.classList.toggle('active');
        });
      });

      el('#clearBtn').onclick = ()=>{
        state.filters = {
          ...state.filters,
          subcats: [],
          size: [],
          sizeClothes: [],
          sizeShoes: [],
          colors: [],
          minPrice: null,
          maxPrice: null,
          inStock: false
        };
        closeModal();
        router();
        renderActiveFilterChips();
      };
    }
  });
}

/* ===== активные чипы над лентой ===== */
export function renderActiveFilterChips(){
  const bar = el('#activeFilters'); if (!bar) return; bar.innerHTML='';

  const pushChip=(label, onRemove)=>{
    // если у тебя есть <template id="filter-chip"> — используем его визуально, а внутрь добавим крестик
    const tpl = document.getElementById('filter-chip');
    let node;
    if (tpl && tpl.content) {
      node = tpl.content.firstElementChild.cloneNode(true);
      node.textContent = label;
      node.classList.add('active', 'filter-chip');
    } else {
      node = document.createElement('button');
      node.className = 'chip active filter-chip';
      node.textContent = label;
    }
    const close = document.createElement('span');
    close.className = 'chip-x';
    close.setAttribute('aria-label', 'Убрать фильтр');
    close.innerHTML = '&times;';
    node.appendChild(close);
    node.addEventListener('click', (e)=>{
      if (e.target === close) { onRemove?.(); }
    });
    bar.appendChild(node);
  };

  // Категория
  if (state.filters.subcats?.length) {
    const labels = state.filters.subcats.map(categoryNameBySlug);
    pushChip('Категория: ' + labels.join(', '), ()=>{
      state.filters.subcats = [];
      const ev = new CustomEvent('filters:changed'); window.dispatchEvent(ev);
    });
  }
  // Размеры
  if (state.filters.sizeClothes?.length) {
    pushChip('Размер (одежда): ' + state.filters.sizeClothes.join(', '), ()=>{
      state.filters.sizeClothes = [];
      const ev = new CustomEvent('filters:changed'); window.dispatchEvent(ev);
    });
  }
  if (state.filters.sizeShoes?.length) {
    pushChip('Размер (обувь): ' + state.filters.sizeShoes.join(', '), ()=>{
      state.filters.sizeShoes = [];
      const ev = new CustomEvent('filters:changed'); window.dispatchEvent(ev);
    });
  }
  // Цвет
  if (state.filters.colors?.length) {
    pushChip('Цвет: ' + state.filters.colors.map(colorLabel).join(', '), ()=>{
      state.filters.colors = [];
      const ev = new CustomEvent('filters:changed'); window.dispatchEvent(ev);
    });
  }
  // Только в наличии
  if (state.filters.inStock) {
    pushChip('Только в наличии', ()=>{
      state.filters.inStock = false;
      const ev = new CustomEvent('filters:changed'); window.dispatchEvent(ev);
    });
  }

  // Глобальная очистка (если есть хоть что-то)
  const hasAny =
    (state.filters.subcats?.length) ||
    (state.filters.sizeClothes?.length) ||
    (state.filters.sizeShoes?.length) ||
    (state.filters.colors?.length) ||
    state.filters.inStock;

  if (hasAny) {
    const clearAll = document.createElement('button');
    clearAll.className = 'pill pill--ghost pill--clear-all';
    clearAll.innerHTML = '<i class="i-x"></i> Сбросить фильтры';
    clearAll.onclick = ()=>{
      state.filters = {
        ...state.filters,
        subcats: [],
        size: [],
        sizeClothes: [],
        sizeShoes: [],
        colors: [],
        minPrice: null,
        maxPrice: null,
        inStock: false
      };
      const ev = new CustomEvent('filters:changed'); window.dispatchEvent(ev);
    };
    bar.appendChild(clearAll);
  }

  // Реакция на быструю очистку: перерендерить ленту и сами чипы
  window.addEventListener('filters:changed', ()=>{
    // найдём router из глобального контекста (как в проекте) — чаще всего это window.appRouter
    try { window.appRouter?.(); } catch {}
    renderActiveFilterChips();
  }, { once:true }); // одноразово каждую отрисовку
}

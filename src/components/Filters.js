// src/components/Filters.js
import { state } from '../core/state.js';
import { openModal, closeModal } from '../core/modal.js';
import { el } from '../core/utils.js';

/* ===== базовое состояние фильтров ===== */
function ensureFilters() {
  if (!state.filters || typeof state.filters !== 'object') {
    state.filters = {
      subcats: [],
      size: [],            // legacy (не используем, но храним пустым ради совместимости)
      sizeClothes: [],
      sizeShoes: [],
      minPrice: null,
      maxPrice: null,
      inStock: false,
    };
  }
  return state.filters;
}

function resetAllFilters() {
  state.filters = {
    ...ensureFilters(),
    subcats: [],
    size: [],
    sizeClothes: [],
    sizeShoes: [],
    minPrice: null,
    maxPrice: null,
    inStock: false,
  };
}

/* ===== категории ===== */
function allSubcategories() {
  const list = [];
  for (const grp of state.categories || []) {
    for (const ch of grp.children || []) {
      list.push({ value: ch.slug, label: ch.name });
    }
  }
  if (!list.length) {
    const uniq = Array.from(new Set((state.products || [])
      .map(p => p.categoryId)
      .filter(Boolean)));
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

/* ===== обувные эвристики ===== */
const SHOES_SLUG_HINTS = ['shoe','shoes','sneaker','sneakers','boots','obuv','kross','kedi','kedy','krossovki','botinki'];
const SHOES_CAT_FALLBACK = new Set(['kedy','krossovki','botinki']);

function buildShoesCategorySetNow() {
  const set = new Set([...SHOES_CAT_FALLBACK]);
  for (const grp of state.categories || []) {
    const grpIsShoes = /обув/i.test(grp.name || '') ||
      SHOES_SLUG_HINTS.some(h => String(grp.slug||'').includes(h));
    for (const ch of grp.children || []) {
      const slug = String(ch.slug || '');
      const name = String(ch.name || '');
      const looksLikeShoes =
        grpIsShoes || /обув/i.test(name) || SHOES_SLUG_HINTS.some(h => slug.includes(h));
      if (looksLikeShoes) set.add(slug);
    }
  }
  return set;
}
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

/* ===== сортировка размеров ===== */
const SIZE_RANK_MAP = { 'xxs':10, 'xs':20, 's':30, 'm':40, 'l':50, 'xl':60, 'xxl':70, '2xl':70, '3xl':80, '4xl':90, '5xl':100, '6xl':110, '7xl':120 };
function normalizeSizeToken(x='') { return String(x).trim().toLowerCase().replace(/\s+/g, ''); }
function clothingKey(x) {
  const raw = String(x); const k = normalizeSizeToken(raw);
  if (k in SIZE_RANK_MAP) return { group:0, val: SIZE_RANK_MAP[k], raw };
  if (/(one|uni|free)/i.test(k)) return { group:2, val: Number.POSITIVE_INFINITY, raw };
  const num = parseFloat(k.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isNaN(num)) return { group:1, val:num, raw };
  return { group:3, val: raw.localeCompare.bind(raw), raw };
}
function sortClothingSizes(arr) {
  return [...arr].sort((a,b)=>{
    const A=clothingKey(a), B=clothingKey(b);
    if (A.group !== B.group) return A.group - B.group;
    if (typeof A.val === 'function' || typeof B.val === 'function') return String(A.raw).localeCompare(String(B.raw));
    if (A.val !== B.val) return A.val - B.val;
    return String(A.raw).localeCompare(String(B.raw));
  });
}
function shoesNumeric(x='') {
  const s = String(x).trim().toLowerCase();
  let m = s.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
  if (m) { const a = parseFloat(m[1].replace(',', '.')); const b = parseFloat(m[2].replace(',', '.')); return (a+b)/2; }
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (m) { const a = parseFloat(m[1].replace(',', '.')); const b = parseFloat(m[2].replace(',', '.')); return (a+b)/2; }
  const n = parseFloat(s.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? NaN);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}
function sortShoesSizes(arr) {
  return [...arr].sort((a,b)=>{ const na = shoesNumeric(a), nb = shoesNumeric(b); if (na !== nb) return na - nb; return String(a).localeCompare(String(b)); });
}

/* ===== фильтрация (БЕЗ цвета) ===== */
export function applyFilters(list){
  ensureFilters();
  const f = state.filters;
  const subcats = Array.isArray(f.subcats) ? f.subcats : [];

  const norm = v => String(v ?? '').trim().toLowerCase();
  const wantSizeLegacy  = (f.size || []).map(norm);
  const wantClothes     = (f.sizeClothes || []).map(norm);
  const wantShoes       = (f.sizeShoes || []).map(norm);

  const shoesCats = buildShoesCategorySetNow();
  const shoesMode = wantShoes.length > 0 && wantClothes.length === 0 && wantSizeLegacy.length === 0;

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

    // Цвет полностью убран

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

/* ===== helpers ===== */
function chipGroup(items, selected, key){
  return items.map(v=>{
    const val   = (typeof v === 'object') ? v.value : v;
    const label = (typeof v === 'object') ? v.label : v;
    return `<button class="chip chip--select ${selected.includes(val)?'active':''}" data-${key}="${val}">${label}</button>`;
  }).join('');
}
const count = a => (Array.isArray(a)?a.length:0);

/* ===== модалка фильтров (цвет убран, ряды — в одну строку со скроллом) ===== */
export function openFilterModal(router){
  ensureFilters();

  const cats = allSubcategories();
  const { clothes: allSizesClothes, shoes: allSizesShoes } = collectSizes();

  // начальные значения (совместимость с legacy size)
  const selClothes = state.filters.sizeClothes || [];
  const selShoes   = state.filters.sizeShoes   || [];
  const selLegacy  = state.filters.size        || [];
  const initialClothes = selClothes.length ? selClothes : selLegacy;
  const initialShoes   = selShoes.length   ? selShoes   : selLegacy;

  const selCatsCount   = count(state.filters.subcats);
  const selClothCount  = count(initialClothes);
  const selShoesCount  = count(initialShoes);

  openModal({
    title: 'Фильтры',
    body: `
      <div class="filters-modal">
        <div class="filters-hint">
          Выберите категории и размеры. Нажмите «Сбросить» для очистки.
        </div>

        <section class="filters-card">
          <div class="filters-card__head">
            <div class="filters-card__title">Категория</div>
            <div class="filters-card__meta">${selCatsCount ? `${selCatsCount} выбрано` : 'Не выбрано'}</div>
          </div>
          <div class="filters-card__body">
            <div class="chipbar chipbar--scroll" id="fCats">${chipGroup(cats, state.filters.subcats || [], 'cat')}</div>
          </div>
        </section>

        <section class="filters-card">
          <div class="filters-card__head">
            <div class="filters-card__title">Размер одежды</div>
            <div class="filters-card__meta">${selClothCount ? `${selClothCount} выбрано` : 'Не выбрано'}</div>
          </div>
          <div class="filters-card__body">
            <div class="chipbar chipbar--scroll" id="fSizesClothes">${chipGroup(allSizesClothes, initialClothes, 'size-clothes')}</div>
          </div>
        </section>

        <section class="filters-card">
          <div class="filters-card__head">
            <div class="filters-card__title">Размер обуви</div>
            <div class="filters-card__meta">${selShoesCount ? `${selShoesCount} выбрано` : 'Не выбрано'}</div>
          </div>
          <div class="filters-card__body">
            <div class="chipbar chipbar--scroll" id="fSizesShoes">${chipGroup(allSizesShoes, initialShoes, 'size-shoes')}</div>
            <div class="filters-note">Если выбрать размер обуви без категории — покажем всю обувь с этим размером.</div>
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
        ensureFilters();
        state.filters.inStock = el('#fStock').checked;
        const pick=(sel,attr)=>{
          const host = el(sel);
          if (!host) return [];
          return Array.from(host.querySelectorAll('.chip.active')).map(b=>b.getAttribute(attr));
        };
        state.filters.subcats     = pick('#fCats','data-cat');
        state.filters.sizeClothes = pick('#fSizesClothes','data-size-clothes');
        state.filters.sizeShoes   = pick('#fSizesShoes','data-size-shoes');
        state.filters.size = []; // legacy off

        closeModal();
        try { (router || window.appRouter)?.(); } catch {}
        renderActiveFilterChips();
      }}
    ],
    onOpen: ()=>{
      ['#fCats','#fSizesClothes','#fSizesShoes'].forEach(selector=>{
        const host = el(selector); if (!host) return;
        host.addEventListener('click', e=>{
          const btn = e.target.closest('.chip'); if(!btn) return;
          btn.classList.toggle('active');
        });
      });

      // Единый исправленный «Сбросить всё»
      el('#clearBtn').onclick = ()=>{
        resetAllFilters();
        closeModal();
        try { window.appRouter?.(); } catch {}
        renderActiveFilterChips();
      };
    }
  });
}

/* ===== активные чипы над лентой (цвет убран, фикс делегирования) ===== */
export function renderActiveFilterChips(){
  ensureFilters();

  const bar = el('#activeFilters'); if (!bar) return;
  bar.innerHTML='';

  // делегирование кликов по панели — мгновенный сброс конкретного фильтра
  bar.onclick = (e)=>{
    const x = e.target.closest('.chip-x');
    if (x) {
      const host = x.closest('.filter-chip');
      if (host) {
        const type = host.getAttribute('data-type');
        if (type === 'subcats')      state.filters.subcats = [];
        if (type === 'sizeClothes')  state.filters.sizeClothes = [];
        if (type === 'sizeShoes')    state.filters.sizeShoes = [];
        if (type === 'inStock')      state.filters.inStock = false;

        try { window.appRouter?.(); } catch {}
        renderActiveFilterChips();
      }
      return;
    }
    const clear = e.target.closest('.pill--clear-all');
    if (clear) {
      resetAllFilters();
      try { window.appRouter?.(); } catch {}
      renderActiveFilterChips();
    }
  };

  const pushChip=(label, type)=>{
    const node = document.createElement('button');
    node.className = 'chip active filter-chip';
    node.setAttribute('data-type', type);
    node.textContent = label;
    const close = document.createElement('span');
    close.className = 'chip-x';
    close.setAttribute('aria-label', 'Убрать фильтр');
    close.innerHTML = '&times;';
    node.appendChild(close);
    bar.appendChild(node);
  };

  if (state.filters.subcats?.length) {
    const labels = state.filters.subcats.map(categoryNameBySlug);
    pushChip('Категория: ' + labels.join(', '), 'subcats');
  }
  if (state.filters.sizeClothes?.length) {
    pushChip('Размер (одежда): ' + state.filters.sizeClothes.join(', '), 'sizeClothes');
  }
  if (state.filters.sizeShoes?.length) {
    pushChip('Размер (обувь): ' + state.filters.sizeShoes.join(', '), 'sizeShoes');
  }
  if (state.filters.inStock) {
    pushChip('Только в наличии', 'inStock');
  }

  const hasAny =
    (state.filters.subcats?.length) ||
    (state.filters.sizeClothes?.length) ||
    (state.filters.sizeShoes?.length) ||
    state.filters.inStock;

  if (hasAny) {
    const clearAll = document.createElement('button');
    clearAll.className = 'pill pill--ghost pill--clear-all';
    clearAll.innerHTML = '<i class="i-x"></i> Сбросить фильтры';
    bar.appendChild(clearAll);
  }
}

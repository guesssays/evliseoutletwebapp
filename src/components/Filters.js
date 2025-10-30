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
const SHOES_SLUG_HINTS = ['shoe', 'shoes', 'sneaker', 'sneakers', 'boots', 'obuv', 'kross', 'kedi'];
function buildShoesCategorySet() {
  const set = new Set();
  for (const grp of state.categories || []) {
    const grpIsShoes = /обув/i.test(grp.name || '');
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
const SHOES_CATS = buildShoesCategorySet();
function isShoesProduct(p) {
  if (!p) return false;
  if (p.kind === 'shoes') return true;
  return SHOES_CATS.has(p.categoryId);
}

/* ===== сортировка цветов для отображения ===== */
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
// Одежда: алфавитные + числовые (числа идут по возрастанию)
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
  // «universal», «one size»
  if (/(one|uni|free)/i.test(k)) return { group: 2, val: Number.POSITIVE_INFINITY, raw };
  // числовые размеры: 40, 42, 44...
  const num = parseFloat(k.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isNaN(num)) return { group: 1, val: num, raw };
  // fallback: строка
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

// Обувь: приводим к числу (учитываем диапазоны «40-41» как 40.5, дроби «40.5», слеш «43/44»)
function shoesNumeric(x='') {
  const s = String(x).trim().toLowerCase();
  // 43-44
  let m = s.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
  if (m) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    return (a + b) / 2;
  }
  // 43/44
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (m) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    return (a + b) / 2;
  }
  // обычное число
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

  return (list || []).filter(p=>{
    if (subcats.length){
      if (!p.categoryId || !subcats.includes(p.categoryId)) return false;
    }

    // Размеры: выбираем соответствующую группу
    const sizes = (p.sizes || []).map(norm);
    const productIsShoes = isShoesProduct(p);

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

  // если почему-то одна из групп пуста — подстрахуемся общим списком
  if (!clothes.size && (state.products || []).length) {
    for (const p of state.products) for (const s of (p.sizes || [])) clothes.add(s);
  }

  return {
    clothes: sortClothingSizes([...clothes]),
    shoes:   sortShoesSizes([...shoes]),
  };
}

/* ===== модалка фильтров ===== */
export function openFilterModal(router){
  const allCats = allSubcategories(); // [{value, label}]
  const { clothes: allSizesClothes, shoes: allSizesShoes } = collectSizes();

  const allColorsRaw = Array.from(new Set((state.products || []).flatMap(p=>p.colors||[])));
  const allColors = allColorsRaw.map(v => ({ value: v, label: colorLabel(v) }));

  const chipGroup = (items, selected, key)=> items.map(v=>{
    const val   = (typeof v === 'object') ? v.value : v;
    const label = (typeof v === 'object') ? v.label : v;
    return `<button class="chip ${selected.includes(val)?'active':''}" data-${key}="${val}">${label}</button>`;
  }).join('');

  // начальные значения (сохраняем совместимость со старым state.filters.size)
  const selClothes = state.filters.sizeClothes || [];
  const selShoes   = state.filters.sizeShoes   || [];
  const selLegacy  = state.filters.size        || [];
  const initialClothes = selClothes.length ? selClothes : selLegacy;
  const initialShoes   = selShoes.length   ? selShoes   : selLegacy;

  openModal({
    title: 'Фильтры',
    body: `
      <div class="h2">Категория</div>
      <div class="chipbar" id="fCats">${chipGroup(allCats, state.filters.subcats || [], 'cat')}</div>

      <div class="h2">Размер одежды</div>
      <div class="chipbar" id="fSizesClothes">${chipGroup(allSizesClothes, initialClothes, 'size-clothes')}</div>

      <div class="h2">Размер обуви</div>
      <div class="chipbar" id="fSizesShoes">${chipGroup(allSizesShoes,   initialShoes,   'size-shoes')}</div>

      <div class="h2">Цвет</div>
      <div class="chipbar" id="fColors">${chipGroup(allColors, state.filters.colors || [], 'color')}</div>

      <div class="chipbar" style="margin-top:8px">
        <label class="chip"><input id="fStock" type="checkbox" ${state.filters.inStock?'checked':''} style="margin-right:8px"> Только в наличии</label>
        <button id="clearBtn" class="chip">Сбросить</button>
      </div>`,
    actions: [
      { label: 'Отмена', variant: 'secondary', onClick: closeModal },
      { label: 'Применить', onClick: ()=>{
        state.filters.inStock = el('#fStock').checked;
        const pick=(sel,attr)=> Array.from(el(sel).querySelectorAll('.chip.active')).map(b=>b.getAttribute(attr));
        state.filters.subcats     = pick('#fCats','data-cat');
        state.filters.sizeClothes = pick('#fSizesClothes','data-size-clothes');
        state.filters.sizeShoes   = pick('#fSizesShoes','data-size-shoes');
        // для совместимости очищаем legacy «size», чтобы не мешал
        state.filters.size = [];
        closeModal(); router(); renderActiveFilterChips();
      }}
    ],
    onOpen: ()=>{
      ['#fCats','#fSizesClothes','#fSizesShoes','#fColors'].forEach(s=>{
        el(s).addEventListener('click', e=>{
          const btn=e.target.closest('.chip'); if(!btn)return;
          btn.classList.toggle('active');
        });
      });
      el('#clearBtn').onclick = ()=>{
        state.filters = {
          ...state.filters,
          subcats: [],
          size: [],           // legacy
          sizeClothes: [],
          sizeShoes: [],
          colors: [],
          minPrice: null,
          maxPrice: null,
          inStock: false
        };
        closeModal(); router(); renderActiveFilterChips();
      };
    }
  });
}

/* ===== активные чипы над лентой ===== */
export function renderActiveFilterChips(){
  const bar = el('#activeFilters'); if (!bar) return; bar.innerHTML='';
  const addChip=(label)=>{
    const tNode=document.getElementById('filter-chip');
    const n=tNode.content.firstElementChild.cloneNode(true);
    n.textContent=label; n.classList.add('active'); bar.appendChild(n);
  };
  if (state.filters.subcats?.length) {
    const labels = state.filters.subcats.map(categoryNameBySlug);
    addChip('Категория: ' + labels.join(', '));
  }
  // приоритет — новые поля; если пусты — показываем legacy size
  if (state.filters.sizeClothes?.length) addChip('Размер (одежда): ' + state.filters.sizeClothes.join(', '));
  if (state.filters.sizeShoes?.length)   addChip('Размер (обувь): '   + state.filters.sizeShoes.join(', '));
  if (!state.filters.sizeClothes?.length && !state.filters.sizeShoes?.length && state.filters.size?.length) {
    addChip('Размер: ' + state.filters.size.join(', '));
  }
  if (state.filters.colors?.length) addChip('Цвет: ' + state.filters.colors.map(colorLabel).join(', '));
}

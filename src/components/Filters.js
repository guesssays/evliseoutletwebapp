// src/components/filters.js
import { state } from '../core/state.js';
import { openModal, closeModal } from '../core/modal.js';
import { el } from '../core/utils.js';

/* ===== названия цветов для отображения ===== */
const COLOR_MAP = {
  '#000000': 'чёрный', black: 'чёрный',
  '#ffffff': 'белый',  white: 'белый',

  // синие
  '#1e3a8a':'тёмно-синий', '#3b82f6':'синий', '#60a5fa':'голубой',
  '#93c5fd':'светло-голубой', '#0ea5e9':'голубой',

  // серые/графит
  '#6b7280':'серый', '#808080':'серый', '#111827':'графит', '#616161':'серый',

  // красные/розовые/фиолетовые
  '#b91c1c':'красный', '#ef4444':'красный', '#f472b6':'розовый', '#a855f7':'фиолетовый',

  // зелёные/хаки/олива
  '#16a34a':'зелёный', '#166534':'тёмно-зелёный',
  '#556b2f':'хаки', '#4b5320':'оливковый', '#1f5132':'тёмно-зелёный',

  // коричневые/бежевые/песочные
  '#7b3f00':'коричневый', '#8b5a2b':'коричневый', '#6b4226':'коричневый',
  '#b0a36f':'бежевый', '#c8b796':'бежевый', '#d1b892':'бежевый', '#c19a6b':'бежевый',
  '#a3a380':'оливковый'
};

function colorLabel(c=''){
  const k = String(c).toLowerCase();
  return COLOR_MAP[k] || (k === '' ? '' : k.replace(/^#/, '')); // если нет в мапе — показываем без "#"
}

/* ===== фильтрация ===== */
export function applyFilters(list){
  const f = state.filters;
  return list.filter(p=>{
    if (f.size.length){ if (!p.sizes || !p.sizes.some(s=>f.size.includes(s))) return false; }
    if (f.colors.length){ if (!p.colors || !p.colors.some(c=>f.colors.includes(c))) return false; }
    // ⛔ материал убран: никаких проверок по p.material
    if (f.minPrice != null && p.price < f.minPrice) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    if (f.inStock && p.soldOut) return false;
    return true;
  });
}

/* ===== модалка фильтров ===== */
export function openFilterModal(router){
  const allSizes = Array.from(new Set(state.products.flatMap(p=>p.sizes||[])));
  const allColorsRaw = Array.from(new Set(state.products.flatMap(p=>p.colors||[])));
  const allColors = allColorsRaw.map(v => ({ value: v, label: colorLabel(v) }));
  // ⛔ список материалов больше не нужен

  const chipGroup = (items, selected, key)=> items.map(v=>{
    const val   = (typeof v === 'object') ? v.value : v;
    const label = (typeof v === 'object') ? v.label : v;
    return `<button class="chip ${selected.includes(val)?'active':''}" data-${key}="${val}">${label}</button>`;
  }).join('');

  openModal({
    title: 'Фильтры',
    body: `
      <div class="h2">Размер</div>
      <div class="chipbar" id="fSizes">${chipGroup(allSizes, state.filters.size, 'size')}</div>

      <div class="h2">Цвет</div>
      <div class="chipbar" id="fColors">${chipGroup(allColors, state.filters.colors, 'color')}</div>

      <div class="chipbar" style="margin-top:8px">
        <label class="chip"><input id="fStock" type="checkbox" ${state.filters.inStock?'checked':''} style="margin-right:8px"> Только в наличии</label>
        <button id="clearBtn" class="chip">Сбросить</button>
      </div>`,
    actions: [
      { label: 'Отмена', variant: 'secondary', onClick: closeModal },
      { label: 'Применить', onClick: ()=>{
        state.filters.inStock = el('#fStock').checked;
        const pick=(sel,attr)=> Array.from(el(sel).querySelectorAll('.chip.active')).map(b=>b.getAttribute(attr));
        state.filters.size = pick('#fSizes','data-size');
        state.filters.colors = pick('#fColors','data-color');      // храним исходные значения
        // ⛔ материалов больше нет
        closeModal(); router(); renderActiveFilterChips();
      }}
    ],
    onOpen: ()=>{
      ['#fSizes','#fColors'].forEach(s=>{
        el(s).addEventListener('click', e=>{
          const btn=e.target.closest('.chip'); if(!btn)return;
          btn.classList.toggle('active');
        });
      });
      el('#clearBtn').onclick = ()=>{
        state.filters = { ...state.filters, size:[], colors:[], minPrice:null, maxPrice:null, inStock:false };
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
  if (state.filters.size.length) addChip('Размер: ' + state.filters.size.join(', '));
  if (state.filters.colors.length) addChip('Цвет: ' + state.filters.colors.map(colorLabel).join(', ')); // <-- названия
  // ⛔ чип «Материал» удалён
}

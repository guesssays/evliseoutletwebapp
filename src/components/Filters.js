import { state } from '../core/state.js';
import { openModal, closeModal } from '../core/modal.js';
import { el } from '../core/utils.js';

export function applyFilters(list){
  const f = state.filters;
  return list.filter(p=>{
    if (f.size.length){ if (!p.sizes || !p.sizes.some(s=>f.size.includes(s))) return false; }
    if (f.colors.length){ if (!p.colors || !p.colors.some(c=>f.colors.includes(c))) return false; }
    if (f.materials.length){ if (!p.material || !f.materials.includes(p.material)) return false; }
    if (f.minPrice != null && p.price < f.minPrice) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    if (f.inStock && p.soldOut) return false;
    return true;
  });
}

export function openFilterModal(router){
  const allSizes = Array.from(new Set(state.products.flatMap(p=>p.sizes||[])));
  const allColors = Array.from(new Set(state.products.flatMap(p=>p.colors||[])));
  const allMaterials = Array.from(new Set(state.products.map(p=>p.material).filter(Boolean)));
  const chipGroup = (items, selected, key)=> items.map(v=>`<button class="chip ${selected.includes(v)?'active':''}" data-${key}="${v}">${v}</button>`).join('');
  openModal({
    title: 'Фильтры',
    body: `
      <div class="h2">Размер</div>
      <div class="chipbar" id="fSizes">${chipGroup(allSizes, state.filters.size, 'size')}</div>
      <div class="h2">Цвет</div>
      <div class="chipbar" id="fColors">${chipGroup(allColors, state.filters.colors, 'color')}</div>
      <div class="h2">Материал</div>
      <div class="chipbar" id="fMaterials">${chipGroup(allMaterials, state.filters.materials, 'mat')}</div>
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
        state.filters.colors = pick('#fColors','data-color');
        state.filters.materials = pick('#fMaterials','data-mat');
        closeModal(); router(); renderActiveFilterChips();
      }}
    ],
    onOpen: ()=>{
      ['#fSizes','#fColors','#fMaterials'].forEach(s=>{
        el(s).addEventListener('click', e=>{ const btn=e.target.closest('.chip'); if(!btn)return; btn.classList.toggle('active'); });
      });
      el('#clearBtn').onclick = ()=>{
        state.filters = { ...state.filters, size:[], colors:[], materials:[], minPrice:null, maxPrice:null, inStock:false };
        closeModal(); router(); renderActiveFilterChips();
      };
    }
  });
}

export function renderActiveFilterChips(){
  const bar = el('#activeFilters'); if (!bar) return; bar.innerHTML='';
  const addChip=(label)=>{ const tNode=document.getElementById('filter-chip'); const n=tNode.content.firstElementChild.cloneNode(true); n.textContent=label; n.classList.add('active'); bar.appendChild(n); };
  if (state.filters.size.length) addChip('Размер: ' + state.filters.size.join(', '));
  if (state.filters.colors.length) addChip('Цвет: ' + state.filters.colors.join(', '));
  if (state.filters.materials.length) addChip('Материал: ' + state.filters.materials.join(', '));
}

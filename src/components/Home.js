import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

export function renderHome(router){
  const v = document.getElementById('view');
  v.innerHTML = `<div class="grid" id="productGrid"></div>`;
  drawCategoriesChips(router);
  drawProducts(state.products);
}

export function drawCategoriesChips(router){
  const wrap = document.getElementById('catChips'); wrap.innerHTML='';
  const mk=(slug, name, ico, active)=>`<button class="chip ${active?'active':''}" data-slug="${slug}"><i data-lucide="${ico}"></i>${name}</button>`;
  wrap.insertAdjacentHTML('beforeend', mk('all','Все товары','grid', state.filters.category==='all'));
  state.categories.forEach((c,i)=>{
    wrap.insertAdjacentHTML('beforeend', mk(c.slug,c.name, i===0?'dress':(i===1?'shirt':(i===2?'shirt':'tshirt')), state.filters.category===c.slug));
  });
  wrap.addEventListener('click', (e)=>{
    const b=e.target.closest('.chip'); if(!b)return;
    state.filters.category = b.getAttribute('data-slug');
    drawCategoriesChips(router);
    const list = state.filters.category==='all' ? state.products : state.products.filter(p=>p.category===state.filters.category);
    drawProducts(list);
  });
  window.lucide?.createIcons();
}

export function drawProducts(list){
  const grid = document.getElementById('productGrid'); grid.innerHTML='';
  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = list.filter(p=> p.title.toLowerCase().includes(q) || (p.subtitle||'').toLowerCase().includes(q));
  const fav = new Set(JSON.parse(localStorage.getItem('nas_fav')||'[]'));
  for (const p of filtered){
    const t=document.getElementById('product-card'); const node=t.content.firstElementChild.cloneNode(true);
    node.href=`#/product/${p.id}`;
    const im=node.querySelector('img'); im.src=p.images?.[0]; im.alt=p.title;
    node.querySelector('.title').textContent=p.title;
    node.querySelector('.subtitle').textContent=p.categoryLabel || (p.category? state.categories.find(c=>c.slug===p.category)?.name || '' : '');
    node.querySelector('.price').textContent=priceFmt(p.price);
    const favBtn=node.querySelector('.fav');
    if (fav.has(p.id)) favBtn.classList.add('active');
    favBtn.onclick=(ev)=>{ ev.preventDefault(); toggleFav(p.id, favBtn); };
    grid.appendChild(node);
  }
  window.lucide?.createIcons();
}

function toggleFav(id, btn){
  let list = JSON.parse(localStorage.getItem('nas_fav')||'[]');
  if (list.includes(id)) list=list.filter(x=>x!==id); else list.push(id);
  localStorage.setItem('nas_fav', JSON.stringify(list));
  btn.classList.toggle('active');
}

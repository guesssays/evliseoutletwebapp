import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

export function renderHome(router){
  const v = document.getElementById('view');
  // нижний отступ, чтобы сетка не упиралась в таббар
  v.innerHTML = `<div class="grid home-bottom-pad" id="productGrid"></div>`;
  drawCategoriesChips(router);
  drawProducts(state.products);
}

export function drawCategoriesChips(router){
  const wrap = document.getElementById('catChips');
  if (!wrap) return;

  // чипы рендерим, но обработчик клика вешаем только один раз
  const mk=(slug, name, active)=>`<button class="chip ${active?'active':''}" data-slug="${slug}">${name}</button>`;
  wrap.innerHTML='';
  wrap.insertAdjacentHTML('beforeend', mk('all','Все товары', state.filters.category==='all'));
  state.categories.forEach(c=>{
    wrap.insertAdjacentHTML('beforeend', mk(c.slug,c.name, state.filters.category===c.slug));
  });

  if (!wrap.dataset.bound){
    wrap.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip'); if (!b) return;

      const slug = b.getAttribute('data-slug');
      if (slug === state.filters.category) return; // ничего не делаем

      // переключаем активный чип без полного перерендера
      wrap.querySelector('.chip.active')?.classList.remove('active');
      b.classList.add('active');

      state.filters.category = slug;
      const list = slug==='all' ? state.products : state.products.filter(p=>p.category===slug);
      drawProducts(list);
    });
    wrap.dataset.bound = '1';
  }
}

export function drawProducts(list){
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML='';

  const q = (state.filters.query||'').trim().toLowerCase();
  const filtered = list.filter(p=>
    p.title.toLowerCase().includes(q) ||
    (p.subtitle||'').toLowerCase().includes(q)
  );

  const fav = new Set(JSON.parse(localStorage.getItem('nas_fav')||'[]'));

  // создаём фрагмент — меньше перепаковок DOM
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
    if (subEl) subEl.textContent = p.categoryLabel ||
      (p.category ? (state.categories.find(c=>c.slug===p.category)?.name || '') : '');

    const priceEl = node.querySelector('.price');
    if (priceEl) priceEl.textContent = priceFmt(p.price);

    const favBtn = node.querySelector('.fav');
    if (favBtn){
      const isFav = fav.has(p.id);
      favBtn.classList.toggle('active', isFav);
      if (isFav) favBtn.setAttribute('aria-pressed','true');
      favBtn.onclick = (ev)=>{
        ev.preventDefault();
        toggleFav(p.id, favBtn);
      };
    }

    frag.appendChild(node);
  }

  grid.appendChild(frag);
  // иконки для карточек
  window.lucide?.createIcons && lucide.createIcons();
}

function toggleFav(id, btn){
  let list = JSON.parse(localStorage.getItem('nas_fav')||'[]');
  const was = list.includes(id);
  if (was) list = list.filter(x=>x!==id); else list.push(id);
  localStorage.setItem('nas_fav', JSON.stringify(list));
  btn.classList.toggle('active', !was);
  btn.setAttribute('aria-pressed', String(!was));
}

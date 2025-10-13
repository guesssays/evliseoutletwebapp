// === Evlise Outlet WebApp — full updated app.js ===
// Теперь при оформлении заказа в бота отправляется JSON со всеми полями:
// товары (id, title, price, qty, size, color), общий комментарий, итого, данные tg-пользователя

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor('#0a0a0a'); } catch(e){}
  try { tg.setBackgroundColor('#0a0a0a'); } catch(e){}
}

const state = {
  products: [],
  categories: [],
  filters: { size: [], minPrice: null, maxPrice: null, inStock: false, query: "" },
  cart: JSON.parse(localStorage.getItem('evlise_cart') || '{"items":[]}'),
  orderNote: localStorage.getItem('evlise_note') || "" // общий комментарий к заказу
};

const el = (sel) => document.querySelector(sel);
const view = el('#view');
const drawer = el('#drawer');
const overlay = el('#overlay');
const cartCount = el('#cartCount');

const routes = {
  '/': renderHome,
  '/category/:slug': renderCategory,
  '/product/:id': renderProduct,
  '/cart': renderCart,
};

init();
async function init(){
  const res = await fetch('data/products.json');
  const data = await res.json();
  state.products = data.products;
  state.categories = data.categories;
  buildDrawer();
  updateCartBadge();
  bindChrome();
  router();
  window.addEventListener('hashchange', router);
}

function bindChrome(){
  el('#menuBtn').onclick = () => openDrawer();
  el('#closeDrawer').onclick = () => closeDrawer();
  overlay.onclick = closeDrawer;
  el('#searchBtn').onclick = () => {
    const q = prompt('Поиск по каталогу:');
    if (q != null) {
      state.filters.query = q.trim();
      location.hash = '#/';
      renderHome();
    }
  }
}

function openDrawer(){ drawer.classList.add('open'); overlay.classList.add('show'); drawer.setAttribute('aria-hidden','false'); }
function closeDrawer(){ drawer.classList.remove('open'); overlay.classList.remove('show'); drawer.setAttribute('aria-hidden','true'); }

function buildDrawer(){
  const nav = el('#drawerNav'); nav.innerHTML = '';
  const links = [['Главная', '#/'], ...state.categories.map(c => [c.name, `#/category/${c.slug}`]), ['Корзина', '#/cart']];
  for (const [label, href] of links){
    const a = document.createElement('a'); a.href = href; a.textContent = label; nav.appendChild(a);
  }
}

function router(){
  const hash = location.hash.replace(/^#/, '') || '/';
  for (const pattern in routes){
    const match = matchRoute(pattern, hash);
    if (match){ routes[pattern](match.params); return; }
  }
  renderHome();
}
function matchRoute(pattern, path){
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i=0; i<p.length; i++){
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return { params };
}

/* ---------------- Home ---------------- */

function renderHome(){
  closeDrawer();
  view.innerHTML = `
    <section class="section">
      <div class="h1">Категории</div>
      <div class="grid" id="catGrid"></div>
    </section>
    <section class="section">
      <div class="row" style="justify-content:space-between; align-items:end">
        <div>
          <div class="h1">Новинки</div>
          <div class="sub">Свежие позиции из Instagram</div>
        </div>
        <button class="chip" id="openFilter">Фильтры</button>
      </div>
      <div class="toolbar" id="activeFilters"></div>
      <div class="grid" id="productGrid"></div>
    </section>
  `;
  const catGrid = el('#catGrid');
  for (const c of state.categories){
    const a = document.createElement('a');
    a.className='card'; a.href = `#/category/${c.slug}`;
    a.innerHTML = `<div class="card-img-wrap"><img src="${c.image}" alt="${c.name}"></div><div class="card-body"><div class="card-title">${c.name}</div></div>`;
    catGrid.appendChild(a);
  }
  drawProducts(state.products.slice(0, 12));
  el('#openFilter').onclick = showFilterPrompt;
  renderActiveFilterChips();
}

/* ---------------- Category ---------------- */

function renderCategory({slug}){
  closeDrawer();
  const cat = state.categories.find(c => c.slug === slug);
  if (!cat){ renderHome(); return; }
  const products = state.products.filter(p => p.category === slug);
  view.innerHTML = `
    <section class="section">
      <div class="row" style="justify-content:space-between; align-items:end">
        <div>
          <div class="h1">${cat.name}</div>
          <div class="sub">${products.length} товаров</div>
        </div>
        <button class="chip" id="openFilter">Фильтры</button>
      </div>
      <div class="toolbar" id="activeFilters"></div>
      <div class="grid" id="productGrid"></div>
    </section>
  `;
  drawProducts(products);
  el('#openFilter').onclick = showFilterPrompt;
  renderActiveFilterChips();
}

function drawProducts(list){
  const grid = el('#productGrid'); grid.innerHTML = '';
  const filtered = applyFilters(list);
  for (const p of filtered){
    const t = document.getElementById('product-card');
    const node = t.content.firstElementChild.cloneNode(true);
    node.href = `#/product/${p.id}`;
    node.querySelector('img').src = p.images[0];
    node.querySelector('img').alt = p.title;
    node.querySelector('.card-title').textContent = p.title;
    node.querySelector('.card-price').textContent = priceFmt(p.price);
    const pill = node.querySelector('[data-pill]');
    if (p.badge){ pill.textContent = p.badge; pill.classList.add('show'); }
    grid.appendChild(node);
  }
  if (filtered.length === 0){ grid.innerHTML = `<div class="sub">Ничего не найдено. Измените фильтры.</div>`; }
}

/* ---------------- Product ---------------- */

function renderProduct({id}){
  closeDrawer();
  const p = state.products.find(x => String(x.id) === String(id));
  if (!p){ renderHome(); return; }
  const sizes  = p.sizes  || [];
  const colors = p.colors || []; // опционально в products.json

  view.innerHTML = `
    <div class="product">
      <div class="p-gallery"><img src="${p.images[0]}" alt="${p.title}"/></div>
      <div class="p-panel">
        <div class="h1">${p.title}</div>
        <div class="sub">${p.subtitle || ''}</div>
        <div class="price">${priceFmt(p.price)}</div>

        <div class="h2">Размер</div>
        <div class="size-grid" id="sizeGrid"></div>

        ${colors.length ? `
          <div class="h2" style="margin-top:8px">Цвет</div>
          <div class="size-grid" id="colorGrid"></div>
        ` : ''}

        <button class="btn" id="addBtn" style="margin-top:8px">Добавить в корзину</button>
        <div class="hr"></div>

        <div class="h2">Описание</div>
        <div>${p.description}</div>
        <div class="kv">
          <div>Категория</div><div>${getCategoryName(p.category)}</div>
          <div>Материал</div><div>${p.material || '—'}</div>
          <div>Артикул</div><div>${p.sku || p.id}</div>
        </div>
        <div class="footer-note">Есть вопросы? Напишите нам в <a class="link" href="https://t.me/evliseoutlet" target="_blank">Telegram</a>.</div>
      </div>
    </div>
  `;

  // Размеры
  const sg = el('#sizeGrid');
  sizes.forEach(s => {
    const b = document.createElement('button');
    b.className='size'; b.textContent=s;
    b.onclick = () => { sg.querySelectorAll('.size').forEach(x=>x.classList.remove('active')); b.classList.add('active'); };
    sg.appendChild(b);
  });

  // Цвета (если заданы)
  let selectedColor = null;
  if (colors.length){
    const cg = el('#colorGrid');
    colors.forEach(c => {
      const b = document.createElement('button');
      b.className='size'; b.textContent=c;
      b.onclick = () => { cg.querySelectorAll('.size').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedColor = c; };
      cg.appendChild(b);
    });
  }

  document.getElementById('addBtn').onclick = () => {
    const sel = sg.querySelector('.size.active');
    const size = sel ? sel.textContent : null;
    addToCart(p, size, selectedColor);
  };
}

/* ---------------- Cart ---------------- */

function renderCart(){
  closeDrawer();
  const items = state.cart.items;
  const enriched = items.map(it => ({ ...it, product: state.products.find(p=>p.id===it.productId) })).filter(x => x.product);
  let total = 0; enriched.forEach(x => total += x.qty * x.product.price);

  view.innerHTML = `
    <div class="h1">Корзина</div>
    <div class="cart" id="cartList"></div>

    <div class="p-panel" style="margin-top:4px">
      <div class="h2">Комментарий к заказу</div>
      <textarea id="orderNote" rows="3" placeholder="Размер маломерит? Нужна примерка? Укажите пожелания..." style="width:100%;border-radius:12px;border:1px solid var(--stroke);background:#0f0f0f;color:#fff;padding:10px;"></textarea>
    </div>

    <div class="p-panel" style="margin-top:8px">
      <div class="row" style="justify-content:space-between">
        <div>Сумма</div><div><b>${priceFmt(total)}</b></div>
      </div>
      <div class="footer-note">Оформление происходит в Telegram: заказ отправится менеджеру, он подтвердит наличие и оплату.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="checkoutBtn">Оформить в Telegram</button>
        <a class="btn secondary" href="#/">Продолжить покупки</a>
      </div>
    </div>
  `;

  const list = el('#cartList');
  if (enriched.length === 0){
    list.innerHTML = `<div class="sub">Корзина пуста.</div>`;
  } else {
    for (const x of enriched){
      const row = document.createElement('div');
      row.className='cart-item';
      row.innerHTML = `
        <img src="${x.product.images[0]}" alt="${x.product.title}">
        <div>
          <div><b>${x.product.title}</b></div>
          <div class="sub">Размер: ${x.size || '—'}${x.color ? ` · Цвет: ${x.color}` : ''}</div>
          <div class="sub">${priceFmt(x.product.price)}</div>
        </div>
        <div class="qty">
          <button data-act="dec">−</button>
          <span>${x.qty}</span>
          <button data-act="inc">+</button>
          <button data-act="del" title="Удалить">✕</button>
        </div>
      `;
      row.querySelector('[data-act="inc"]').onclick = () => changeQty(x.product.id, x.size, x.color, 1);
      row.querySelector('[data-act="dec"]').onclick = () => changeQty(x.product.id, x.size, x.color, -1);
      row.querySelector('[data-act="del"]').onclick = () => removeFromCart(x.product.id, x.size, x.color);
      list.appendChild(row);
    }
  }

  // Комментарий
  const note = el('#orderNote');
  note.value = state.orderNote || '';
  note.oninput = () => {
    state.orderNote = note.value;
    localStorage.setItem('evlise_note', state.orderNote);
  };

  const btn = document.getElementById('checkoutBtn');
  btn.onclick = () => checkoutInTelegram(enriched);
  if (tg){
    tg.MainButton.setText("Отправить заказ");
    tg.MainButton.show();
    tg.MainButton.onClick(() => checkoutInTelegram(enriched));
  }
}

/* ---------------- Helpers & Filters ---------------- */

function priceFmt(v){ return new Intl.NumberFormat('ru-RU', { style:'currency', currency:'RUB', maximumFractionDigits:0 }).format(v); }
function getCategoryName(slug){ return state.categories.find(c=>c.slug===slug)?.name || slug; }

function applyFilters(list){
  const f = state.filters;
  return list.filter(p => {
    if (f.query){
      const q = f.query.toLowerCase();
      if (!(`${p.title} ${p.subtitle||''} ${p.description||''}`).toLowerCase().includes(q)) return false;
    }
    if (f.size.length){
      if (!p.sizes || !p.sizes.some(s => f.size.includes(s))) return false;
    }
    if (f.minPrice != null && p.price < f.minPrice) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    if (f.inStock && p.soldOut) return false;
    return true;
  });
}

function showFilterPrompt(){
  const size = prompt('Фильтр размеров (через запятую), например: S,M,L\nОставьте пустым чтобы не фильтровать.', state.filters.size.join(','));
  const price = prompt('Диапазон цены, напр. 1000-5000 (пусто — без фильтра)', '');
  if (size != null){
    state.filters.size = size.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  }
  if (price != null && price.includes('-')){
    const [a,b] = price.split('-').map(x=>parseInt(x.trim(),10));
    state.filters.minPrice = isFinite(a) ? a : null;
    state.filters.maxPrice = isFinite(b) ? b : null;
  }
  renderActiveFilterChips();
  router();
}

function renderActiveFilterChips(){
  const bar = el('#activeFilters'); bar.innerHTML = '';
  const addChip = (label, key, value) => {
    const t = document.getElementById('filter-chip');
    const n = t.content.firstElementChild.cloneNode(true);
    n.textContent = label; n.dataset.key = key; n.dataset.value = value ?? '';
    n.classList.add('active'); n.onclick = () => clearFilter(key, value);
    bar.appendChild(n);
  };
  if (state.filters.query) addChip('Поиск: '+state.filters.query, 'query', '');
  if (state.filters.size.length) addChip('Размер: '+state.filters.size.join(','), 'size', '');
  if (state.filters.minPrice != null || state.filters.maxPrice != null) addChip(`Цена: ${state.filters.minPrice||'—'}–${state.filters.maxPrice||'—'}`, 'price', '');
}

function clearFilter(key, value){
  if (key === 'query') state.filters.query = '';
  if (key === 'size') state.filters.size = [];
  if (key === 'price') { state.filters.minPrice = null; state.filters.maxPrice = null; }
  router(); renderActiveFilterChips();
}

/* ---------------- Cart data ops ---------------- */

function addToCart(product, size, color){
  const same = (a)=> a.productId===product.id && a.size===size && a.color===color;
  const existing = state.cart.items.find(same);
  if (existing) existing.qty += 1;
  else state.cart.items.push({ productId: product.id, size, color, qty: 1 });
  persistCart(); updateCartBadge(); alert('Добавлено в корзину');
}

function removeFromCart(productId, size, color){
  state.cart.items = state.cart.items.filter(a => !(a.productId===productId && a.size===size && a.color===color));
  persistCart(); updateCartBadge(); renderCart();
}

function changeQty(productId, size, color, delta){
  const it = state.cart.items.find(a => a.productId===productId && a.size===size && a.color===color);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) removeFromCart(productId, size, color);
  persistCart(); updateCartBadge(); renderCart();
}

function persistCart(){ localStorage.setItem('evlise_cart', JSON.stringify(state.cart)); }
function updateCartBadge(){ const count = state.cart.items.reduce((s,x)=>s+x.qty,0); cartCount.textContent = count; }

/* ---------------- Checkout ---------------- */

function checkoutInTelegram(summary){
  // Пользователь TG (если есть)
  const tgUser = tg?.initDataUnsafe?.user
    ? {
        id: tg.initDataUnsafe.user.id,
        username: tg.initDataUnsafe.user.username || null,
        first_name: tg.initDataUnsafe.user.first_name || null,
        last_name: tg.initDataUnsafe.user.last_name || null,
        language_code: tg.initDataUnsafe.user.language_code || null
      }
    : null;

  const order = {
    cart: summary.map(x => ({
      id: x.product.id,
      title: x.product.title,
      price: x.product.price,
      qty: x.qty,
      size: x.size || null,
      color: x.color || null
    })),
    total: summary.reduce((s,x)=> s + x.qty * x.product.price, 0),
    comment: state.orderNote || "",
    user: tgUser,
    ts: Date.now()
  };

  const payload = JSON.stringify(order);
  if (tg?.sendData){
    tg.sendData(payload);
    alert('Заказ отправлен в чат-бот. Мы свяжемся с вами.');
  } else {
    navigator.clipboard.writeText(payload);
    alert('Телеграм недоступен в браузере. Заказ (JSON) скопирован в буфер обмена.');
  }
}

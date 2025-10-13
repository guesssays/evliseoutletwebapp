// === Evlise Outlet WebApp (enhanced) ===
// Светлая/тёмная тема, RU/UZ, единственная валюта UZS,
// модалки/тосты, FAQ, фильтры (размер/цвет/материал),
// размерная сетка, плавающая поддержка, меню справа,
// tg.MainButton показываем ТОЛЬКО в корзине.

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor('#0a0a0a'); } catch(e){}
  try { tg.setBackgroundColor('#0a0a0a'); } catch(e){}
}

// ------ Settings ------
const PRICE_CURRENCY = 'UZS';       // отображаемая валюта
const RUB_TO_UZS = 1;
             // коэффициент конверсии (если прайс в рублях)
const DEFAULT_LANG = localStorage.getItem('evlise_lang') || 'ru';
const DEFAULT_THEME = localStorage.getItem('evlise_theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

// ------ I18N ------
const i18n = {
  ru: {
    categories: 'Категории',
    newItems: 'Новинки',
    freshFromIg: 'Свежие позиции из Instagram',
    filters: 'Фильтры',
    items: 'товаров',
    size: 'Размер',
    color: 'Цвет',
    material: 'Материал',
    addToCart: 'Добавить в корзину',
    description: 'Описание',
    sku: 'Артикул',
    category: 'Категория',
    sizeChart: 'Размерная сетка',
    cart: 'Корзина',
    orderComment: 'Комментарий к заказу',
    orderCommentPlaceholder: 'Напишите пожелания: примерка, удобное время, адрес…',
    total: 'Сумма',
    proceed: 'Оформить в Telegram',
    continue: 'Продолжить покупки',
    empty: 'Корзина пуста.',
    notFound: 'Ничего не найдено. Измените фильтры.',
    faq: 'FAQ',
    home: 'Главная',
    support: 'Поддержка',
    inStockOnly: 'Только в наличии',
    clear: 'Сбросить',
    apply: 'Применить',
    cancel: 'Отмена'
  },
  uz: {
    categories: 'Kategoriyalar',
    newItems: 'Yangi tovarlar',
    freshFromIg: 'Instagram’dan yangi pozitsiyalar',
    filters: 'Filtrlar',
    items: 'ta mahsulot',
    size: 'O‘lcham',
    color: 'Rang',
    material: 'Material',
    addToCart: 'Savatga qo‘shish',
    description: 'Tavsif',
    sku: 'Artikul',
    category: 'Kategoriya',
    sizeChart: 'O‘lcham jadvali',
    cart: 'Savat',
    orderComment: 'Buyurtma uchun izoh',
    orderCommentPlaceholder: 'Istaklaringizni yozing: kiyib ko‘rish, vaqt, manzil…',
    total: 'Jami',
    proceed: 'Telegram orqali rasmiylashtirish',
    continue: 'Xaridni davom ettirish',
    empty: 'Savat bo‘sh.',
    notFound: 'Hech narsa topilmadi. Filtrlarni o‘zgartiring.',
    faq: 'Savol-javob',
    home: 'Bosh sahifa',
    support: 'Qo‘llab-quvvatlash',
    inStockOnly: 'Faqat mavjud',
    clear: 'Tozalash',
    apply: 'Qo‘llash',
    cancel: 'Bekor qilish'
  }
};
let lang = DEFAULT_LANG;
const t = (k) => i18n[lang][k] || k;

// ------ State ------
const state = {
  products: [],
  categories: [],
  filters: { size: [], colors: [], materials: [], minPrice: null, maxPrice: null, inStock: false }, // без query
  cart: JSON.parse(localStorage.getItem('evlise_cart') || '{"items":[]}'),
  orderNote: localStorage.getItem('evlise_note') || ""
};

// ------ DOM helpers ------
const el = (sel) => document.querySelector(sel);
const view = el('#view');
const drawer = el('#drawer');
const overlay = el('#overlay');
const cartCount = el('#cartCount');
const modal = el('#modal');
const modalTitle = el('#modalTitle');
const modalBody = el('#modalBody');
const modalActions = el('#modalActions');
const toastWrap = el('#toastWrap');

// Theme init
document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
updateHeaderToggles();

const routes = {
  '/': renderHome,
  '/category/:slug': renderCategory,
  '/product/:id': renderProduct,
  '/cart': renderCart,
  '/faq': renderFAQ,
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
  lucide.createIcons();
}

/* ---------- Header & chrome ---------- */
function bindChrome(){
  el('#menuBtn').onclick = () => openDrawer();
  el('#closeDrawer').onclick = () => closeDrawer();
  overlay.onclick = closeDrawer;
  el('#modalClose').onclick = closeModal;
  el('#themeBtn').onclick = toggleTheme;
  el('#langBtn').onclick = toggleLanguage;
}

function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('evlise_theme', next);
  updateHeaderToggles();
}
function updateHeaderToggles(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  el('#themeBtn').innerHTML = `<i data-lucide="${isLight ? 'moon' : 'sun'}"></i>`;
  lucide.createIcons();
}

function toggleLanguage(){
  lang = (lang === 'ru') ? 'uz' : 'ru';
  localStorage.setItem('evlise_lang', lang);
  buildDrawer();
  router();
  el('#langBtn').textContent = lang.toUpperCase();
}

function openDrawer(){ drawer.classList.add('open'); overlay.classList.add('show'); drawer.setAttribute('aria-hidden','false'); }
function closeDrawer(){ drawer.classList.remove('open'); overlay.classList.remove('show'); drawer.setAttribute('aria-hidden','true'); }

function buildDrawer(){
  const nav = el('#drawerNav'); nav.innerHTML = '';
  const links = [
    [t('home'), '#/'],
    [t('faq'), '#/faq'],
    ...state.categories.map(c => [c.name, `#/category/${c.slug}`]),
    [t('cart'), '#/cart']
  ];
  for (const [label, href] of links){
    const a = document.createElement('a'); a.href = href; a.textContent = label; nav.appendChild(a);
  }
}

/* ---------- Router ---------- */
function router(){
  // на всех страницах, кроме корзины, прячем MainButton
  if (tg?.MainButton) tg.MainButton.hide();

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

/* ---------- Home ---------- */
function renderHome(){
  closeDrawer();
  view.innerHTML = `
    <section class="section">
      <div class="h1">${t('categories')}</div>
      <div class="grid" id="catGrid"></div>
    </section>
    <section class="section">
      <div class="row" style="justify-content:space-between; align-items:end">
        <div>
          <div class="h1">${t('newItems')}</div>
          <div class="sub">${t('freshFromIg')}</div>
        </div>
        <button class="chip" id="openFilter">${t('filters')}</button>
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
  el('#openFilter').onclick = () => openFilterModal();
  renderActiveFilterChips();
  lucide.createIcons();
}

/* ---------- Category ---------- */
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
          <div class="sub">${products.length} ${t('items')}</div>
        </div>
        <button class="chip" id="openFilter">${t('filters')}</button>
      </div>
      <div class="toolbar" id="activeFilters"></div>
      <div class="grid" id="productGrid"></div>
    </section>
  `;
  drawProducts(products);
  el('#openFilter').onclick = () => openFilterModal();
  renderActiveFilterChips();
}

/* ---------- Draw products ---------- */
function drawProducts(list){
  const grid = el('#productGrid'); grid.innerHTML = '';
  const filtered = applyFilters(list);
  for (const p of filtered){
    const tCard = document.getElementById('product-card');
    const node = tCard.content.firstElementChild.cloneNode(true);
    node.href = `#/product/${p.id}`;
    node.querySelector('img').src = p.images[0];
    node.querySelector('img').alt = p.title;
    node.querySelector('.card-title').textContent = p.title;
    node.querySelector('.card-price').textContent = priceFmt(p.price);
    const pill = node.querySelector('[data-pill]');
    if (p.badge){ pill.textContent = p.badge; pill.classList.add('show'); }
    grid.appendChild(node);
  }
  if (filtered.length === 0){ grid.innerHTML = `<div class="sub">${t('notFound')}</div>`; }
}

/* ---------- Product page ---------- */
function renderProduct({id}){
  closeDrawer();
  const p = state.products.find(x => String(x.id) === String(id));
  if (!p){ renderHome(); return; }
  const sizes  = p.sizes  || [];
  const colors = p.colors || [];

  view.innerHTML = `
    <div class="product">
      <div class="p-gallery"><img src="${p.images[0]}" alt="${p.title}"/></div>
      <div class="p-panel">
        <div class="h1">${p.title}</div>
        <div class="sub">${p.subtitle || ''}</div>
        <div class="price">${priceFmt(p.price)}</div>

        <div class="h2">${t('size')}</div>
        <div class="size-grid" id="sizeGrid"></div>

        ${colors.length ? `
          <div class="h2" style="margin-top:8px">${t('color')}</div>
          <div class="size-grid" id="colorGrid"></div>
        ` : ''}

        <button class="btn" id="addBtn" style="margin-top:8px"><i data-lucide="plus"></i>${t('addToCart')}</button>
        <div class="hr"></div>

        <div class="h2">${t('description')}</div>
        <div>${p.description}</div>
        <div class="kv">
          <div>${t('category')}</div><div>${getCategoryName(p.category)}</div>
          <div>${t('material')}</div><div>${p.material || '—'}</div>
          <div>${t('sku')}</div><div>${p.sku || p.id}</div>
        </div>

        <div class="hr"></div>
        <div class="h2">${t('sizeChart')}</div>
        ${renderSizeChartHTML()}
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

  // Цвета
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
  lucide.createIcons();
}

/* ---------- Cart ---------- */
function renderCart(){
  closeDrawer();
  const items = state.cart.items;
  const enriched = items.map(it => ({ ...it, product: state.products.find(p=>p.id===it.productId) })).filter(x => x.product);
  let total = 0; enriched.forEach(x => total += x.qty * x.product.price);

  view.innerHTML = `
    <div class="h1">${t('cart')}</div>
    <div class="cart" id="cartList"></div>

    <div class="p-panel" style="margin-top:4px">
      <div class="h2">${t('orderComment')}</div>
      <textarea id="orderNote" rows="3" placeholder="${t('orderCommentPlaceholder')}" style="width:100%;border-radius:12px;border:1px solid var(--stroke);background:var(--paper);color:var(--text);padding:10px;"></textarea>
    </div>

    <div class="p-panel" style="margin-top:8px">
      <div class="row" style="justify-content:space-between">
        <div>${t('total')}</div><div><b>${priceFmt(total)}</b></div>
      </div>
      <div class="footer-note">Telegram WebApp sendData → заказ придёт менеджеру.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="checkoutBtn"><i data-lucide="send"></i>${t('proceed')}</button>
        <a class="btn secondary" href="#/"><i data-lucide="arrow-left"></i>${t('continue')}</a>
      </div>
    </div>
  `;

  const list = el('#cartList');
  if (enriched.length === 0){
    list.innerHTML = `<div class="sub">${t('empty')}</div>`;
  } else {
    for (const x of enriched){
      const row = document.createElement('div');
      row.className='cart-item';
      row.innerHTML = `
        <img src="${x.product.images[0]}" alt="${x.product.title}">
        <div>
          <div><b>${x.product.title}</b></div>
          <div class="sub">${t('size')}: ${x.size || '—'}${x.color ? ` · ${t('color')}: ${x.color}` : ''}</div>
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

  // ТОЛЬКО здесь показываем MainButton
  if (tg){
    tg.MainButton.setText(t('proceed'));
    tg.MainButton.show();
    tg.MainButton.onClick(() => checkoutInTelegram(enriched));
  }
  el('#checkoutBtn').onclick = () => checkoutInTelegram(enriched);
  lucide.createIcons();
}

/* ---------- FAQ ---------- */
function renderFAQ(){
  closeDrawer();
  view.innerHTML = `
    <section class="section">
      <div class="h1">${t('faq')}</div>
      <div class="p-panel">
        <details open><summary>Как оформить заказ?</summary><p>Добавьте товар в корзину, перейдите в «${t('cart')}» и нажмите «${t('proceed')}». Заказ уйдёт менеджеру в Telegram.</p></details>
        <details><summary>Оплата и доставка</summary><p>Оплата по согласованию с менеджером. Доставка курьером/самовывоз.</p></details>
        <details><summary>Возвраты и обмен</summary><p>В течение 14 дней при сохранении товарного вида. Уточняйте условия в поддержке.</p></details>
        <details><summary>Как подобрать размер?</summary><p>Смотрите раздел «${t('sizeChart')}» в карточке товара или напишите нам в поддержку.</p></details>
      </div>
    </section>
  `;
}

/* ---------- Filters ---------- */
function applyFilters(list){
  const f = state.filters;
  return list.filter(p => {
    if (f.size.length){
      if (!p.sizes || !p.sizes.some(s => f.size.includes(s))) return false;
    }
    if (f.colors.length){
      if (!p.colors || !p.colors.some(c => f.colors.includes(c))) return false;
    }
    if (f.materials.length){
      if (!p.material || !f.materials.includes(p.material)) return false;
    }
    if (f.minPrice != null && p.price < f.minPrice) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    if (f.inStock && p.soldOut) return false;
    return true;
  });
}

function openFilterModal(){
  const allSizes = Array.from(new Set(state.products.flatMap(p => p.sizes || [])));
  const allColors = Array.from(new Set(state.products.flatMap(p => p.colors || [])));
  const allMaterials = Array.from(new Set(state.products.map(p => p.material).filter(Boolean)));

  const chipGroup = (items, selected, key) => items.map(v => `
    <button class="chip ${selected.includes(v)?'active':''}" data-${key}="${v}">${v}</button>
  `).join('');

  openModal({
    title: t('filters'),
    body: `
      <div class="h2">${t('size')}</div>
      <div class="toolbar" id="fSizes">${chipGroup(allSizes, state.filters.size, 'size')}</div>
      <div class="h2">${t('color')}</div>
      <div class="toolbar" id="fColors">${chipGroup(allColors, state.filters.colors, 'color')}</div>
      <div class="h2">${t('material')}</div>
      <div class="toolbar" id="fMaterials">${chipGroup(allMaterials, state.filters.materials, 'mat')}</div>
      <div class="row" style="margin-top:8px">
        <label class="chip"><input id="fStock" type="checkbox" ${state.filters.inStock?'checked':''} style="margin-right:8px"> ${t('inStockOnly')}</label>
        <button id="clearBtn" class="chip">${t('clear')}</button>
      </div>
    `,
    actions: [
      { label: t('cancel'), variant: 'secondary', onClick: closeModal },
      { label: t('apply'), onClick: () => {
        state.filters.inStock = el('#fStock').checked;
        const pick = (sel, attr) => Array.from(el(sel).querySelectorAll('.chip.active')).map(b => b.getAttribute(attr));
        state.filters.size = pick('#fSizes','data-size');
        state.filters.colors = pick('#fColors','data-color');
        state.filters.materials = pick('#fMaterials','data-mat');
        closeModal(); router(); renderActiveFilterChips();
      }}
    ],
    onOpen: () => {
      ['#fSizes','#fColors','#fMaterials'].forEach(s=>{
        el(s).addEventListener('click',e=>{
          const btn = e.target.closest('.chip'); if(!btn) return;
          btn.classList.toggle('active');
        });
      });
      el('#clearBtn').onclick = () => {
        state.filters = { size:[], colors:[], materials:[], minPrice:null, maxPrice:null, inStock:false };
        closeModal(); router(); renderActiveFilterChips();
      };
    }
  });
}

function renderActiveFilterChips(){
  const bar = el('#activeFilters'); if (!bar) return;
  bar.innerHTML = '';
  const addChip = (label) => {
    const t = document.getElementById('filter-chip');
    const n = t.content.firstElementChild.cloneNode(true);
    n.textContent = label; n.classList.add('active');
    bar.appendChild(n);
  };
  if (state.filters.size.length) addChip(t('size') + ': ' + state.filters.size.join(','));
  if (state.filters.colors.length) addChip(t('color') + ': ' + state.filters.colors.join(','));
  if (state.filters.materials.length) addChip(t('material') + ': ' + state.filters.materials.join(','));
}

/* ---------- Mutations ---------- */
function addToCart(product, size, color){
  const same = (a)=> a.productId===product.id && a.size===size && a.color===color;
  const existing = state.cart.items.find(same);
  if (existing) existing.qty += 1;
  else state.cart.items.push({ productId: product.id, size, color, qty: 1 });
  persistCart(); updateCartBadge();
  toast('Добавлено в корзину');
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

/* ---------- Checkout ---------- */
function checkoutInTelegram(summary){
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
    currency: PRICE_CURRENCY,
    comment: state.orderNote || "",
    user: tgUser,
    ts: Date.now()
  };

  const payload = JSON.stringify(order);
  if (tg?.sendData){
    tg.sendData(payload);
    toast('Заказ отправлен менеджеру в Telegram');
  } else {
    navigator.clipboard.writeText(payload);
    toast('WebApp вне Telegram: заказ (JSON) скопирован');
  }
}

/* ---------- Utils ---------- */
function priceFmt(rub){
  // исходные цены в products.json заданы в RUB → конвертируем в UZS
  const uzs = Math.round(rub * RUB_TO_UZS);
  return new Intl.NumberFormat('ru-RU', { style:'currency', currency: PRICE_CURRENCY, maximumFractionDigits:0 }).format(uzs);
}
function getCategoryName(slug){ return state.categories.find(c=>c.slug===slug)?.name || slug; }

function renderSizeChartHTML(){
  const rows = [
    ['INT','Грудь (см)','Талия (см)','Бёдра (см)'],
    ['XS','80–84','60–64','86–90'],
    ['S','84–88','64–68','90–94'],
    ['M','88–92','68–72','94–98'],
    ['L','92–98','72–78','98–104'],
    ['XL','98–104','78–86','104–110']
  ];
  const thead = `<tr>${rows[0].map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const body = rows.slice(1).map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="table">${thead}${body}</table></div>`;
}

/* ---------- Modal/Toast ---------- */
function openModal({title, body, actions=[], onOpen}){
  modalTitle.textContent = title || '';
  modalBody.innerHTML = body || '';
  modalActions.innerHTML = '';
  actions.forEach(a=>{
    const b = document.createElement('button');
    b.className = 'btn' + (a.variant==='secondary' ? ' secondary' : '');
    b.textContent = a.label;
    b.onclick = a.onClick || closeModal;
    modalActions.appendChild(b);
  });
  modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
  if (onOpen) onOpen();
  lucide.createIcons();
}
function closeModal(){
  modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
}
function toast(msg){
  const n = document.createElement('div');
  n.className='toast'; n.textContent = msg;
  toastWrap.appendChild(n);
  setTimeout(()=>{ n.remove(); }, 2500);
}

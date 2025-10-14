// === Evlise Outlet WebApp ===
// RU/UZ, цены в UZS. Мобильное меню с «Избранное», встроенный выдвижной список категорий,
// мультигалерея, реальные фото в полноэкранной модалке, квадратные свотчи,
// мини-подсказки для нижних кнопок (1 раз с чекбоксом), тосты сверху с отступом, улучшенная корзина.

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor('#0a0a0a'); } catch(e){}
  try { tg.setBackgroundColor('#0a0a0a'); } catch(e){}
}

// ------ Settings ------
const PRICE_CURRENCY = 'UZS';
const RUB_TO_UZS = 1;
const DEFAULT_LANG  = localStorage.getItem('evlise_lang')  || 'ru';
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
    favorites: 'Избранное',
    orderComment: 'Комментарий к заказу',
    orderCommentPlaceholder: 'Напишите пожелания: примерка, удобное время, адрес…',
    total: 'Сумма',
    proceed: 'Оформить заказ',
    back: 'Вернуться',
    empty: 'Корзина пуста.',
    notFound: 'Ничего не найдено. Измените фильтры.',
    faq: 'FAQ',
    home: 'Главная',
    support: 'Поддержка',
    inStockOnly: 'Только в наличии',
    clear: 'Сбросить',
    apply: 'Применить',
    cancel: 'Отмена',
    emptyFav: 'Список избранного пуст.',
    cleared: 'Корзина очищена',
    tipsTitle: 'Подсказки',
    tipsText: 'Нажмите «сердце» — в избранное. Дом — на главную. «Плюс» — добавить в корзину.',
    tipsDontShow: 'Больше не показывать'
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
    favorites: 'Sevimlilar',
    orderComment: 'Buyurtma uchun izoh',
    orderCommentPlaceholder: 'Istaklaringizni yozing: kiyib ko‘rish, vaqt, manzil…',
    total: 'Jami',
    proceed: 'Buyurtmani rasmiylashtirish',
    back: 'Qaytish',
    empty: 'Savat bo‘sh.',
    notFound: 'Hech narsa topilmadi. Filtrlarni o‘zgartiring.',
    faq: 'Savol-javob',
    home: 'Bosh sahifa',
    support: 'Qo‘llab-quvvatlash',
    inStockOnly: 'Faqat mavjud',
    clear: 'Tozalash',
    apply: 'Qo‘llash',
    cancel: 'Bekor qilish',
    emptyFav: 'Sevimlilar ro‘yxati bo‘sh.',
    cleared: 'Savat tozalandi',
    tipsTitle: 'Maslahatlar',
    tipsText: '«Yurak» — sevimlilarga. Uy — bosh sahifa. «Plus» — savatga qo‘shish.',
    tipsDontShow: 'Yana ko‘rsatmaslik'
  }
};
let lang = DEFAULT_LANG;
const t = (k) => i18n[lang][k] || k;

// ------ State ------
const state = {
  products: [],
  categories: [],
  filters: { size: [], colors: [], materials: [], minPrice: null, maxPrice: null, inStock: false },
  cart: JSON.parse(localStorage.getItem('evlise_cart') || '{"items":[]}'),
  favorites: JSON.parse(localStorage.getItem('evlise_fav') || '[]'),
  orderNote: localStorage.getItem('evlise_note') || ""
};

// ------ DOM ------
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
const headerEl = el('#appHeader');

// Theme init
document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
updateHeaderToggles();
updateToastTop();
window.addEventListener('resize', updateToastTop);

const routes = {
  '/': renderHome,
  '/category/:slug': renderCategory,
  '/product/:id': renderProduct,
  '/cart': renderCart,
  '/faq': renderFAQ,
  '/favorites': renderFavorites
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
  overlay.onclick = () => { closeDrawer(); closeModal(); };
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
function updateToastTop(){
  const h = headerEl?.offsetHeight || 56;
  document.documentElement.style.setProperty('--toastTop', `${h + 8}px`);
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

/* ---------- Drawer: встроенный выдвижной список «Категории» ---------- */
function buildDrawer(){
  const nav = el('#drawerNav'); nav.innerHTML = '';

  // Главные ссылки
  const mkLink = (label, href) => {
    const a = document.createElement('a');
    a.href = href; a.textContent = label;
    nav.appendChild(a);
  };
  mkLink(t('home'), '#/');
  mkLink(t('favorites'), '#/favorites');

  // Раздел «Категории» со стрелкой и скрывающимся списком
  const sec = document.createElement('div');
  sec.className = 'nav-section';

  const header = document.createElement('button');
  header.className = 'nav-accordion';
  header.innerHTML = `
    <span>${t('categories')}</span>
    <i data-lucide="chevron-down" class="chev"></i>
  `;
  const panel = document.createElement('div');
  panel.className = 'nav-panel'; // изначально скрыт через CSS

  // Наполняем списком категорий
  state.categories.forEach(c=>{
    const a = document.createElement('a');
    a.href = `#/category/${c.slug}`;
    a.textContent = c.name;
    panel.appendChild(a);
  });

  header.onclick = () => {
    const opened = panel.classList.toggle('open');
    header.classList.toggle('open', opened);
    lucide.createIcons();
  };

  sec.appendChild(header);
  sec.appendChild(panel);
  nav.appendChild(sec);

  mkLink(t('faq'), '#/faq');
  mkLink(t('cart'), '#/cart');

  lucide.createIcons();
}

/* ---------- Router ---------- */
function router(){
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
      <div class="showcase">
        <div class="slide">
          <div class="title">-20% на худи</div>
          <div class="text">Только до конца недели, промокод: EV20</div>
        </div>
        <div class="slide" style="background:linear-gradient(120deg,#22c55e,#14b8a6)">
          <div class="title">Бесплатная доставка</div>
          <div class="text">при заказе от 700 000 сумов</div>
        </div>
      </div>
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

/* ---------- Favorites ---------- */
function renderFavorites(){
  closeDrawer();
  const favSet = new Set(state.favorites);
  const list = state.products.filter(p => favSet.has(p.id));
  view.innerHTML = `
    <section class="section">
      <div class="h1">${t('favorites')}</div>
      <div class="grid" id="productGrid"></div>
    </section>
  `;
  if (list.length) drawProducts(list);
  else el('#productGrid').innerHTML = `<div class="sub">${t('emptyFav')}</div>`;
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
      <div class="p-gallery" id="gWrap">
        <img id="gMain" src="${p.images[0]}" alt="${p.title}"/>
        <div class="gallery-strip" id="gStrip"></div>

        <div class="real-photos">
          <h3>Реальные фото</h3>
          <div class="strip" id="realStrip"></div>
        </div>
      </div>

      <div class="p-panel">
        <div class="h1">${p.title}</div>
        <div class="sub">${p.subtitle || ''}</div>
        <div class="price">${priceFmt(p.price)}</div>

        ${sizes.length ? `<div class="h2">${t('size')}</div><div class="size-grid" id="sizeGrid"></div>` : ''}

        ${colors.length ? `
          <div class="h2" style="margin-top:8px">${t('color')}</div>
          <div class="color-grid" id="colorGrid"></div>
        ` : ''}

        <div class="hr"></div>

        <div class="h2">${t('description')}</div>
        <div>${p.description}</div>
        <div class="kv">
          <div>${t('category')}</div><div>${getCategoryName(p.category)}</div>
          <div>${t('material')}</div><div>${p.material || '—'}</div>
          <div>${t('sku')}</div><div>${p.sku || p.id}</div>
        </div>

        ${p.sizeChart ? `<div class="hr"></div><div class="h2">${t('sizeChart')}</div>${renderSizeChartHTML(p.sizeChart)}` : ''}
      </div>
    </div>

    <!-- стеклянные action-кнопки -->
    <div class="action-bar" id="actionBar">
      <button class="action-btn ${isFav(p.id)?'heart-active':''}" id="favBtn" data-tip="${isFav(p.id)?'В избранном':'В избранное'}"><i data-lucide="heart"></i></button>
      <a class="action-btn" id="homeBtn" data-tip="Главная" href="#/"><i data-lucide="home"></i></a>
      <button class="action-btn primary" id="cartBtn" data-tip="Добавить в корзину"><i data-lucide="plus"></i></button>
    </div>

    <!-- однократные подсказки -->
    <div id="tips" class="tips" aria-hidden="true">
      <div class="tips-card">
        <div class="tips-title">${t('tipsTitle')}</div>
        <div class="tips-text">${t('tipsText')}</div>
        <label class="tips-check"><input id="tipsNever" type="checkbox"> ${t('tipsDontShow')}</label>
        <button id="tipsOk" class="btn">${t('apply')}</button>
      </div>
    </div>
  `;

  // миниатюры
  const strip = el('#gStrip');
  (p.images || []).forEach((src, idx) => {
    const im = new Image();
    im.src = src; im.alt = p.title + ' ' + (idx+1);
    im.onclick = () => el('#gMain').src = src;
    strip.appendChild(im);
  });

  // реальные фото
  const realStrip = el('#realStrip');
  (p.realPhotos || []).forEach((src) => {
    const im = new Image();
    im.src = src; im.alt = p.title + ' real';
    im.onclick = () => openImageFullscreen(src);
    realStrip.appendChild(im);
  });

  // Размеры
  const sg = el('#sizeGrid');
  let selectedSize = null;
  (sizes || []).forEach(s => {
    const b = document.createElement('button');
    b.className='size'; b.textContent=s;
    b.onclick = () => { sg.querySelectorAll('.size').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedSize = s; };
    sg.appendChild(b);
  });

  // Цвета (квадратные свотчи с полной заливкой)
  let selectedColor = null;
  if (colors.length){
    const cg = el('#colorGrid');
    colors.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'swatch';
      btn.title = c;
      btn.innerHTML = `<span style="background:${colorToHex(c)}"></span>`;
      btn.onclick = () => { cg.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); selectedColor = c; };
      cg.appendChild(btn);
    });
  }

  // Action buttons
  const cartBtn = el('#cartBtn');
  const favBtn  = el('#favBtn');

  cartBtn.onclick = () => {
    addToCart(p, selectedSize, selectedColor);
    cartBtn.innerHTML = '<i data-lucide="shopping-bag"></i>';
    cartBtn.setAttribute('data-tip','Перейти в корзину');
    cartBtn.onclick = () => location.hash = '#/cart';
    lucide.createIcons();
  };

  favBtn.onclick = () => {
    toggleFav(p.id);
    favBtn.classList.toggle('heart-active');
    favBtn.setAttribute('data-tip', isFav(p.id) ? 'В избранном' : 'В избранное');
  };

  // Однократные подсказки
  tryShowTipsOnce();

  lucide.createIcons();
}

/* ---------- Tips (show once per user unless disabled) ---------- */
function tryShowTipsOnce(){
  const never = localStorage.getItem('evlise_tips_never') === '1';
  const seen  = localStorage.getItem('evlise_tips_seen') === '1';
  const tips  = el('#tips');
  if (never || seen || !tips) return;
  tips.setAttribute('aria-hidden','false');
  tips.classList.add('show');
  el('#tipsOk').onclick = () => {
    if (el('#tipsNever').checked) localStorage.setItem('evlise_tips_never', '1');
    localStorage.setItem('evlise_tips_seen','1');
    tips.classList.remove('show');
    tips.setAttribute('aria-hidden','true');
  };
}

/* ---------- Fullscreen Image ---------- */
function openImageFullscreen(src){
  openModal({
    title: '',
    body: `<img src="${src}" alt="" style="width:100%;height:auto;display:block;border-radius:12px">`,
    actions: [{ label: 'OK', onClick: closeModal }]
  });
}

/* ---------- Cart ---------- */
function renderCart(){
  closeDrawer();
  const items = state.cart.items;
  const enriched = items.map(it => ({ ...it, product: state.products.find(p=>p.id===it.productId) })).filter(x => x.product);
  let total = 0; enriched.forEach(x => total += x.qty * x.product.price);

  view.innerHTML = `
    <div class="row cart-head">
      <div class="h1" style="margin:0">${t('cart')}</div>
      <button class="icon-btn" id="clearCart" title="${t('clear')}" aria-label="${t('clear')}">
        <i data-lucide="trash-2"></i>
      </button>
    </div>

    <div class="cart" id="cartList"></div>

    <div class="p-panel cart-note">
      <div class="h2">${t('orderComment')}</div>
      <textarea id="orderNote" rows="3" placeholder="${t('orderCommentPlaceholder')}" class="note-input"></textarea>
    </div>

    <div class="p-panel cart-summary">
      <div class="row" style="justify-content:space-between">
        <div>${t('total')}</div><div><b>${priceFmt(total)}</b></div>
      </div>
      <div class="footer-note">Заказ отправится менеджеру в Telegram (WebApp).</div>
      <div class="row cart-summary-actions">
        <button class="btn secondary" id="backBtn"><i data-lucide="arrow-left"></i>${t('back')}</button>
        <button class="btn push-right" id="checkoutBtn"><i data-lucide="send"></i>${t('proceed')}</button>
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
      const sw = colorToHex(x.color || '');
      row.innerHTML = `
        <img src="${x.product.images[0]}" alt="${x.product.title}">
        <div class="cart-mid">
          <div class="cart-title">${x.product.title}</div>
          <div class="cart-meta">
            ${x.size ? `${t('size')}: ${x.size}` : ''}${x.color ? ` · ${t('color')}: <span class="cm-swatch" style="background:${sw};"></span>` : ''}
          </div>
          <div class="cart-meta">${priceFmt(x.product.price)} × ${x.qty}</div>
        </div>
        <div class="cart-right">
          <div class="cart-price">${priceFmt(x.product.price * x.qty)}</div>
          <div class="qty">
            <button data-act="dec" aria-label="Минус">−</button>
            <span>${x.qty}</span>
            <button data-act="inc" aria-label="Плюс">+</button>
            <button data-act="del" class="qty-del" title="Удалить" aria-label="Удалить">✕</button>
          </div>
        </div>
      `;
      row.querySelector('[data-act="inc"]').onclick = () => changeQty(x.product.id, x.size, x.color, 1);
      row.querySelector('[data-act="dec"]').onclick = () => changeQty(x.product.id, x.size, x.color, -1);
      row.querySelector('[data-act="del"]').onclick = () => removeFromCart(x.product.id, x.size, x.color);
      list.appendChild(row);
    }
  }

  const note = el('#orderNote');
  note.value = state.orderNote || '';
  note.oninput = () => {
    state.orderNote = note.value;
    localStorage.setItem('evlise_note', state.orderNote);
  };

  // Очистить корзину
  el('#clearCart').onclick = () => {
    state.cart.items = [];
    persistCart(); updateCartBadge(); renderCart();
    toast(t('cleared'));
  };

  // Вернуться
  el('#backBtn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');

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
      <div class="faq">
        <details class="item" open>
          <summary>Как оформить заказ? <span class="badge">шаг-за-шагом</span></summary>
          <div class="content"><p>Добавьте товар в корзину, перейдите в «${t('cart')}» и нажмите «${t('proceed')}». Заказ уйдёт менеджеру в Telegram.</p></div>
        </details>
        <details class="item">
          <summary>Оплата и доставка</summary>
          <div class="content"><p>Оплата по согласованию с менеджером. Доставка курьером/самовывоз.</p></div>
        </details>
        <details class="item">
          <summary>Возвраты и обмен</summary>
          <div class="content"><p>В течение 14 дней при сохранении товарного вида. Уточняйте условия в поддержке.</p></div>
        </details>
        <details class="item">
          <summary>Как подобрать размер?</summary>
          <div class="content"><p>Смотрите раздел «${t('sizeChart')}» в карточке товара или напишите нам в поддержку.</p></div>
        </details>
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
    const tNode = document.getElementById('filter-chip');
    const n = tNode.content.firstElementChild.cloneNode(true);
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

/* ---------- Favorites ---------- */
function isFav(id){ return state.favorites.includes(id); }
function toggleFav(id){
  if (isFav(id)) state.favorites = state.favorites.filter(x=>x!==id);
  else state.favorites.push(id);
  localStorage.setItem('evlise_fav', JSON.stringify(state.favorites));
  toast(isFav(id) ? 'Добавлено в избранное' : 'Удалено из избранного');
}

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
function priceFmt(v){
  const uzs = Math.round(v * RUB_TO_UZS);
  return new Intl.NumberFormat('ru-RU', { style:'currency', currency: PRICE_CURRENCY, maximumFractionDigits:0 }).format(uzs);
}
function getCategoryName(slug){ return state.categories.find(c=>c.slug===slug)?.name || slug; }

function renderSizeChartHTML(chart){
  const thead = `<tr>${chart.headers.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const body = chart.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="table">${thead}${body}</table></div>`;
}

function colorToHex(name){
  const map = {
    white:'#ffffff', black:'#111111', gray:'#8a8a8a',
    red:'#ef4444', blue:'#3b82f6', green:'#22c55e',
    beige:'#d6c7b0', brown:'#6b4f4f'
  };
  if (!name) return '#cccccc';
  const key = String(name).toLowerCase();
  return map[key] || key;
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

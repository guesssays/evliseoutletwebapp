// === Evlise Outlet WebApp ===
// RU/UZ, цены в UZS. Мобильное меню с «Избранное», встроенный аккордеон «Категории»,
// мультигалерея, реальные фото в полноэкранной модалке, квадратные свотчи,
// ПОЛНОЦЕННЫЙ ОНБОРДИНГ (мульти-слайды с иллюстрациями, 1 раз на TG-пользователя),
// тосты сверху, улучшенная корзина.

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

    // Онбординг
    ob_welcome_t: 'Добро пожаловать 👋',
    ob_welcome_d: 'Коротко покажем, как пользоваться приложением.',
    ob_actions_t: 'Кнопки на карточке товара',
    ob_actions_d: '♥ — добавить в избранное.\nДом — вернуться на главную.\n+ — добавить в корзину.',
    ob_filters_t: 'Фильтры и категории',
    ob_filters_d: 'Откройте «Фильтры», чтобы отобрать товары.\nКатегории — в боковом меню (≡).',
    ob_gallery_t: 'Галерея и реальные фото',
    ob_gallery_d: 'Листайте миниатюры, кликайте на «Реальные фото» — они откроются во весь экран.',
    ob_cart_t: 'Оформление заказа',
    ob_cart_d: 'Товары из корзины одним нажатием отправятся менеджеру в Telegram.',
    ob_next: 'Далее',
    ob_skip: 'Пропустить',
    ob_start: 'Начнём'
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

    // Onboarding
    ob_welcome_t: 'Xush kelibsiz 👋',
    ob_welcome_d: 'Ilova bilan qanday ishlashni qisqacha ko‘rsatamiz.',
    ob_actions_t: 'Tovar kartasidagi tugmalar',
    ob_actions_d: '♥ — sevimlilarga qo‘shish.\nUy — bosh sahifa.\n+ — savatga qo‘shish.',
    ob_filters_t: 'Filtrlar va kategoriyalar',
    ob_filters_d: '“Filtrlar” orqali saralang.\nKategoriyalar — yon menyuda (≡).',
    ob_gallery_t: 'Galereya va real suratlar',
    ob_gallery_d: 'Miniaturalarni aylantiring, “Real suratlar” ni bosing — to‘liq ekranda ochiladi.',
    ob_cart_t: 'Buyurtma berish',
    ob_cart_d: 'Savatdagi tovarlar Telegram menejeriga bitta bosishda yuboriladi.',
    ob_next: 'Keyingi',
    ob_skip: 'O‘tkazib yuborish',
    ob_start: 'Boshlaymiz'
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
  // Онбординг сразу после первой инициализации
  showOnboardingOnce();
  router();
  window.addEventListener('hashchange', router);
  if (window.lucide?.createIcons) lucide.createIcons();
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
  if (window.lucide?.createIcons) lucide.createIcons();
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

  // Если открыт онбординг — перерисовать тексты на лету (и не падать, если его нет)
  if (modal.classList.contains('show') && modalBody.querySelector('.ob')){
    renderOnboardingSlide(currentOnboardingIndex || 0);
  }
}

function openDrawer(){ drawer.classList.add('open'); overlay.classList.add('show'); drawer.setAttribute('aria-hidden','false'); }
function closeDrawer(){ drawer.classList.remove('open'); overlay.classList.remove('show'); drawer.setAttribute('aria-hidden','true'); }

/* ---------- Drawer: аккордеон «Категории» прямо в меню ---------- */
function buildDrawer(){
  const nav = el('#drawerNav'); nav.innerHTML = '';

  const mkLink = (label, href) => {
    const a = document.createElement('a');
    a.href = href; a.textContent = label;
    nav.appendChild(a);
  };
  mkLink(t('home'), '#/');
  mkLink(t('favorites'), '#/favorites');

  // Раздел «Категории»
  const sec = document.createElement('div');
  sec.className = 'nav-section';

  const header = document.createElement('button');
  header.className = 'nav-accordion';
  header.innerHTML = `
    <span class="nav-accordion-title">${t('categories')}</span>
    <i data-lucide="chevron-down" class="chev"></i>
  `;
  const panel = document.createElement('div');
  panel.className = 'nav-panel';

  state.categories.forEach(c=>{
    const a = document.createElement('a');
    a.href = `#/category/${c.slug}`;
    a.textContent = c.name;
    panel.appendChild(a);
  });

  header.onclick = () => {
    const opened = panel.classList.toggle('open');
    header.classList.toggle('open', opened);
    if (window.lucide?.createIcons) lucide.createIcons();
  };

  sec.appendChild(header);
  sec.appendChild(panel);
  nav.appendChild(sec);

  mkLink(t('faq'), '#/faq');
  mkLink(t('cart'), '#/cart');

  if (window.lucide?.createIcons) lucide.createIcons();
}

/* ---------- Router ---------- */
function router(){
  if (tg?.MainButton) tg.MainButton.hide();
  let hash = location.hash.replace(/^#/, '') || '/';
  const hashNoQuery = hash.split('?')[0];
  for (const pattern in routes){
    const match = matchRoute(pattern, hashNoQuery);
    if (match){ routes[pattern](match.params); return; }
  }
  renderHome();
}
function matchRoute(pattern, path){
  path = path.split('?')[0];
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
  if (window.lucide?.createIcons) lucide.createIcons();
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

        <div class="kv-ico">
          <div class="kv-row">
            <i data-lucide="folder"></i><span>${t('category')}</span><b>${getCategoryName(p.category)}</b>
          </div>
          <div class="kv-row">
            <i data-lucide="layers"></i><span>${t('material')}</span><b>${p.material || '—'}</b>
          </div>
          <div class="kv-row">
            <i data-lucide="hash"></i><span>${t('sku')}</span><b>${p.sku || p.id}</b>
          </div>
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
  `;

  // миниатюры
  const strip = el('#gStrip');
  (p.images || []).forEach((src, idx) => {
    const im = new Image();
    im.src = src; im.alt = p.title + ' ' + (idx+1);
    im.onclick = () => el('#gMain').src = src;
    strip.appendChild(im);
  });

  // реальные фото (клик — полноэкранно)
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
  sizes.forEach(s => {
    const b = document.createElement('button');
    b.className='size'; b.textContent=s;
    b.onclick = () => { sg.querySelectorAll('.size').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedSize = s; };
    sg.appendChild(b);
  });

  // Цвета — квадратные свотчи
  let selectedColor = null;
  if (colors.length){
    const cg = el('#colorGrid');
    colors.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'swatch';
      btn.title = c;
      btn.style.background = colorToHex(c);
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
    if (window.lucide?.createIcons) lucide.createIcons();
  };

  favBtn.onclick = () => {
    toggleFav(p.id);
    favBtn.classList.toggle('heart-active');
    favBtn.setAttribute('data-tip', isFav(p.id) ? 'В избранном' : 'В избранное');
  };

  if (window.lucide?.createIcons) lucide.createIcons();
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

/* ---------- Cart ---------- */
function renderCart(){
  closeDrawer();

  // сопоставляем позиции корзины с объектами продуктов
  const summary = state.cart.items
    .map(it => ({
      ...it,
      product: state.products.find(p => String(p.id) === String(it.productId))
    }))
    .filter(x => x.product);

  if (!summary.length){
    view.innerHTML = `
      <section class="section">
        <div class="h1">${t('cart')}</div>
        <p class="sub">${t('empty')}</p>
        <div class="cart-actions">
          <a href="#/" class="btn secondary">${t('back')}</a>
        </div>
      </section>
    `;
    return;
  }

  // сумма
  const total = summary.reduce((s,x) => s + x.qty * x.product.price, 0);

  // разметка
  view.innerHTML = `
    <section class="section cart-head">
      <div class="h1">${t('cart')}</div>
    </section>

    <section class="section cart" id="cartList">
      ${summary.map(x => `
        <div class="cart-item" data-id="${x.product.id}" data-size="${x.size||''}" data-color="${x.color||''}">
          <img src="${x.product.images?.[0] || ''}" alt="${x.product.title}">
          <div class="cart-mid">
            <div class="cart-title">${x.product.title}</div>
            <div class="cart-meta">
              ${x.size ? `${t('size')}: ${x.size} • ` : ''}
              ${x.color ? `${t('color')}: ${x.color} <span class="cm-swatch" style="background:${colorToHex(x.color)}"></span>` : ''}
            </div>
          </div>
          <div class="cart-price">${priceFmt(x.product.price * x.qty)}</div>

          <div class="cart-right">
            <div class="qty">
              <button class="qty-dec" aria-label="-">–</button>
              <span>${x.qty}</span>
              <button class="qty-inc" aria-label="+">+</button>
            </div>
            <button class="qty-del" aria-label="Удалить"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `).join('')}
    </section>

    <section class="section cart-note">
      <div class="h2">${t('orderComment')}</div>
      <textarea id="orderNote" class="note-input" rows="3" placeholder="${t('orderCommentPlaceholder')}">${state.orderNote || ''}</textarea>
    </section>

    <section class="section cart-summary">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div class="h2">${t('total')}</div>
        <div class="price">${priceFmt(total)}</div>
      </div>
      <div class="cart-actions">
        <button id="clearCart" class="btn secondary">${t('clear')}</button>
        <button id="proceedBtn" class="btn push-right">${t('proceed')}</button>
      </div>
      <div class="footer-note sub" style="margin-top:8px">
        ${t('support')}: <a class="link" href="https://t.me/evliseoutlet" target="_blank" rel="noopener">t.me/evliseoutlet</a>
      </div>
    </section>
  `;

  // биндим плюс/минус/удалить
  document.querySelectorAll('.cart-item').forEach(row => {
    const id    = Number(row.getAttribute('data-id'));
    const size  = row.getAttribute('data-size') || null;
    const color = row.getAttribute('data-color') || null;

    row.querySelector('.qty-inc').onclick = () => changeQty(id, size, color, +1);
    row.querySelector('.qty-dec').onclick = () => changeQty(id, size, color, -1);
    row.querySelector('.qty-del').onclick = () => removeFromCart(id, size, color);
  });

  // комментарий к заказу
  const noteEl = document.getElementById('orderNote');
  noteEl.oninput = () => {
    state.orderNote = noteEl.value;
    localStorage.setItem('evlise_note', state.orderNote);
  };

  // оформить заказ
  document.getElementById('proceedBtn').onclick = () => checkoutInTelegram(summary);

  // очистить корзину
  document.getElementById('clearCart').onclick = () => {
    state.cart.items = [];
    persistCart(); updateCartBadge();
    toast(t('cleared'));
    renderCart();
  };

  // обновим иконки, если lucide подключён
  if (window.lucide?.createIcons) lucide.createIcons();
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
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  if (onOpen) onOpen();
  if (window.lucide?.createIcons) lucide.createIcons();
}
function closeModal(){
  modal.classList.remove('show');
  modal.classList.remove('blur-heavy');
  modal.setAttribute('aria-hidden','true');
}
function toast(msg){
  const n = document.createElement('div');
  n.className='toast'; n.textContent = msg;
  toastWrap.appendChild(n);
  setTimeout(()=>{ n.remove(); }, 2500);
}

/* ---------- Fullscreen Image (вернули) ---------- */
function openImageFullscreen(src){
  openModal({
    title: '',
    body: `<img src="${src}" alt="" style="width:100%;height:auto;display:block;border-radius:12px">`,
    actions: [{ label: 'OK', onClick: closeModal }]
  });
}

/* ============================================================
   ONBOARDING (multi-step, once per TG user, with illustrations)
   ============================================================ */
function userScopedKey(base){
  const uid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return uid ? `${base}_${uid}` : base;
}
const ONBOARDING_KEY = () => userScopedKey('evlise_onboarding_seen');
let currentOnboardingIndex = 0;

function showOnboardingOnce(){
  const force = new URLSearchParams((location.hash.split('?')[1] || '')).get('ob') === '1';
  const seen = localStorage.getItem(ONBOARDING_KEY()) === '1';
  if (seen && !force) return;

  currentOnboardingIndex = 0;
  openModal({
    title: '',
    body: `<div class="ob"></div>`,
    actions: [],
    onOpen: () => {
      modal.classList.add('blur-heavy');
      renderOnboardingSlide(currentOnboardingIndex);
    }
  });
}

function renderOnboardingSlide(i){
  const slides = getOnboardingSlides();
  currentOnboardingIndex = Math.max(0, Math.min(i, slides.length - 1));
  const s = slides[currentOnboardingIndex];

  const body = el('#modalBody');
  body.innerHTML = `
    <div class="ob">
      <div class="ob-ill">${s.ill}</div>
      <div class="ob-title">${s.title}</div>
      <div class="ob-desc">${s.desc.replace(/\n/g,'<br>')}</div>
      <div class="ob-dots">${slides.map((_,idx)=>`<span class="dot ${idx===currentOnboardingIndex?'active':''}"></span>`).join('')}</div>
    </div>
  `;

  // Actions
  modalActions.innerHTML = '';
  if (currentOnboardingIndex < slides.length - 1){
    const skip = document.createElement('button');
    skip.className = 'btn secondary';
    skip.textContent = t('ob_skip');
    skip.onclick = finishOnboarding;
    modalActions.appendChild(skip);
  } else {
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    spacer.style.visibility = 'hidden';
    modalActions.appendChild(spacer);
  }

  const primary = document.createElement('button');
  primary.className = 'btn';
  primary.textContent = currentOnboardingIndex === 0 ? t('ob_start')
                      : currentOnboardingIndex < slides.length - 1 ? t('ob_next')
                      : t('ob_start');
  primary.onclick = () => {
    if (currentOnboardingIndex < slides.length - 1) {
      renderOnboardingSlide(currentOnboardingIndex + 1);
    } else {
      finishOnboarding();
    }
  };
  modalActions.appendChild(primary);
}

function finishOnboarding(){
  localStorage.setItem(ONBOARDING_KEY(), '1');
  closeModal();
}

// Simple inline SVG illustrations (lightweight, no external assets)
function svgPhone(content){
  return `
  <svg viewBox="0 0 280 220" class="ob-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="70" y="10" rx="18" ry="18" width="140" height="200" fill="currentColor" opacity=".06"/>
    <rect x="85" y="30" rx="12" ry="12" width="110" height="160" fill="currentColor" opacity=".08"/>
    ${content}
  </svg>`;
}
function illActions(){
  return svgPhone(`
    <circle cx="140" cy="170" r="28" stroke="currentColor" stroke-width="2" fill="none"/>
    <path d="M140 158 v24 M128 170 h24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M100 170 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M180 170 l14 -14 M194 170 l-14 -14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <rect x="95" y="60" width="90" height="60" rx="8" fill="currentColor" opacity=".12"/>
  `);
}
function illFilters(){
  return svgPhone(`
    <rect x="95" y="60" width="90" height="44" rx="8" fill="currentColor" opacity=".12"/>
    <rect x="95" y="110" width="28" height="10" rx="4" fill="currentColor" opacity=".25"/>
    <rect x="128" y="110" width="28" height="10" rx="4" fill="currentColor" opacity=".18"/>
    <rect x="161" y="110" width="24" height="10" rx="4" fill="currentColor" opacity=".1"/>
    <path d="M150 150 l10 12 l10 -20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <rect x="180" y="30" width="22" height="8" rx="4" fill="currentColor" opacity=".25"/>
  `);
}
function illGallery(){
  return svgPhone(`
    <rect x="95" y="54" width="90" height="70" rx="8" fill="currentColor" opacity=".12"/>
    <rect x="100" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".25"/>
    <rect x="126" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".18"/>
    <rect x="152" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".12"/>
    <rect x="178" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".06"/>
  `);
}
function illCart(){
  return svgPhone(`
    <rect x="100" y="70" width="80" height="18" rx="6" fill="currentColor" opacity=".12"/>
    <rect x="100" y="96" width="80" height="18" rx="6" fill="currentColor" opacity=".12"/>
    <circle cx="120" cy="146" r="12" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M112 146 h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <rect x="148" y="136" width="32" height="20" rx="10" fill="currentColor" opacity=".18"/>
  `);
}
function illWelcome(){
  return svgPhone(`
    <rect x="100" y="70" width="80" height="60" rx="12" fill="currentColor" opacity=".12"/>
    <path d="M120 94 l20 20 M140 94 l-20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `);
}

function getOnboardingSlides(){
  return [
    { title: t('ob_welcome_t'), desc: t('ob_welcome_d'), ill: illWelcome() },
    { title: t('ob_actions_t'), desc: t('ob_actions_d'), ill: illActions() },
    { title: t('ob_filters_t'), desc: t('ob_filters_d'), ill: illFilters() },
    { title: t('ob_gallery_t'), desc: t('ob_gallery_d'), ill: illGallery() },
    { title: t('ob_cart_t'), desc: t('ob_cart_d'), ill: illCart() },
  ];
}

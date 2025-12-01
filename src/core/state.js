// src/core/state.js
export const PRICE_CURRENCY = 'UZS';
export const RUB_TO_UZS = 1;
export const DEFAULT_LANG  = localStorage.getItem('evlise_lang')  || 'ru';
export const DEFAULT_THEME = localStorage.getItem('evlise_theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

export const state = {
  products: [],
  categories: [],
  cart: { items: [] },
  user: null,
  filters: { category: 'all', query: '', size:[], colors:[], materials:[], minPrice:null, maxPrice:null, inStock:false },
  orders: [],
  addresses: { list: [], defaultId: null },
  profile: { phone:'', payerFullName:'' },
  favorites: new Set(),

  // ==== Настройка чата оформления заказа ====
  // Юзернейм чата/аккаунта без @
  operatorUsername: 'evliseorder',
  // Жёсткий deeplink-шаблон с автотекстом (имеет приоритет):
  // {TEXT} будет заменён на encodeURIComponent(текст заказа)
  orderChatUrlTemplate: 'tg://resolve?domain=evliseorder&text={TEXT}',

// ==== АКЦИИ: только переопределения ====
// Всё остальное (баннеры, тема по умолчанию) — в promo.js/defaults()
promo: {
  enabled: false,
  slug: 'newyear-2026',
  title: 'Новогодняя акция',


  // скидочные позиции (ID => { oldPrice, price })
  discounts: {
    "14101528596752402": { oldPrice: 699000, price: 429000 }, // MetrA
    "14101528226915746": { oldPrice: 599000,  price: 429000 },
    "14101527948199258": { oldPrice: 679000,  price: 499000 },
    "14101527535402578": { oldPrice: 599000,  price: 429000 },
    "14101527020044130": { oldPrice: 599000,  price: 449000 },
    "14101526829795202": { oldPrice: 629000,  price: 469000 },
    "14101526401794362": { oldPrice: 539000,  price: 399000 },
    "14101525970321810": { oldPrice: 679000,  price: 499000 },
    "14101525531481474": { oldPrice: 519000,  price: 369000 },
    "14101525186699018": { oldPrice: 559000,  price: 399000 },
    "14101524683618594": { oldPrice: 799000,  price: 549000 },
    "14101523982277474": { oldPrice: 980000,  price: 649000 },
    "14101523665192378": { oldPrice: 1049000,  price: 699000 },
    "14101523262309378": { oldPrice: 779000,  price: 599000 },
    "14101522940312586": { oldPrice: 749000,  price: 599000 },
    "14101521878897410": { oldPrice: 929000,  price: 699000 },
    "14101521316074538": { oldPrice: 449000,  price: 299000 },
    "14101522372288130": { oldPrice: 549000,  price: 399000 }
  },

  // товары с удвоенным кэшбеком
  x2CashbackIds: [
    "14099643769255626",
    "14089051360497450",
    "14098174152324562",
    "14098158877457594",
    "14098158369745610",
    "14097484288658290",
    "14097482467855394",
    "14097482008212426",
    "14091752084078242",
    "14089063450503850",
    "14089060373749058",
    "14100342294856898",
    "14099605059221010",
    "14098175148781226",
    "14089034423513306",
    "14089055591019258",
    "14089054715229746",
    "14089046698319930",
    "14097442974404618",
    "14098159387967562",
    "14098175677098890",
    "14099646323993322"
  ],

  // можно НЕ указывать: возьмутся дефолты из promo.js
  // banners: [
  //   { id: 'bn1', img: 'assets/promo/newyear/banner-1.jpg', alt: 'Новогодняя акция — скидки и x2 кэшбек' },
  //   { id: 'bn2', img: 'assets/promo/newyear/banner-2.jpg', alt: 'Новогодняя коллекция — большие скидки' },
  //   { id: 'bn3', img: 'assets/promo/newyear/banner-3.jpg', alt: 'Хиты сезона — x2 кэшбек' },
  // ],
  // theme: {
  //   gridBg: '#0b1220',
  //   gridBgImage: 'assets/promo/newyear/bg-snow.svg',
  //   gridTint: 'rgba(255,255,255,.04)',
  //   badgeColor: '#ef4444',
  //   badgeX2Color: '#06b6d4',
  // },
},

};

/* ===== user scoping (per-user localStorage) ===== */
const UID_KEY = 'nas_uid';

function readTgUserId() {
  try {
    const id = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return id ? String(id) : null;
  } catch { return null; }
}

export function getUID(){
  try{
    let v = localStorage.getItem(UID_KEY);
    if (v) return String(v);
    const tg = readTgUserId();
    if (tg) {
      localStorage.setItem(UID_KEY, tg);
      return tg;
    }
    return null; // важное изменение: не притворяемся гостем
  }catch{ return null; }
}

export function k(base){ return `${base}__${getUID() || 'nouid'}`; }
export function kFor(base, uid){ return `${base}__${uid || 'nouid'}`; }
export function migrateOnce(base){
  try{
    const old = localStorage.getItem(base);
    const scoped = localStorage.getItem(k(base));
    if (old && !scoped){
      localStorage.setItem(k(base), old);
    }
  }catch{}
}

/* ====== >>> SYNC: аккуратная синхронизация снимка пользователя на сервер ====== */
function getTelegramChatId() {
  try {
    const id = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return id ? String(id) : null;
  } catch { return null; }
}

let __syncTimer = 0;
function scheduleUserSync(delay = 600){
  try{ clearTimeout(__syncTimer); }catch{}
  __syncTimer = setTimeout(doUserSync, delay);
}

async function doUserSync(){
  const uid = getUID();
  const chatId = getTelegramChatId();
  if (!uid || !chatId) return; // вне Telegram — пропускаем, чтобы не плодить мусор на бэке

  // Готовим срез корзины
  const cart = (state.cart?.items || []).map(it => ({
    id   : String(it.productId || it.id || ''),
    qty  : Number(it.qty || 1),
    title: String((state.products.find(p=>String(p.id)===String(it.productId))?.title) || 'товар'),
    price: Number((state.products.find(p=>String(p.id)===String(it.productId))?.price) || 0),
  })).filter(x => x.id);

  // Избранное — массив строк
  const favorites = [...(state.favorites || new Set())].map(String);

  const body = {
    uid,
    chatId,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tashkent',
    cart,
    favorites
  };

  try{
    await fetch('/.netlify/functions/user-sync', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
  }catch{
    // тихий режим
  }
}
/* ====== <<< SYNC ====== */

/* ===== Корзина ===== */
export function persistCart(){
  localStorage.setItem(k('nas_cart'), JSON.stringify(state.cart));
  scheduleUserSync(500); // >>> SYNC: при каждом изменении корзины мягко синхронизируем
}

/**
 * ВАЖНО: больше НЕ переносим общий ключ 'nas_cart' в персональный.
 * Это исправляет баг с автодобавлением демо-товара всем новым пользователям.
 * Дополнительно: одноразово удаляем legacy-ключ 'nas_cart', если он когда-то существовал.
 */
export function loadCart(){
  try{ localStorage.removeItem('nas_cart'); }catch{}

  try{
    const raw = localStorage.getItem(k('nas_cart'));
    const parsed = raw ? JSON.parse(raw) : { items: [] };

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    state.cart = {
      items: items
        .map(it => ({
          productId: String(it.productId || ''),
          size: it.size ?? null,
          color: it.color ?? null,
          qty: Math.max(0, Number(it.qty) || 0),
          price: Number(it.price || 0),        // поддержка сохранённой цены
          title: it.title || '',
          image: it.image || '',
          slug: it.slug || '',
        }))
        .filter(it => it.productId && it.qty > 0)
    };
  }catch{
    state.cart = { items: [] };
  }
}

export function pruneCartAgainstProducts(products){
  const ids = new Set(products.map(p => String(p.id)));
  const before = state.cart.items.length;
  state.cart.items = state.cart.items.filter(it => {
    const okId = ids.has(String(it.productId));
    const okQty = Number(it.qty) > 0;
    return okId && okQty;
  });
  if (state.cart.items.length !== before) persistCart();
}

export function updateCartBadge(){
  const n = state.cart.items.reduce((s,i)=> s + (Number(i.qty) || 0), 0);
  const badges = [...document.querySelectorAll('#cartBadge, [data-cart-badge], .cart-badge')];
  if (!badges.length) return;
  badges.forEach(b=>{
    if (n > 0){
      b.textContent = String(n);
      b.style.display = 'inline-block';
      b.hidden = false;
      b.setAttribute('aria-hidden','false');
    }else{
      b.textContent = '';
      b.style.display = 'none';
      b.hidden = true;
      b.setAttribute('aria-hidden','true');
    }
  });
}

/* ===== Адреса ===== */
const ADDR_BASE = 'nas_addresses';
export function loadAddresses(){
  migrateOnce(ADDR_BASE);
  try{
    const data = JSON.parse(localStorage.getItem(k(ADDR_BASE)) || '{}');
    state.addresses = { list: data.list || [], defaultId: data.defaultId || null };
  }catch{
    state.addresses = { list: [], defaultId: null };
  }
}
export function persistAddresses(){
  localStorage.setItem(k(ADDR_BASE), JSON.stringify(state.addresses));
}

/* ===== Профиль ===== */
const PROF_BASE = 'nas_profile';
export function loadProfile(){
  migrateOnce(PROF_BASE);
  try{
    const data = JSON.parse(localStorage.getItem(k(PROF_BASE)) || '{}');
    state.profile = {
      phone: data.phone || '',
      payerFullName: data.payerFullName || ''
    };
  }catch{
    state.profile = { phone:'', payerFullName:'' };
  }
}
export function persistProfile(){
  localStorage.setItem(k(PROF_BASE), JSON.stringify({
    phone: state.profile?.phone || '',
    payerFullName: state.profile?.payerFullName || ''
  }));
}

/* ===== Избранное ===== */
const FAV_BASE = 'nas_favorites';
export function loadFavorites(){
  migrateOnce(FAV_BASE);
  try{
    const arr = JSON.parse(localStorage.getItem(k(FAV_BASE)) || '[]');
    state.favorites = new Set(Array.isArray(arr) ? arr.map(String) : []);
  }catch{
    state.favorites = new Set();
  }
}
export function persistFavorites(){
  try{ localStorage.setItem(k(FAV_BASE), JSON.stringify([...state.favorites])); }catch{}
  scheduleUserSync(800); // >>> SYNC: при изменениях избранного тоже синхронизируем
}
export function isFav(productId){
  return state.favorites.has(String(productId));
}
export function toggleFav(productId){
  const id = String(productId);
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  persistFavorites();
  try{ window.dispatchEvent(new CustomEvent('force:rerender')); }catch{}
}

/* ===== Уведомления (персонально) ===== */
const NOTIF_BASE = 'nas_notifications';

export function getNotifications(){
  try{ return JSON.parse(localStorage.getItem(k(NOTIF_BASE)) || '[]'); }catch{ return []; }
}
export function setNotifications(list){
  localStorage.setItem(k(NOTIF_BASE), JSON.stringify(Array.isArray(list) ? list : []));
}
export function pushNotification(n){
  const list = getNotifications();
  list.push({ id: Date.now(), ts: Date.now(), read:false, icon:'bell', title:'', sub:'', ...n });
  setNotifications(list);
}
export function pushNotificationFor(uid, n){
  if (!uid) return;
  const key = kFor(NOTIF_BASE, String(uid));
  let list = [];
  try{ list = JSON.parse(localStorage.getItem(key) || '[]'); }catch{}
  list.push({ id: Date.now(), ts: Date.now(), read:false, icon:'bell', title:'', sub:'', ...n });
  localStorage.setItem(key, JSON.stringify(list));
}

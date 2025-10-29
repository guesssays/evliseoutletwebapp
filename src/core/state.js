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

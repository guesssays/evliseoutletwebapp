// src/main.js
import {
  state,
  loadCart,
  updateCartBadge,
  loadAddresses,
  pruneCartAgainstProducts,
  loadProfile,
  loadFavorites,
  getUID,
  getNotifications,
  setNotifications,
  pushNotification,
} from './core/state.js';

import { toast } from './core/toast.js';
import { el, initTelegramChrome } from './core/utils.js';

import { renderHome, drawCategoriesChips } from './components/Home.js';
import { renderProduct } from './components/Product.js';
import { renderCart } from './components/Cart.js';
import { renderFavorites } from './components/Favorites.js';
import { renderCategory } from './components/Category.js'; // ВАЖНО: заглавная буква
import { renderOrders, renderTrack } from './components/Orders.js';
import { openFilterModal, renderActiveFilterChips } from './components/Filters.js';
import { renderAccount, renderAddresses, renderSettings } from './components/Account.js';
import { renderFAQ } from './components/FAQ.js';
import { renderNotifications } from './components/Notifications.js';

// Админка
import { renderAdmin } from './components/Admin.js';
import { renderAdminLogin } from './components/AdminLogin.js';
import { getOrders, getStatusLabel } from './core/orders.js';
import { canAccessAdmin, tryUnlockFromStartParam } from './core/auth.js';

// Пинг в бота (маркетинг/события)
import {
  notifyOrderPlaced,
  notifyOrderAccepted,
  notifyStatusChanged,
  notifyOrderCanceled,
  notifyCartReminder,
  notifyFavoritesReminder,
} from './core/botNotify.js';

/* ===== «богатые» уведомления через Netlify Function ===== */
const NOTIF_API = '/.netlify/functions/notifs';
const USER_JOIN_API = '/.netlify/functions/user-join';

async function notifApiList(uid){
  const url = `${NOTIF_API}?op=list&uid=${encodeURIComponent(uid)}`;
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json().catch(()=>({}));
  if (!res.ok || !data?.ok) throw new Error('notif list error');
  return Array.isArray(data.items) ? data.items : [];
}
async function notifApiAdd(uid, notif){
  const res = await fetch(NOTIF_API, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ op:'add', uid:String(uid), notif })
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok || !data?.ok) throw new Error('notif add error');
  return data.id || notif.id || Date.now();
}
async function notifApiMarkAll(uid){
  const res = await fetch(NOTIF_API, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ op:'markAll', uid:String(uid) })
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok || !data?.ok) throw new Error('notif markAll error');
  // сервер теперь отдаёт актуальный список
  return Array.isArray(data.items) ? data.items : null;
}

function mergeNotifsToLocal(serverItems){
  const local = getNotifications();
  const byId = new Map(local.map(n => [String(n.id), n]));
  let changed = false;

  for (const s of serverItems){
    const sid = String(s.id);
    const prev = byId.get(sid);
    if (!prev){
      byId.set(sid, { id:s.id, ts:s.ts||Date.now(), read:!!s.read, icon:s.icon||'bell', title:s.title||'', sub:s.sub||'' });
      changed = true;
    }else{
      const next = { ...prev, ...s };
      if (JSON.stringify(next) !== JSON.stringify(prev)){
        byId.set(sid, next);
        changed = true;
      }
    }
  }

  if (changed){
    setNotifications([...byId.values()].sort((a,b)=> (b.ts||0)-(a.ts||0)));
  }
}

async function serverPushFor(uid, notif){
  const safe = {
    id: notif.id || Date.now(),
    ts: notif.ts || Date.now(),
    read: !!notif.read,
    icon: notif.icon || 'bell',
    title: String(notif.title || ''),
    sub: String(notif.sub || '')
  };
  try{
    await notifApiAdd(uid, safe);
  }catch{
    if (String(uid) === String(getUID?.())){
      const cache = getNotifications();
      cache.push(safe);
      setNotifications(cache);
    }
  }
}

async function syncMyNotifications(){
  const uid = getUID();
  if (!uid) return;
  try{
    const items = await notifApiList(uid);
    mergeNotifsToLocal(items);
    updateNotifBadge?.();
  }catch{}
}

/* ---------- ранняя фиксация UID ---------- */
(function initUserIdentityEarly(){
  const tg = window.Telegram?.WebApp;

  // Telegram-пользователь → фиксируем его id как UID
  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    state.user = u;
    try{ localStorage.setItem('nas_uid', String(u.id)); }catch{}
    return;
  }

  // Гость → ВСЕГДА общий UID 'guest' (без анонимных anon_…)
  try{
    const stored = localStorage.getItem('nas_uid');
    if (!stored) localStorage.setItem('nas_uid', 'guest');
  }catch{
    // ignore
  }
})();

/* ---------- персональные данные ---------- */
loadCart();
loadAddresses();
loadProfile();
loadFavorites();
updateCartBadge();
initTelegramChrome();

/* ---------- ADMIN MODE ---------- */
function setAdminMode(on){
  document.body.classList.toggle('admin-mode', !!on);
  setTabbarMenu(on ? 'admin' : 'home');
}
function confirmAdminSwitch(onConfirm, onCancel){
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  mt.textContent = 'Переключение интерфейса';
  mb.innerHTML = `
    <div style="font-size:15px;line-height:1.35">
      Вы покидаете пользовательский интерфейс и переходите в режим администратора. Продолжить?
    </div>
  `;
  ma.innerHTML = `
    <button id="admCancel" class="pill">Отмена</button>
    <button id="admOk" class="pill primary">Подтвердить</button>
  `;
  modal.classList.add('show');
  document.getElementById('modalClose').onclick = close;
  document.getElementById('admCancel').onclick = ()=>{ close(); onCancel && onCancel(); };
  document.getElementById('admOk').onclick = ()=>{ close(); onConfirm && onConfirm(); };
  function close(){ modal.classList.remove('show'); }
}

/* ---------- таббар-хелперы ---------- */
function mountIcons(){ window.lucide?.createIcons && lucide.createIcons(); }
function killExternalCTA(){
  document.querySelectorAll('.cta, .paybtn').forEach(n => n.remove());
  document.body.classList.remove('has-cta');
}
function setTabbarMenu(activeKey = 'home'){
  const inner = document.querySelector('.tabbar .tabbar-inner');
  if (!inner) return;
  killExternalCTA();
  inner.classList.remove('is-cta');

  const inAdmin = document.body.classList.contains('admin-mode');

  if (inAdmin){
    inner.innerHTML = `
      <a href="#/admin" data-tab="admin" class="tab ${activeKey==='admin'?'active':''}" role="tab" aria-selected="${String(activeKey==='admin')}">
        <i data-lucide="shield-check"></i><span>Админка</span>
      </a>
      <a href="#/account" id="leaveAdmin" data-tab="leave" class="tab" role="tab" aria-selected="false">
        <i data-lucide="log-out"></i><span>Выйти</span>
      </a>
    `;
    mountIcons();
    document.getElementById('leaveAdmin')?.addEventListener('click', (e)=>{
      e.preventDefault();
      setAdminMode(false);
      location.hash = '#/account';
    });
    return;
  }

  const adminTab = canAccessAdmin() ? `
    <a href="#/admin" id="openAdminTab" data-tab="admin" class="tab ${activeKey==='admin'?'active':''}" role="tab" aria-selected="${String(activeKey==='admin')}">
      <i data-lucide="shield-check"></i><span>Админка</span>
    </a>` : '';

  inner.innerHTML = `
    <a href="#/" data-tab="home" class="tab ${activeKey==='home'?'active':''}" role="tab" aria-selected="${String(activeKey==='home')}">
      <i data-lucide="home"></i><span>Главная</span>
    </a>
    <a href="#/favorites" data-tab="saved" class="tab ${activeKey==='saved'?'active':''}" role="tab" aria-selected="${String(activeKey==='saved')}">
      <i data-lucide="heart"></i><span>Избранное</span>
    </a>
    <a href="#/cart" data-tab="cart" class="tab badge-wrap ${activeKey==='cart'?'active':''}" role="tab" aria-selected="${String(activeKey==='cart')}">
      <i data-lucide="shopping-bag"></i><span>Корзина</span>
      <b id="cartBadge" class="badge" hidden></b>
    </a>
    <a href="#/account" data-tab="account" class="tab ${activeKey==='account'?'active':''}" role="tab" aria-selected="${String(activeKey==='account')}">
      <i data-lucide="user-round"></i><span>Аккаунт</span>
    </a>
    ${adminTab}
  `;
  mountIcons();

  document.getElementById('openAdminTab')?.addEventListener('click', (e)=>{
    e.preventDefault();
    confirmAdminSwitch(()=>{
      setAdminMode(true);
      location.hash = '#/admin';
    });
  });

  updateCartBadge();
}
function setTabbarCTA(arg){
  const inner = document.querySelector('.tabbar .tabbar-inner');
  if (!inner) return;
  killExternalCTA();
  document.body.classList.add('has-cta');

  let id='ctaBtn', html='', onClick=null;
  if (typeof arg==='string'){ html = arg; }
  else { ({id='ctaBtn', html='', onClick=null} = arg||{}); }

  inner.classList.add('is-cta');
  inner.innerHTML = `<button id="${id}" class="btn" style="flex:1">${html}</button>`;
  mountIcons();
  if (onClick) document.getElementById(id).onclick = onClick;
}
function setTabbarCTAs(
  left = { id:'ctaLeft', html:'', onClick:null },
  right = { id:'ctaRight', html:'', onClick:null }
){
  const inner = document.querySelector('.tabbar .tabbar-inner');
  if (!inner) return;
  killExternalCTA();
  document.body.classList.add('has-cta');

  inner.classList.add('is-cta');
  inner.innerHTML = `
    <button id="${left.id||'ctaLeft'}" class="btn outline" style="flex:1">${left.html||''}</button>
    <button id="${right.id||'ctaRight'}" class="btn" style="flex:1">${right.html||''}</button>
  `;
  mountIcons();
  if (left.onClick)  document.getElementById(left.id||'ctaLeft').onclick   = left.onClick;
  if (right.onClick) document.getElementById(right.id||'ctaRight').onclick = right.onClick;
}

/* делаем доступными глобально (нужно для Cart/Product и т.д.) */
window.setTabbarMenu = setTabbarMenu;
window.setTabbarCTA  = setTabbarCTA;
window.setTabbarCTAs = setTabbarCTAs;

/* ---------- Telegram авторизация + deep-link ---------- */
(function initTelegram(){
  const tg = window.Telegram?.WebApp;
  if (tg?.initDataUnsafe){
    const u = tg.initDataUnsafe.user;
    if (u) state.user = u;

    const sp = String(tg.initDataUnsafe.start_param || '').trim().toLowerCase();
    tryUnlockFromStartParam();

    if (sp === 'admin' || sp === 'admin-login'){
      try{ sessionStorage.setItem('nas_start_route', `#/${sp}`); }catch{}
    }
  }
})();

/* ---------- Поиск ---------- */
el('#searchInput')?.addEventListener('input', (e)=>{
  state.filters.query = e.target.value;
  renderHome(router);
});

/* ---------- Уведомления (per-user) ---------- */
function updateNotifBadge(){
  const unread = getNotifications().filter(n=>!n.read).length;
  const b = document.getElementById('notifBadge');
  if (!b) return;
  if (unread>0){
    b.textContent = String(unread);
    b.hidden = false;
    b.setAttribute('aria-hidden','false');
  } else {
    b.textContent = '';
    b.hidden = true;
    b.setAttribute('aria-hidden','true');
  }
}
window.updateNotifBadge = updateNotifBadge;

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#openNotifications');
  if (!btn) return;
  location.hash = '#/notifications';
});

function seedNotificationsOnce(){
  try{
    if (getNotifications().length) return;
    const seed = [
      { id: 1, title: 'Добро пожаловать в EVLISE OUTLET', sub: 'Подборка новинок уже на главной.', ts: Date.now()-1000*60*60*6, read:false, icon:'bell' },
      { id: 2, title: 'Скидки на худи', sub: 'MANIA и DIRT — выгоднее на 15% до воскресенья.', ts: Date.now()-1000*60*50, read:false, icon:'percent' },
    ];
    setNotifications(seed);
  }catch{}
}

/* ---------- фикс-хедер товара: скрытие вне карточки ---------- */
function hideProductHeader(){
  const stat = document.querySelector('.app-header');
  const fix  = document.getElementById('productFixHdr');

  if (window._productHdrAbort){
    try{ window._productHdrAbort.abort(); }catch{}
    window._productHdrAbort = null;
  }

  if (fix){
    fix.classList.remove('show');
    fix.setAttribute('aria-hidden','true');
  }
  if (stat){
    stat.classList.remove('hidden');
  }
}

/* ---------- РОУТЕР ---------- */
async function router(){
  const path=(location.hash||'#/').slice(1);
  const clean = path.replace(/#.*/,'');

  const inAdmin = document.body.classList.contains('admin-mode');

  const parts = path.split('/').filter(Boolean);
  const map = {
    '':'home','/':'home','/favorites':'saved','/cart':'cart','/account':'account','/orders':'account',
    '/admin':'admin'
  };

  const match = (pattern)=>{
    const p=pattern.split('/').filter(Boolean); if(p.length!==parts.length) return null;
    const params={};
    for(let i=0;i<p.length;i++){
      if(p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i]);
      else if(p[i]!==parts[i]) return null;
    }
    return params;
  };

  setTabbarMenu(map[clean] || (inAdmin ? 'admin' : 'home'));
  hideProductHeader();

  // Админ-режим
  if (inAdmin){
    if (parts.length===0 || parts[0] !== 'admin'){
      location.hash = '#/admin';
      return renderAdmin();
    }
    if (!canAccessAdmin()){
      setAdminMode(false);
      toast('Доступ в админ-панель ограничен');
      location.hash = '#/admin-login';
      return;
    }
    return renderAdmin();
  }

  // Клиентский роутинг
  if (parts.length===0) return renderHome(router);
  const m1=match('category/:slug'); if (m1) return renderCategory(m1);
  const m2=match('product/:id');   if (m2) return renderProduct(m2);
  const m3=match('track/:id');     if (m3) return renderTrack(m3);

  if (match('favorites'))          return renderFavorites();
  if (match('cart'))               return renderCart();
  if (match('orders'))             return renderOrders();

  if (match('account'))            return renderAccount();
  if (match('account/addresses'))  return renderAddresses();
  if (match('account/settings'))   return renderSettings();

  if (match('notifications')){
    // подтянем актуальные и покажем экран
    await syncMyNotifications();
    renderNotifications(updateNotifBadge);

    // сразу пометим все прочитанными на сервере и мгновенно обнулим локальный счётчик
    const uid = getUID();
    try {
      const items = await notifApiMarkAll(uid);
      if (items) {
        mergeNotifsToLocal(items); // в кэш кладём уже read:true
      } else {
        // фолбэк: локально отметим прочитанными
        const loc = getNotifications().map(n => ({ ...n, read: true }));
        setNotifications(loc);
      }
    } catch {}
    updateNotifBadge?.();
    return;
  }

  if (match('admin')){
    if (!canAccessAdmin()){
      toast('Доступ в админ-панель ограничен');
      location.hash = '#/admin-login';
      return;
    }
    confirmAdminSwitch(()=>{
      setAdminMode(true);
      location.hash = '#/admin';
    }, ()=>{
      location.hash = '#/account';
    });
    return;
  }

  if (match('faq')) return renderFAQ();

  renderHome(router);
}

/* ---------- ИНИЦИАЛИЗАЦИЯ ---------- */
async function init(){
  // загрузка каталога
  try{
    const res = await fetch('data/products.json');
    const data = await res.json();
    state.products   = Array.isArray(data?.products)   ? data.products   : [];
    state.categories = Array.isArray(data?.categories) ? data.categories.map(c=>({ ...c, name: c.name })) : [];
  }catch{
    state.products = []; state.categories = [];
  }

  try{ state.orders = await getOrders(); }catch{ state.orders = []; }

  pruneCartAgainstProducts(state.products);
  updateCartBadge();

  drawCategoriesChips(router);
  renderActiveFilterChips();

  // запоминаем стартовый роут
  let startRoute = null;
  try{
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe){ tryUnlockFromStartParam(); }
    startRoute = sessionStorage.getItem('nas_start_route');
    sessionStorage.removeItem('nas_start_route');
  }catch{}
  if (startRoute){ location.hash = startRoute; }

  // одноразовый пинг о новом пользователе (только для Telegram-пользователя)
  await ensureUserJoinReported();

  await router();

  window.addEventListener('hashchange', router);

  window.addEventListener('orders:updated', ()=>{
    const inAdmin = document.body.classList.contains('admin-mode');
    const isAdminRoute = location.hash.replace('#','').startsWith('/admin');
    if (inAdmin && isAdminRoute){
      try{ window.dispatchEvent(new CustomEvent('admin:refresh')); }catch{}
    }else{
      router();
    }
  });

  window.addEventListener('force:rerender', router);

  window.addEventListener('auth:updated', ()=>{
    if (document.body.classList.contains('admin-mode') && !canAccessAdmin()){
      setAdminMode(false);
      location.hash = '#/admin-login';
    }
    router();
  });

  function buildOrderShortTitle(order) {
    const firstTitle =
      order?.cart?.[0]?.title ||
      order?.cart?.[0]?.name ||
      order?.title ||
      'товар';
    const extra = Math.max(0, (order?.cart?.length || 0) - 1);
    return extra > 0 ? `${firstTitle} + ещё ${extra}` : firstTitle;
  }

  function instantLocalIfSelf(targetUid, notif){
    if (String(targetUid) === String(getUID?.())) {
      pushNotification(notif);
      updateNotifBadge?.();
    }
  }

  window.addEventListener('client:orderPlaced', async (e)=>{
    try{
      const id = e.detail?.id;

      // единый объект уведомления с детерминированным id
      const notif = {
        id: `order-placed-${id}`,
        ts: Date.now(),
        icon: 'package',
        title: 'Заказ оформлен',
        sub: `#${id} — ожидает подтверждения`,
        read: false
      };

      // локально
      pushNotification(notif);
      updateNotifBadge?.();

      // и на сервер — тем же id
      await serverPushFor(getUID(), notif);

      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const title = buildOrderShortTitle(order);

      const uid = state?.user?.id;
      notifyOrderPlaced(uid, { orderId: id, title });

      // ВАЖНО: сообщаем приложению, что список заказов изменился (админка обновится)
      window.dispatchEvent(new CustomEvent('orders:updated'));
    }catch{}
  });

  window.addEventListener('admin:orderAccepted', async (e)=>{
    try{
      const { id, userId } = e.detail || {};

      const notif = {
        icon: 'shield-check',
        title: 'Заказ принят администратором',
        sub: `#${id}`,
      };

      await serverPushFor(userId, notif);
      instantLocalIfSelf(userId, notif);

      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const title = buildOrderShortTitle(order);
      notifyOrderAccepted(userId, { orderId: id, title });
    }catch{}
  });

  window.addEventListener('admin:statusChanged', async (e)=>{
    try{
      const { id, status, userId } = e.detail || {};

      const notif = {
        icon: 'refresh-ccw',
        title: 'Статус заказа обновлён',
        sub: `#${id}: ${getStatusLabel(status)}`,
      };

      await serverPushFor(userId, notif);
      instantLocalIfSelf(userId, notif);

      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const title = buildOrderShortTitle(order);
      notifyStatusChanged(userId, { orderId: id, title });
    }catch{}
  });

  window.addEventListener('admin:orderCanceled', async (e)=>{
    try{
      const { id, reason, userId } = e.detail || {};

      const notif = {
        icon: 'x-circle',
        title: 'Заказ отменён',
        sub: `#${id}${reason ? ` — ${reason}` : ''}`,
      };

      await serverPushFor(userId, notif);
      instantLocalIfSelf(userId, notif);

      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const title = buildOrderShortTitle(order);
      notifyOrderCanceled(userId, { orderId: id, title });
    }catch{}
  });

  window.lucide && lucide.createIcons?.();

  seedNotificationsOnce();
  updateNotifBadge();

  // синк уведомлений сразу и по интервалу
  syncMyNotifications();
  const NOTIF_POLL_MS = 30000;
  setInterval(syncMyNotifications, NOTIF_POLL_MS);

  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) syncMyNotifications(); });

  // маркетинговые пинги
  scheduleMarketingBotPings();
}
init();

/* ---------- ФИЛЬТРЫ ---------- */
document.getElementById('openFilters')?.addEventListener('click', ()=> openFilterModal(router));

export { updateNotifBadge, getNotifications, setNotifications, setTabbarMenu, setTabbarCTA, setTabbarCTAs };

/* ===== маркетинговые напоминания в бота ===== */
function scheduleMarketingBotPings(){
  const chatId = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!chatId) return;

  const uid = getUID();
  const K_LAST_CART = `mkt_last_cart__${uid}`;
  const K_LAST_FAV  = `mkt_last_fav__${uid}`;
  const K_IDX_CART  = `mkt_idx_cart__${uid}`;
  const K_IDX_FAV   = `mkt_idx_fav__${uid}`;

  const cartPhrases = [
    p => `Ваша корзина ждёт: «${p}». Успейте оформить до конца дня ✨`,
    p => `Не забыли про «${p}»? Товар всё ещё в корзине — 2 клика до заказа.`,
    p => `«${p}» и другие позиции всё ещё с вами. Давайте завершим оформление?`,
    p => `Чуть-чуть не хватило до покупки: «${p}». Возвращайтесь, мы всё сохранили!`,
  ];
  const favPhrases = [
    p => `Избранное напоминает о себе: «${p}». Загляните, вдруг пора брать 👀`,
    p => `Вы отмечали «${p}» в избранное. Проверьте наличие размеров!`,
    p => `«${p}» всё ещё в вашем избранном. Вернуться к просмотру?`,
    p => `Похоже, вам нравилось «${p}». Возможно, самое время оформить заказ ✨`,
  ];

  function nowLocal(){ return new Date(); }
  function isEvening(d){ const h=d.getHours(); return h>=20 && h<22; }
  function dayKey(d){ return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
  function daysBetween(ts){
    if (!ts) return Infinity;
    const a = new Date(); const b = new Date(ts);
    const one = 24*60*60*1000;
    return Math.floor((a.setHours(0,0,0,0)-b.setHours(0,0,0,0))/one);
  }

  function pickFrom(list, kIdx){
    const i = (Number(localStorage.getItem(kIdx)) || 0) % list.length;
    localStorage.setItem(kIdx, String(i+1));
    return list[i];
  }

  async function tick(){
    const d = nowLocal();
    if (!isEvening(d)) return;

    try{
      const lastCartKey = localStorage.getItem(K_LAST_CART) || '';
      if (state.cart?.items?.length > 0 && lastCartKey !== dayKey(d)){
        const first = state.cart.items[0];
        const product = state.products.find(p => String(p.id) === String(first.productId));
        const title = product?.title || 'товар';
        const phraseFn = pickFrom(cartPhrases, K_IDX_CART);
        const text = phraseFn(title);
        await notifyCartReminder(String(chatId), { text });
        localStorage.setItem(K_LAST_CART, dayKey(d));
      }
    }catch{}

    try{
      const lastFavTs = Number(localStorage.getItem(K_LAST_FAV) || 0);
      if ((state.favorites?.size || 0) > 0 && daysBetween(lastFavTs) >= 3){
        const favId = [...state.favorites][0];
        const p = state.products.find(x => String(x.id) === String(favId));
        const title = p?.title || 'товар';
        const phraseFn = pickFrom(favPhrases, K_IDX_FAV);
        const text = phraseFn(title);
        await notifyFavoritesReminder(String(chatId), { text });
        localStorage.setItem(K_LAST_FAV, String(Date.now()));
      }
    }catch{}
  }

  tick();
  const TIMER_MS = 10 * 60 * 1000;
  setInterval(tick, TIMER_MS);

  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) tick(); });
}

/* ===== одноразовый пинг «новый пользователь» для Telegram ===== */
async function ensureUserJoinReported(){
  try{
    const tgUser = window?.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!tgUser) return; // только для Telegram-пользователей

    const uid = String(tgUser.id);
    const FLAG = `user_join_sent__${uid}`;
    if (localStorage.getItem(FLAG) === '1') return;

    const payload = {
      uid,
      first_name: String(tgUser.first_name || '').trim(),
      last_name: String(tgUser.last_name || '').trim(),
      username: String(tgUser.username || '').trim(),
    };

    const r = await fetch(USER_JOIN_API, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
    });
    // даже при ответе ok/not-ok — фиксируем, чтобы не ддосить
    localStorage.setItem(FLAG, '1');

    // необязательно: можно обработать ответ
    await r.json().catch(()=> ({}));
  }catch{
    // тихо игнорируем — в следующий раз не будем спамить
  }
}

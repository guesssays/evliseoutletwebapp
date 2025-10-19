// src/app.js
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
  // pushNotificationFor, // больше не используем в «богатой» версии — уведомляем через сервер
} from './core/state.js';

import { toast } from './core/toast.js';
import { el } from './core/utils.js';
import { initTelegramChrome } from './core/utils.js';

import { renderHome, drawCategoriesChips } from './components/Home.js';
import { renderProduct } from './components/Product.js';
import { renderCart } from './components/Cart.js';
import { renderFavorites } from './components/Favorites.js';
import { renderCategory } from './components/Category.js';
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

// === Пинг в Telegram-бота (короткие уведомления) ===
import {
  notifyOrderPlaced,
  notifyOrderAccepted,
  notifyStatusChanged,
  notifyOrderCanceled,
} from './core/botNotify.js';

/* ====== «БОГАТЫЕ» уведомления: серверная синхронизация ======
   Хранилище: Netlify Function (/.netlify/functions/notifs) с поддержкой:
   - GET  ?op=list&uid=<uid>                        → [{ id, ts, read, icon, title, sub }]
   - POST { op:'add',    uid, notif }               → { ok:true, id }
   - POST { op:'markAll',uid }                      → { ok:true }
   - POST { op:'mark',   uid, ids:[...]}            → { ok:true }
   Клиент продолжает хранить кэш локально (Notifications.js не меняем).
*/
const NOTIF_API = '/.netlify/functions/notifs';

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
  try{
    await fetch(NOTIF_API, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ op:'markAll', uid:String(uid) })
    });
  }catch{}
}

/** Слияние серверных уведомлений с локальным кэшем, без дубликатов по id */
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
      // обновим read-статус/текст, если вдруг поменялся
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

/** Пуш на сервер для конкретного пользователя */
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
    // фолбэк: положим локально, чтобы пользователь хоть что-то увидел
    if (String(uid) === String(getUID?.())){
      const cache = getNotifications();
      cache.push(safe);
      setNotifications(cache);
    }
  }
}

/** Синхронизировать серверные уведомления текущего пользователя → локальный кэш */
async function syncMyNotifications(){
  const uid = getUID();
  if (!uid) return;
  try{
    const items = await notifApiList(uid);
    mergeNotifsToLocal(items);
    updateNotifBadge?.();
  }catch{}
}

/* ---------- Ранняя фиксация UID до загрузки персональных данных ---------- */
(function initUserIdentityEarly(){
  const tg = window.Telegram?.WebApp;

  // если есть Telegram-пользователь — берём его id
  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    state.user = u;
    try{ localStorage.setItem('nas_uid', String(u.id)); }catch{}
    return;
  }

  // нет Telegram-пользователя: обеспечиваем УНИКАЛЬНЫЙ анонимный UID
  try{
    const stored = localStorage.getItem('nas_uid');
    if (stored && stored !== 'guest') {
      // уже есть персональный UID — ничего не делаем
      return;
    }
    // либо не было, либо был общий "guest" — генерируем свой
    const anon = 'anon_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('nas_uid', anon);
  }catch{
    // на всякий случай оставим "guest", если localStorage недоступен
    try{ localStorage.setItem('nas_uid', 'guest'); }catch{}
  }
})();

/* ---------- Персональные данные (уже с корректным UID) ---------- */
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
/* ---------- helpers для таббара ---------- */
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

  // клиентский таббар
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

/** Один CTA внутри таббара */
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

/** Два CTA */
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

/* Глобально доступные хелперы таббара (нужны для Cart/Product и т.п.) */
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
  if (unread>0){ b.textContent = String(unread); b.hidden = false; } else { b.hidden = true; }
}

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

/* ---------- Фикс-хедер товара: универсальное скрытие вне карточки ---------- */
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

/* ---------- Роутер (АСИНХРОННЫЙ) ---------- */
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

  // Сбросить фикс-хедер товара при смене экрана
  hideProductHeader();

  // Жёстко ограничиваем маршруты в админ-режиме
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

  // === обычный клиентский роутинг
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
    // ВАЖНО: перед рендером подтягиваем свежие уведомления с сервера,
    // чтобы изменения статуса заказа сразу появлялись в приложении.
    await syncMyNotifications();
    renderNotifications(updateNotifBadge);
    // Параллельно отметим всё прочитанным на сервере
    const uid = getUID();
    notifApiMarkAll(uid);
    return;
  }

  // если жмём «Админка» в клиентском режиме — покажем предупреждение
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

  if (match('faq'))                return renderFAQ();

  renderHome(router);
}

/* ---------- Инициализация ---------- */
async function init(){
  const res = await fetch('data/products.json'); const data = await res.json();
  state.products   = data.products;
  state.categories = data.categories.map(c=>({ ...c, name: c.name }));

  // Заказы (теперь централизованы, просто грузим в state)
  try{ state.orders = await getOrders(); }catch{ state.orders = []; }

  // САНИТИЗАЦИЯ КОРЗИНЫ
  pruneCartAgainstProducts(state.products);
  updateCartBadge();

  drawCategoriesChips(router);
  renderActiveFilterChips();

  // применяем маршрут из start_param, если есть
  let startRoute = null;
  try{
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe){ tryUnlockFromStartParam(); }
    startRoute = sessionStorage.getItem('nas_start_route');
    sessionStorage.removeItem('nas_start_route');
  }catch{}
  if (startRoute){ location.hash = startRoute; }

  await router();

  window.addEventListener('hashchange', router);

  // ВАЖНО: Больше не перезапускаем router() при обновлении заказов в админке,
  // чтобы не сбрасывать вкладку/экран и не вызывать «прыжки».
  window.addEventListener('orders:updated', ()=>{
    const inAdmin = document.body.classList.contains('admin-mode');
    const isAdminRoute = location.hash.replace('#','').startsWith('/admin');
    if (inAdmin && isAdminRoute){
      // мягко попросим админку просто перерисоваться
      try{ window.dispatchEvent(new CustomEvent('admin:refresh')); }catch{}
    }else{
      // обычное поведение для клиентской части
      router();
    }
  });

  window.addEventListener('force:rerender', router);

  // при смене прав — перерисовать таббар/выйти из админки при потере доступа
  window.addEventListener('auth:updated', ()=>{
    if (document.body.classList.contains('admin-mode') && !canAccessAdmin()){
      setAdminMode(false);
      location.hash = '#/admin-login';
    }
    router();
  });

  // ===== утилита: короткий заголовок заказа для уведомлений в бота
  function buildOrderShortTitle(order) {
    const firstTitle =
      order?.cart?.[0]?.title ||
      order?.cart?.[0]?.name ||
      order?.title ||
      'товар';
    const extra = Math.max(0, (order?.cart?.length || 0) - 1);
    return extra > 0 ? `${firstTitle} + ещё ${extra}` : firstTitle;
  }

  // === УВЕДОМЛЕНИЯ: персонифицированные события + ПИНГ В БОТА ===

  // локальный «мгновенный» пуш, если событие относится к текущему пользователю
  function instantLocalIfSelf(targetUid, notif){
    if (String(targetUid) === String(getUID?.())) {
      pushNotification(notif);
      updateNotifBadge?.();
    }
  }

  window.addEventListener('client:orderPlaced', async (e)=>{
    try{
      const id = e.detail?.id;

      // локальный быстрый отклик для пользователя
      pushNotification({
        icon: 'package',
        title: 'Заказ оформлен',
        sub: `#${id} — ожидает подтверждения`,
      });
      updateNotifBadge?.();

      // положим на сервер (богатая версия)
      await serverPushFor(getUID(), {
        icon:'package',
        title:'Заказ оформлен',
        sub:`#${id} — ожидает подтверждения`
      });

      // подготовим название для бота
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const title = buildOrderShortTitle(order);

      // пинг боту: только если это Telegram-пользователь
      const uid = state?.user?.id;
      notifyOrderPlaced(uid, { orderId: id, title });
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

      // серверное уведомление адресно пользователю
      await serverPushFor(userId, notif);

      // мгновенно показать в приложении, если это текущий пользователь
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

      // мгновенно показать в приложении, если это текущий пользователь
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

      // мгновенно показать в приложении, если это текущий пользователь
      instantLocalIfSelf(userId, notif);

      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const title = buildOrderShortTitle(order);
      notifyOrderCanceled(userId, { orderId: id, title });
    }catch{}
  });

  window.lucide && lucide.createIcons?.();

  seedNotificationsOnce();
  updateNotifBadge();

  // Синхронизация серверных уведомлений пользователя: сразу и по интервалу
  syncMyNotifications();
  const NOTIF_POLL_MS = 30000; // 30 секунд (можно увеличить до 60–120с)
  setInterval(syncMyNotifications, NOTIF_POLL_MS);

  // Дополнительно: при возвращении приложения на передний план — подтягиваем свежие уведомления
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) syncMyNotifications(); });
}
init();

/* ---------- Фильтры ---------- */
document.getElementById('openFilters').onclick=()=> openFilterModal(router);

// экспорт если понадобится
export { updateNotifBadge, getNotifications, setNotifications, setTabbarMenu, setTabbarCTA, setTabbarCTAs };

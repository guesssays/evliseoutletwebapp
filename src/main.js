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
  pushNotificationFor,
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
import { getOrders, clearAllOrders } from './core/orders.js';
import { canAccessAdmin, tryUnlockFromStartParam } from './core/auth.js';

/* ---------- Ранняя фиксация UID до загрузки персональных данных ---------- */
(function initUserIdentityEarly(){
  const tg = window.Telegram?.WebApp;
  let uid = 'guest';
  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    state.user = u;
    uid = String(u.id);
  } else {
    uid = localStorage.getItem('nas_uid') || 'guest';
  }
  try{ localStorage.setItem('nas_uid', uid); }catch{}
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

/* ---------- Роутер ---------- */
function router(){
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

  if (match('notifications'))      return renderNotifications(updateNotifBadge);

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

  /* Одноразовая очистка всех заказов (включая демо) после обновления */
  try{
    if (!localStorage.getItem('nas_orders_wiped_v1')){
      clearAllOrders();
      localStorage.setItem('nas_orders_wiped_v1','1');
    }
  }catch{}

  // Заказы
  state.orders = getOrders();

  // САНИТИЗАЦИЯ КОРЗИНЫ
  pruneCartAgainstProducts(state.products);
  updateCartBadge();

  drawCategoriesChips(router);
  renderActiveFilterChips();

  // применяем маршрут из start_param, если есть
  let startRoute = null;
  try{
    startRoute = sessionStorage.getItem('nas_start_route');
    sessionStorage.removeItem('nas_start_route');
  }catch{}
  if (startRoute){ location.hash = startRoute; }

  router();

  window.addEventListener('hashchange', router);
  window.addEventListener('orders:updated', ()=>{
    state.orders = getOrders();
    router();
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

  // === УВЕДОМЛЕНИЯ: персонифицированные события ===
  window.addEventListener('client:orderPlaced', (e)=>{
    try{
      pushNotification({
        icon: 'package',
        title: 'Заказ оформлен',
        sub: `#${e.detail?.id} — ожидает подтверждения`,
      });
      updateNotifBadge?.();
    }catch{}
  });

  window.addEventListener('admin:orderAccepted', (e)=>{
    try{
      const { id, userId } = e.detail || {};
      pushNotificationFor(userId, {
        icon: 'shield-check',
        title: 'Заказ принят администратором',
        sub: `#${id}`,
      });
      if (String(userId) === String(getUID?.())) updateNotifBadge?.();
    }catch{}
  });

  window.addEventListener('admin:statusChanged', (e)=>{
    try{
      const { id, status, userId } = e.detail || {};
      pushNotificationFor(userId, {
        icon: 'refresh-ccw',
        title: 'Статус заказа обновлён',
        sub: `#${id}: ${status}`,
      });
      if (String(userId) === String(getUID?.())) updateNotifBadge?.();
    }catch{}
  });

  window.addEventListener('admin:orderCanceled', (e)=>{
    try{
      const { id, reason, userId } = e.detail || {};
      pushNotificationFor(userId, {
        icon: 'x-circle',
        title: 'Заказ отменён',
        sub: `#${id}${reason ? ` — ${reason}` : ''}`,
      });
      if (String(userId) === String(getUID?.())) updateNotifBadge?.();
    }catch{}
  });

  window.lucide && lucide.createIcons?.();

  seedNotificationsOnce();
  updateNotifBadge();
}
init();

/* ---------- Фильтры ---------- */
document.getElementById('openFilters').onclick=()=> openFilterModal(router);

// экспорт если понадобится
export { updateNotifBadge, getNotifications, setNotifications, setTabbarMenu, setTabbarCTA, setTabbarCTAs };

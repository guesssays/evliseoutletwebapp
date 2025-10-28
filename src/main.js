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
import { mountScrollTop } from './components/ScrollTop.js';

import { renderHome, drawCategoriesChips } from './components/Home.js';
import { renderProduct } from './components/Product.js';
import { renderCart } from './components/Cart.js';
import { renderFavorites } from './components/Favorites.js';
import { renderCategory } from './components/Category.js'; // ВАЖНО: заглавная буква
import { renderOrders, renderTrack } from './components/Orders.js';
import { openFilterModal, renderActiveFilterChips } from './components/Filters.js';
import { renderAccount, renderAddresses, renderSettings, renderCashback, renderReferrals } from './components/Account.js';
import { renderFAQ } from './components/FAQ.js';
import { renderNotifications } from './components/Notifications.js';
import { ScrollReset } from './core/scroll-reset.js';

// Вынесенный фикс-хедер товара
import { deactivateProductFixHeader } from './components/ProductFixHeader.js';
import { HomeScrollMemory } from './core/scroll-memory-home.js';
// Админка
import { renderAdmin } from './components/Admin.js';
import { renderAdminLogin } from './components/AdminLogin.js';
import { getOrders, getStatusLabel } from './core/orders.js';
import { canAccessAdmin, tryUnlockFromStartParam } from './core/auth.js';

/* ===== Реферал/кешбэк: deeplink-капчер + bind ===== */
import {
  captureInviterFromContext,
  tryBindPendingInviter,
} from './core/loyalty.js';

// Экран-мостик для браузера
import { renderRefBridge } from './views/RefBridge.js';


/* ===== Кэшбек/Рефералы: локальные утилиты (дозревание локальных pending) ===== */
const POINTS_MATURITY_MS  = 24*60*60*1000;
function k(base){ try{ const uid = getUID?.() || 'guest'; return `${base}__${uid}`; }catch{ return `${base}__guest`; } }

/* ---------- ОДНОРАЗОВАЯ МИГРАЦИЯ КОШЕЛЬКА guest -> реальный UID ---------- */
/**
 * Если старые пользователи копили баллы под ключом points_wallet__guest,
 * переносим содержимое в points_wallet__<uid>. Запускается один раз на UID.
 */
function migrateGuestWalletOnce() {
  try {
    const realUid = getUID?.();
    if (!realUid) return;

    const FLAG = `points_wallet_migrated__${realUid}`;
    if (localStorage.getItem(FLAG) === '1') return;

    const guestKey = `points_wallet__guest`;
    const realKey  = `points_wallet__${realUid}`;

    const guestRaw = localStorage.getItem(guestKey);
    const realRaw  = localStorage.getItem(realKey);

    if (guestRaw && !realRaw) {
      localStorage.setItem(realKey, guestRaw);
      // при желании можно очистить старый ключ:
      // localStorage.removeItem(guestKey);
    }
    localStorage.setItem(FLAG, '1');
  } catch {}
}

/* Кошелёк (для «дозревания» при старте) */
function readWallet(){
  try{
    const w = JSON.parse(localStorage.getItem(k('points_wallet')) || '{}');
    return {
      available: Math.max(0, Number(w.available||0)|0),
      pending: Array.isArray(w.pending) ? w.pending : [],
      history: Array.isArray(w.history) ? w.history : [],
    };
  }catch{ return { available:0, pending:[], history:[] }; }
}
function writeWallet(w){ localStorage.setItem(k('points_wallet'), JSON.stringify(w||{available:0,pending:[],history:[]})); }
function settleMatured(){
  const w = readWallet();
  const now = Date.now();
  let changed=false;
  const keep=[];
  for (const p of w.pending){
    if ((p.tsUnlock||0)<=now){
      w.available += Math.max(0, Number(p.pts)||0);
      w.history.unshift({ ts: now, type:'accrue', pts: p.pts|0, reason: p.reason||'Кэшбек', orderId: p.orderId||null });
      changed=true;
    }else keep.push(p);
  }
  if (changed){ w.pending=keep; writeWallet(w); }
}

/* ===== ЕДИНЫЙ ФОРМАТ ОТОБРАЖАЕМОГО НОМЕРА ЗАКАЗА ===== */
function makeDisplayOrderIdFromParts(orderId, shortId) {
  const s = String(shortId || '').trim();
  if (s) return s.toUpperCase();
  const full = String(orderId || '').trim();
  return full ? full.slice(-6).toUpperCase() : '';
}
function makeDisplayOrderId(order) {
  return makeDisplayOrderIdFromParts(order?.id, order?.shortId);
}

/* ===== «богатые» уведомления через Netlify Function ===== */
const NOTIF_API = '/.netlify/functions/notifs';
const USER_JOIN_API = '/.netlify/functions/user-join';

function getTgInitDataRaw(){
  try {
    return typeof window?.Telegram?.WebApp?.initData === 'string'
      ? window.Telegram.WebApp.initData
      : '';
  } catch { return ''; }
}

async function notifApiList(uid){
  const url = `${NOTIF_API}?op=list&uid=${encodeURIComponent(uid)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'X-Tg-Init-Data': getTgInitDataRaw() }});
  const data = await res.json().catch(()=>({}));
  if (!res.ok || data?.ok === false) throw new Error('notif list error');
  return Array.isArray(data.items) ? data.items : [];
}
async function notifApiAdd(uid, notif){
  const res = await fetch(NOTIF_API, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'X-Tg-Init-Data': getTgInitDataRaw() },
    body: JSON.stringify({ op:'add', uid:String(uid), notif })
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok || data?.ok === false) throw new Error('notif add error');
  return data.id || notif.id || Date.now();
}
/* === ПРАВКА ЗДЕСЬ (осталась без изменений в этом файле) === */
async function notifApiMarkAll(uid){
  const initData = getTgInitDataRaw();
  const hasInit  = !!(initData && initData.length);

  const headers = { 'Content-Type':'application/json' };
  if (hasInit) headers['X-Tg-Init-Data'] = initData;

  // пробуем по очереди: markmine → markseen → markAll
  const attempts = hasInit
    ? [
        { op:'markmine' },   // ← без uid при initData
        { op:'markseen' },
      ]
    : [
        { op:'markAll', uid:String(uid) },
      ];

  for (const body of attempts){
    const res = await fetch(NOTIF_API, {
      method:'POST',
      headers,
      body: JSON.stringify(body)
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.ok && data?.ok !== false){
      return Array.isArray(data.items) ? data.items : null;
    }
  }

  throw new Error('notif mark error');
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

/* ---- Онбординг-уведомления для новых юзеров (один раз на UID) ---- */
async function ensureOnboardingNotifsOnce(){
  const uid = getUID?.();
  if (!uid) return;

  const FLAG = `onb_seeded__${uid}`;
  if (localStorage.getItem(FLAG) === '1') return;

  if ((getNotifications()?.length || 0) > 0) {
    localStorage.setItem(FLAG, '1');
    return;
  }

  const now = Date.now();
  const items = [
    {
      id: `welcome-${now}`,
      icon: 'sparkles',
      title: 'Добро пожаловать в EVLISE',
      sub: 'Сохраняйте понравившееся в избранное и оформляйте в 2 клика.',
      ts: now,
      read: false
    },
    {
      id: `feat-tracking-${now}`,
      icon: 'package',
      title: 'Отслеживание заказов',
      sub: 'Этапы: подтверждение, сборка, доставка — всё в одном месте.',
      ts: now + 1000,
      read: false
    },
    {
      id: `feat-cashback-${now}`,
      icon: 'wallet',
      title: 'Кэшбек баллами',
      sub: 'Оплачивайте часть следующих заказов накопленными баллами.',
      ts: now + 2000,
      read: false
    }
  ];

  try {
    await Promise.all(items.map(n => serverPushFor(uid, n)));
  } finally {
    localStorage.setItem(FLAG, '1');
  }
}

/* ---------- ранняя фиксация UID ---------- */
(function initUserIdentityEarly(){
  const tg = window.Telegram?.WebApp;

  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    state.user = u;
    try{ localStorage.setItem('nas_uid', String(u.id)); }catch{}
    return;
  }

  try{
    const stored = localStorage.getItem('nas_uid');
    if (!stored) localStorage.setItem('nas_uid', 'guest');
  }catch{
    // ignore
  }
})();

/* ВАЖНО: однократно перенесём кошелёк guest -> <uid> до любых чтений */
migrateGuestWalletOnce();

/* ---------- персональные данные ---------- */
loadCart();
loadAddresses();
loadProfile();
loadFavorites();
updateCartBadge();
initTelegramChrome();
// Кнопка "Наверх" — инициализация
mountScrollTop();
// Глобальный анти-скролл — включает manual + хэндлер pageshow
ScrollReset.mount();

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

    if (sp) {
      try {
        fetch('/.netlify/functions/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'miniapp_open',
            startapp: sp,
            uid: u?.id || null,
          })
        }).catch(()=>{});
      } catch {}
    }

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
// Обновлённая функция: можно вызвать с числом для принудительной установки.
function updateNotifBadge(explicitCount){
  const b = document.getElementById('notifBadge');
  if (!b) return;
  const unread = (typeof explicitCount === 'number')
    ? Math.max(0, explicitCount|0)
    : getNotifications().reduce((a,n)=> a + (!n.read ? 1 : 0), 0);
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

// Слушаем событие от Notifications.js для моментального обнуления
window.addEventListener('notifs:unread', (e)=>{
  const n = Number(e?.detail ?? 0) || 0;
  updateNotifBadge(n);
});

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#openNotifications');
  if (!btn) return;
  location.hash = '#/notifications';
});

/* ---------- фикс-хедер товара: скрытие вне карточки ---------- */
function hideProductHeader(){
  // делегируем логику компоненту фикс-хедера
  try { deactivateProductFixHeader(); } catch {}
  // и возвращаем видимость статичного хедера
  const stat = document.querySelector('.app-header');
  if (stat) stat.classList.remove('hidden');
}

function scrollTopNow(){
  ScrollReset.request();
}

/* ====== ОТЛОЖЕННОЕ ВОССТАНОВЛЕНИЕ СКРОЛЛА ГЛАВНОЙ ====== */
let __NEED_HOME_SCROLL_RESTORE__ = false;

/* ---------- РОУТЕР ---------- */
async function router(){
  const path = (location.hash || '#/').slice(1);
  const clean = path.replace(/#.*/,'');
  const inAdmin = document.body.classList.contains('admin-mode');

  const parts = path.split('/').filter(Boolean);
  const map = {
    '':'home','/':'home','/favorites':'saved','/cart':'cart','/account':'account','/orders':'account',
    '/admin':'admin'
  };

  const match = (pattern) => {
    const p = pattern.split('/').filter(Boolean); if (p.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < p.length; i++) {
      if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (p[i] !== parts[i]) return null;
    }
    return params;
  };

  setTabbarMenu(map[clean] || (inAdmin ? 'admin' : 'home'));
  hideProductHeader();

  // 🔧 Новая логика (обновлено): при переходе НА главную — только помечаем восстановление ПОСЛЕ её рендера;
  // при уходе С главной — сохраняем текущую позицию и сбрасываем скролл для новых экранов.
const goingHome = (parts.length === 0);
const viaProduct = (sessionStorage.getItem('home:from_product') === '1');

if (goingHome) {
  __NEED_HOME_SCROLL_RESTORE__ = true;
  try {
    window.__HOME_WILL_RESTORE__ = true;
    // если именно «возврат из товара», подушку делаем подольше
    const ms = viaProduct ? 1500 : 900;
    if ((sessionStorage.getItem('home:scrollY')|0) > 0) {
      ScrollReset.quiet(ms);
      ScrollReset.suppress(ms);
    }
  } catch {}
} else {
  HomeScrollMemory.saveIfHome();
}




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

if (parts.length===0) {
  const res = renderHome(router);
  if (__NEED_HOME_SCROLL_RESTORE__) {
    __NEED_HOME_SCROLL_RESTORE__ = false;
    try { await HomeScrollMemory.restoreIfHome(); } catch {}
  } else {
    try { ScrollReset.request(document.getElementById('view')); } catch {}
  }
  // ⬇️ снимаем флаги и маркеры
  try { 
    window.__HOME_WILL_RESTORE__ = false; 
    sessionStorage.removeItem('home:from_product'); 
  } catch {}
  return res;
}


  const m1=match('category/:slug'); if (m1) return renderCategory(m1);
  const m2=match('product/:id');   if (m2) return renderProduct(m2);
  const m3=match('track/:id');     if (m3) return renderTrack(m3);

  if (match('favorites'))          return renderFavorites();
  if (match('cart'))               return renderCart();
  if (match('orders'))             return renderOrders();

  if (match('account'))            return renderAccount();
  if (match('account/addresses'))  return renderAddresses();
  if (match('account/settings'))   return renderSettings();
  if (match('account/cashback'))   return renderCashback();
  if (match('account/referrals'))  return renderReferrals();

  if (match('notifications')){
    await renderNotifications(updateNotifBadge); // внутри: markAll + updateUnreadBadge(0)
    await syncMyNotifications();                 // обновим локальный список (на будущее)
    return;
  }

  // Новый мостик: #/ref[?ref=...|&start=ref_<uid>]
  if (match('ref')){
    renderRefBridge();
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

  {
    const res = renderHome(router);
    if (__NEED_HOME_SCROLL_RESTORE__) {
      __NEED_HOME_SCROLL_RESTORE__ = false;
      try { await HomeScrollMemory.restoreIfHome(); } catch {}
    }
    try { window.__HOME_WILL_RESTORE__ = false;  sessionStorage.removeItem('home:from_product');  } catch {}
    return res;
  }

}

/* ===== серверная синхронизация снапшота корзины/избранного ===== */
function collectSnapshot(){
  const uid = getUID?.() || 'guest';
  const chatId = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tashkent';

  const cart = Array.isArray(state.cart?.items) ? state.cart.items.map(it=>{
    const p = state.products.find(x => String(x.id)===String(it.productId)) || {};
    return {
      id: it.productId,
      qty: Number(it.qty||1),
      title: p.title || it.title || 'товар',
      price: Number(p.price || it.price || 0),
    };
  }) : [];

  const favorites = (state.favorites instanceof Set)
    ? Array.from(state.favorites)
    : (Array.isArray(state.favorites) ? state.favorites.slice() : []);

  return { uid, chatId, tz, cart, favorites };
}

async function sendSnapshot(){
  try{
    const snap = collectSnapshot();
    if (!snap.uid || !snap.chatId) return; // только Telegram-пользователи
    await fetch('/.netlify/functions/user-sync', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(snap),
    });
  }catch{}
}

function startUserSnapshotSync(){
  // первый пуш при старте
  sendSnapshot();

  // Пуш при событиях
  window.addEventListener('cart:updated', sendSnapshot);
  window.addEventListener('favorites:updated', sendSnapshot);

  // Страховка: раз в 10 минут
  setInterval(sendSnapshot, 10*60*1000);
}

/* ---------- ИНИЦИАЛИЗАЦИЯ ---------- */
async function init(){
  // 0) Сразу захватываем возможного инвайтера из контекста (MiniApp/Web)
  captureInviterFromContext();

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

  // кэшбек: «дозреть» pending → available при старте
  settleMatured();

  await router();

  // ⬇️ Память скролла главной — после первого рендера UI
  HomeScrollMemory.mount();

  // 1) После старта UI — пробуем привязать pending-инвайтера (когда уже есть наш UID)
  await tryBindPendingInviter();

  window.addEventListener('hashchange', router);

  // Хард-сброс скролла только для НЕ-home (home восстанавливает HomeScrollMemory)
  window.addEventListener('hashchange', () => {
    setTimeout(() => {
      const raw = (location.hash || '#/').slice(1);
      const parts = raw.split('/').filter(Boolean);
      if (parts.length === 0) return; // главная — не трогаем
      ScrollReset.request();
    }, 0);
  });

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
    // 2) Если авторизация произошла после старта — повторим попытку бинда
    tryBindPendingInviter();
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

  // === УВЕДОМЛЕНИЯ (клиент): только локальный пуш и серверный notifs через orders-функции ===
  window.addEventListener('client:orderPlaced', async (e)=>{
    try{
      const id = e.detail?.id;

      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);

      const notif = {
        id: `order-placed-${id}`,
        ts: Date.now(),
        icon: 'package',
        title: 'Заказ оформлен',
        sub: dispId ? `#${dispId} — ожидает подтверждения` : 'Ожидает подтверждения',
        read: false
      };

      pushNotification(notif);
      updateNotifBadge?.();

      await serverPushFor(getUID(), notif);

      window.dispatchEvent(new CustomEvent('orders:updated'));
    }catch{}
  });

  window.addEventListener('admin:orderAccepted', async (e)=>{
    try{
      const { id, userId } = e.detail || {};
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);

      const notif = {
        icon: 'shield-check',
        title: 'Заказ принят администратором',
        sub: dispId ? `#${dispId}` : '',
      };

      await serverPushFor(userId, notif);
      instantLocalIfSelf(userId, notif);
    }catch{}
  });

  window.addEventListener('admin:statusChanged', async (e)=>{
    try{
      const { id, status, userId } = e.detail || {};
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);

      const notif = {
        icon: 'refresh-ccw',
        title: 'Статус заказа обновлён',
        sub: dispId ? `#${dispId}: ${getStatusLabel(status)}` : getStatusLabel(status),
      };

      await serverPushFor(userId, notif);
      instantLocalIfSelf(userId, notif);
    }catch{}
  });

  window.addEventListener('admin:orderCanceled', async (e)=>{
    try{
      const { id, reason, userId } = e.detail || {};
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);
      const subSuffix = reason ? ` — ${reason}` : '';

      const notif = {
        icon: 'x-circle',
        title: 'Заказ отменён',
        sub: dispId ? `#${dispId}${subSuffix}` : (reason || ''),
      };

      await serverPushFor(userId, notif);
      instantLocalIfSelf(userId, notif);
    }catch{}
  });

  window.lucide && lucide.createIcons?.();

  // онбординг-уведомления только для новых пользователей
  await ensureOnboardingNotifsOnce();

  // подтянуть (в т.ч. только что добавленные) и обновить бейдж
  await syncMyNotifications();
  updateNotifBadge();

  // синк уведомлений по интервалу + дозревание кешбэка
  const NOTIF_POLL_MS = 30000;
  setInterval(()=>{ syncMyNotifications(); settleMatured(); }, NOTIF_POLL_MS);

  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden){ syncMyNotifications(); settleMatured(); } });

  // === ВМЕСТО scheduleMarketingBotPings(): серверная синхронизация снапшота ===
  startUserSnapshotSync();

  // === Лёгкий поллер заказов, чтобы статусы «оживали» даже без событий ===
  setInterval(async () => {
    try { await getOrders(); /* saveOrders внутри дернётся, события улетят */ } catch {}
  }, 45000);
}
init();

/* ---------- ФИЛЬТРЫ ---------- */
document.getElementById('openFilters')?.addEventListener('click', ()=> openFilterModal(router));

export { updateNotifBadge, getNotifications, setNotifications, setTabbarMenu, setTabbarCTA, setTabbarCTAs };

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
    localStorage.setItem(FLAG, '1');
    await r.json().catch(()=> ({}));
  }catch{
    // ignore
  }
}

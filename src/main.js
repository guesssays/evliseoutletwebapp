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
import { fetchMyLoyalty, getLocalLoyalty } from './core/loyalty.js';

// --- Унифицированные тосты ---
function toastEx(msg, type = 'info') {
  try {
    if (toast && typeof toast === 'object') {
      const map = {
        success: toast.ok || toast.success,
        error: toast.err || toast.error,
        warning: toast.warn || toast.warning,
        info: toast.info
      };
      const fn = map[type];
      if (typeof fn === 'function') return fn.call(toast, msg);
      if (typeof toast.show === 'function') return toast.show({ title: msg, type });
    }
    if (typeof toast === 'function') {
      try { return toast(msg, { type }); } catch { return toast(msg); }
    }
  } catch {}
}
const tOk   = (m) => toastEx(m, 'success');
const tErr  = (m) => toastEx(m, 'error');
const tWarn = (m) => toastEx(m, 'warning');
const tInfo = (m) => toastEx(m, 'info');

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
import './core/navLoader.js';
import './ui/icons-patch.js';

// Вынесенный фикс-хедер товара
import { deactivateProductFixHeader } from './components/ProductFixHeader.js';

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

/* ===== Кэшбек/Рефералы: локальные утилиты дозревания ===== */
const POINTS_MATURITY_MS  = 24*60*60*1000;
function k(base){ try{ const uid = getUID?.() || 'guest'; return `${base}__${uid}`; }catch{ return `${base}__guest`; } }

/* ---------- ОДНОРАЗОВАЯ МИГРАЦИЯ КОШЕЛЬКА guest -> реальный UID ---------- */
function migrateGuestWalletOnce() {
  try {
    const realUid = getUID?.(); if (!realUid) return;
    const FLAG = `points_wallet_migrated__${realUid}`;
    if (localStorage.getItem(FLAG) === '1') return;

    const guestKey = `points_wallet__guest`;
    const realKey  = `points_wallet__${realUid}`;

    const guestRaw = localStorage.getItem(guestKey);
    const realRaw  = localStorage.getItem(realKey);

    if (guestRaw && !realRaw) { localStorage.setItem(realKey, guestRaw); }
    localStorage.setItem(FLAG, '1');
  } catch {}
}

/* Кошелёк */
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

/* -------- НОВОЕ: Unseen-флаги и «красные точки» -------- */
const kinds = {
  orders:    'unseen_orders',
  cashback:  'unseen_cashback',
  referrals: 'unseen_referrals',
};
function classifyNotif(n){
  const icon  = String(n.icon||'').toLowerCase();
  const title = String(n.title||'').toLowerCase();
  const sub   = String(n.sub||'').toLowerCase();

  if (
    icon.includes('package') || icon.includes('truck') || icon.includes('refresh') ||
    icon.includes('shield')  || icon.includes('x-circle') ||
    title.includes('заказ')  || sub.includes('заказ')
  ){
    return kinds.orders;
  }
  if (
    icon.includes('coin') || icon.includes('wallet') || icon.includes('gift') ||
    icon.includes('check') ||
    title.includes('кэшбек') || title.includes('балл') ||
    sub.includes('кэшбек')   || sub.includes('балл')
  ){
    return kinds.cashback;
  }
  if (icon.includes('users') || title.includes('реферал') || sub.includes('реферал')){
    return kinds.referrals;
  }
  return null;
}

function flagKey(){ return k('unseen_flags'); }
function readFlags(){
  try { return JSON.parse(localStorage.getItem(flagKey())||'{}')||{}; } catch { return {}; }
}
function writeFlags(map){ try{ localStorage.setItem(flagKey(), JSON.stringify(map||{})); }catch{} }
function getUnseen(kind){ return !!readFlags()[kind]; }
function setUnseen(kind, on){
  const map = readFlags();
  if (on){ map[kind]=true; } else { delete map[kind]; }
  writeFlags(map);
  try{ window.dispatchEvent(new CustomEvent('unseen:update', { detail: map })); }catch{}
  paintAccountDot();
  paintAccountButtonsDots();
}
function clearUnseen(kind){ setUnseen(kind, false); }
function anyUnseen(){ const m=readFlags(); return !!(m[kinds.orders]||m[kinds.cashback]||m[kinds.referrals]); }

function ensureDot(node, cls=''){
  if (!node) return null;
  let d = node.querySelector(':scope > .dot');
  if (!d){
    d = document.createElement('b');
    d.className = 'dot' + (cls?(' '+cls):'');
    node.appendChild(d);
  }
  return d;
}
function removeDot(node){
  if (!node) return;
  node.querySelectorAll(':scope > .dot').forEach(n => n.remove());
}

function paintAccountDot(){
  const tab = document.querySelector('.tabbar .tab[data-tab="account"]');
  if (!tab) return;
  if (anyUnseen()) ensureDot(tab);
  else removeDot(tab);
}
function paintAccountButtonsDots(){
  const v = document.getElementById('view'); if (!v) return;
  const sel = [
    { q:'a[href="#/orders"]',               kind:kinds.orders },
    { q:'a[href="#/account/cashback"]',    kind:kinds.cashback },
    { q:'a[href="#/account/referrals"]',   kind:kinds.referrals },
  ];
  for (const {q,kind} of sel){
    const a = v.querySelector(q);
    if (!a) continue;
    a.style.position = a.style.position || 'relative';
    if (getUnseen(kind)) ensureDot(a, 'acc-dot');
    else removeDot(a);
  }
}
function paintAccountDotsSafe(){ try{ paintAccountButtonsDots(); }catch{} }

/* -------- Отрисовочные помощники для заказов/уведомлений -------- */
function makeDisplayOrderIdFromParts(orderId, shortId) {
  const s = String(shortId || '').trim();
  if (s) return s.toUpperCase();
  const full = String(orderId || '').trim();
  return full ? full.slice(-6).toUpperCase() : '';
}
function makeDisplayOrderId(order) {
  return makeDisplayOrderIdFromParts(order?.id, order?.shortId);
}

const NOTIF_API = '/.netlify/functions/notifs';
const USER_JOIN_API = '/.netlify/functions/user-join';

function getTgInitDataRaw(){
  try {
    return typeof window?.Telegram?.WebApp?.initData === 'string'
      ? window.Telegram.WebApp.initData
      : '';
  } catch { return ''; }
}

/* ---- Первичная инициализация unseen-флагов по данным сервера ---- */
async function primeUnseenFromServer(){
  try {
    // 1) Подтянем баланс/историю (сервер → локальный кеш)
    await fetchMyLoyalty();
  } catch {}
  const b = (function(){ try { return getLocalLoyalty(); } catch { return {}; } })();
  const avail = Number(b?.available || 0);
  const pend  = Number(b?.pending   || 0);

  // 2) Заказы уже в state.orders после getOrders()
  const hasOrders = Array.isArray(state.orders) && state.orders.length > 0;

  // 3) Ставим флаги (не трогаем, если пользователь уже был в соответствующих разделах и вы их там очищаете)
  try {
    if (hasOrders) setUnseen(kinds.orders, true);
    if (avail > 0 || pend > 0) setUnseen(kinds.cashback, true);
    // Рефералы по желанию: если у вас есть локальный список/счётчик — можно аналогично подсветить kinds.referrals
  } catch {}

  // 4) Перерисуем точки
  try { paintAccountDot(); paintAccountButtonsDots(); } catch {}
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
async function notifApiMarkAll(uid){
  const initData = getTgInitDataRaw();
  const hasInit  = !!(initData && initData.length);

  const headers = { 'Content-Type':'application/json' };
  if (hasInit) headers['X-Tg-Init-Data'] = initData;

  const attempts = hasInit
    ? [{ op:'markmine' }, { op:'markseen' }]
    : [{ op:'markAll', uid:String(uid) }];

  for (const body of attempts){
    const res = await fetch(NOTIF_API, { method:'POST', headers, body: JSON.stringify(body) });
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

  for (const s of (serverItems||[])){
    const sid = String(s.id);
    const prev = byId.get(sid);
    const nextRead = prev?.read ? true : !!s.read;

    if (!prev){
      byId.set(sid, {
        id: sid,
        ts: s.ts || Date.now(),
        read: nextRead,
        icon: s.icon || 'bell',
        title: String(s.title || ''),
        sub: String(s.sub || ''),
      });
      changed = true;
    } else {
      const next = { ...prev, ...s, read: nextRead, id: sid, ts: s.ts || prev.ts || Date.now() };
      if (JSON.stringify(next) !== JSON.stringify(prev)){
        byId.set(sid, next);
        changed = true;
      }
    }
  }

  if (changed){
    setNotifications(
      [...byId.values()].sort((a,b) => (b.ts||0) - (a.ts||0))
    );
  }

  // Поднять unseen-флаги по непрочитанным
  try{
    const all = [...byId.values()];
    let seenOrders=false, seenCashback=false, seenRefs=false;
    for (const n of all){
      if (n.read) continue;
      const k = classifyNotif(n);
      if (k === kinds.orders)    seenOrders = true;
      if (k === kinds.cashback)  seenCashback = true;
      if (k === kinds.referrals) seenRefs = true;
    }
    if (seenOrders)   setUnseen(kinds.orders, true);
    if (seenCashback) setUnseen(kinds.cashback, true);
    if (seenRefs)     setUnseen(kinds.referrals, true);

    paintAccountDot();
    paintAccountButtonsDots();
  } catch {}
}


async function serverPushFor(uid, notif){
  const safe = {
    id:   notif.id || Date.now(),
    ts:   notif.ts || Date.now(),
    read: !!notif.read,
    icon: notif.icon || 'bell',
    title: String(notif.title || ''),
    sub:   String(notif.sub   || '')
  };

  try {
    await notifApiAdd(uid, safe);
  } catch {
    // оффлайн/ошибка: локальный пуш только для текущего пользователя
    if (String(uid) === String(getUID?.())){
      const cache = getNotifications();
      cache.push(safe);
      setNotifications(cache);
    }
  }

  // Поднять соответствующий флаг для текущего пользователя
  try{
    const kind = classifyNotif(safe);
    if (String(uid) === String(getUID?.()) && kind) setUnseen(kind, true);
  } catch {}
}

async function syncMyNotifications(){
  const uid = getUID(); if (!uid) return;
  try{
    const items = await notifApiList(uid);
    mergeNotifsToLocal(items);
    updateCartBadge?.();
    updateNotifBadge?.();
    paintAccountDot();
    paintAccountButtonsDots();
  } catch {}
}


/* ---- Онбординг-уведомления для новых юзеров (один раз на UID) ---- */
async function ensureOnboardingNotifsOnce(){
  const uid = getUID?.(); if (!uid) return;
  const FLAG = `onb_seeded__${uid}`; if (localStorage.getItem(FLAG) === '1') return;
  if ((getNotifications()?.length || 0) > 0) { localStorage.setItem(FLAG, '1'); return; }

  const now = Date.now();
  const items = [
    { id:`welcome-${now}`,        icon:'sparkles',   title:'Добро пожаловать в EVLISE',        sub:'Сохраняйте понравившееся в избранное и оформляйте в 2 клика.', ts:now,        read:false },
    { id:`feat-tracking-${now}`,  icon:'package',    title:'Отслеживание заказов',             sub:'Этапы: подтверждение, сборка, доставка — всё в одном месте.', ts:now+1000,   read:false },
    { id:`feat-cashback-${now}`,  icon:'wallet',     title:'Кэшбек баллами',                   sub:'Оплачивайте часть следующих заказов накопленными баллами.',  ts:now+2000,   read:false },
  ];
  try { await Promise.all(items.map(n => serverPushFor(uid, n))); }
  finally { localStorage.setItem(FLAG, '1'); }
}

/* ---------- ранняя фиксация UID ---------- */
(function initUserIdentityEarly(){
  const tg = window.Telegram?.WebApp;
  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user; state.user = u;
    try{ localStorage.setItem('nas_uid', String(u.id)); }catch{}
    return;
  }
  try{ if (!localStorage.getItem('nas_uid')) localStorage.setItem('nas_uid', 'guest'); }catch{}
})();

/* ВАЖНО: миграция кошелька — до любых чтений */
migrateGuestWalletOnce();

/* ---------- персональные данные ---------- */
loadCart(); loadAddresses(); loadProfile(); loadFavorites();
updateCartBadge(); initTelegramChrome();
try {
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.ready?.(); tg.expand?.(); }
} catch {}

requestAnimationFrame(() => {
  const hdr = document.querySelector('.app-header');
  if (hdr) {
    hdr.classList.remove('hidden');
    // eslint-disable-next-line no-unused-expressions
    hdr.offsetHeight;
  }
});

/* Кнопка "Наверх" */
mountScrollTop();
/* Глобальный анти-скролл */
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
  mb.innerHTML = `<div style="font-size:15px;line-height:1.35">Вы покидаете пользовательский интерфейс и переходите в режим администратора. Продолжить?</div>`;
  ma.innerHTML = `<button id="admCancel" class="pill">Отмена</button><button id="admOk" class="pill primary">Подтвердить</button>`;
  modal.classList.add('show');
  document.getElementById('modalClose').onclick = close;
  document.getElementById('admCancel').onclick = ()=>{ close(); onCancel && onCancel(); };
  document.getElementById('admOk').onclick = ()=>{ close(); onConfirm && onConfirm(); };
  function close(){ modal.classList.remove('show'); }
}

/* ---------- таббар-хелперы ---------- */
function mountIcons(){ window.lucide?.createIcons && lucide.createIcons(); }
function killExternalCTA(){ document.querySelectorAll('.cta, .paybtn').forEach(n => n.remove()); document.body.classList.remove('has-cta'); }
function setTabbarMenu(activeKey = 'home'){
  const inner = document.querySelector('.tabbar .tabbar-inner'); if (!inner) return;
  killExternalCTA(); inner.classList.remove('is-cta');

  const inAdmin = document.body.classList.contains('admin-mode');
  if (inAdmin){
    inner.innerHTML = `
      <a href="#/admin" data-tab="admin" class="tab ${activeKey==='admin'?'active':''}" role="tab" aria-selected="${String(activeKey==='admin')}">
        <i data-lucide="shield-check"></i><span>Админка</span>
      </a>
      <a href="#/account" id="leaveAdmin" data-tab="leave" class="tab" role="tab" aria-selected="false">
        <i data-lucide="log-out"></i><span>Выйти</span>
      </a>`;
    mountIcons();
    document.getElementById('leaveAdmin')?.addEventListener('click', (e)=>{
      e.preventDefault(); setAdminMode(false); location.hash = '#/account';
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
    ${adminTab}`;
  mountIcons();

  document.getElementById('openAdminTab')?.addEventListener('click', (e)=>{
    e.preventDefault();
    confirmAdminSwitch(()=>{ setAdminMode(true); location.hash = '#/admin'; });
  });

  updateCartBadge();
  // НОВОЕ: перерисовать точку аккаунта после перестройки таббара
  paintAccountDot();
}
function setTabbarCTA(arg){
  const inner = document.querySelector('.tabbar .tabbar-inner'); if (!inner) return;
  killExternalCTA(); document.body.classList.add('has-cta');

  let id='ctaBtn', html='', onClick=null;
  if (typeof arg==='string'){ html = arg; } else { ({id='ctaBtn', html='', onClick=null} = arg||{}); }

  inner.classList.add('is-cta');
  inner.innerHTML = `<button id="${id}" class="btn" style="flex:1">${html}</button>`;
  mountIcons(); if (onClick) document.getElementById(id).onclick = onClick;
}
function setTabbarCTAs(left = { id:'ctaLeft', html:'', onClick:null }, right = { id:'ctaRight', html:'', onClick:null }){
  const inner = document.querySelector('.tabbar .tabbar-inner'); if (!inner) return;
  killExternalCTA(); document.body.classList.add('has-cta');
  inner.classList.add('is-cta');
  inner.innerHTML = `
    <button id="${left.id||'ctaLeft'}" class="btn outline" style="flex:1">${left.html||''}</button>
    <button id="${right.id||'ctaRight'}" class="btn" style="flex:1">${right.html||''}</button>`;
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
    const u = tg.initDataUnsafe.user; if (u) state.user = u;

    const sp = String(tg.initDataUnsafe.start_param || '').trim().toLowerCase();
    if (sp) {
      try { fetch('/.netlify/functions/track', { method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ type:'miniapp_open', startapp: sp, uid: u?.id || null }) }).catch(()=>{}); } catch {}
    }
    tryUnlockFromStartParam();
    if (sp === 'admin' || sp === 'admin-login'){ try{ sessionStorage.setItem('nas_start_route', `#/${sp}`); }catch{} }
  }
})();

/* ---------- Поиск ---------- */
el('#searchInput')?.addEventListener('input', (e)=>{ state.filters.query = e.target.value; renderHome(router); });

/* ---------- Уведомления (per-user) ---------- */
function updateNotifBadge(explicitCount){
  const b = document.getElementById('notifBadge'); if (!b) return;
  const unread = (typeof explicitCount === 'number') ? Math.max(0, explicitCount|0)
    : getNotifications().reduce((a,n)=> a + (!n.read ? 1 : 0), 0);
  if (unread>0){ b.textContent = String(unread); b.hidden = false; b.setAttribute('aria-hidden','false'); }
  else { b.textContent = ''; b.hidden = true; b.setAttribute('aria-hidden','true'); }
}
window.updateNotifBadge = updateNotifBadge;

window.addEventListener('notifs:unread', (e)=>{ updateNotifBadge(Number(e?.detail ?? 0) || 0); });
document.addEventListener('click', (e)=>{ if (e.target.closest('#openNotifications')) location.hash = '#/notifications'; });

/* ---------- фикс-хедер товара: скрытие вне карточки ---------- */
function hideProductHeader(){
  try { deactivateProductFixHeader(); } catch {}
  const stat = document.querySelector('.app-header'); if (stat) stat.classList.remove('hidden');
}

/* ---------- РОУТЕР ---------- */
async function router(){
  const path = (location.hash || '#/').slice(1);
  const clean = path.replace(/#.*/,'');

  const parts = path.split('/').filter(Boolean);
  const map = { '':'home','/':'home','/favorites':'saved','/cart':'cart','/account':'account','/orders':'account','/admin':'admin' };

  setTabbarMenu(map[clean] || 'home');
  hideProductHeader();

  try { ScrollReset.forceNow(); } catch {}

  const inAdmin = document.body.classList.contains('admin-mode');

  if (inAdmin){
    if (parts.length===0 || parts[0] !== 'admin'){ location.hash = '#/admin'; return renderAdmin(); }
    if (!canAccessAdmin()){ setAdminMode(false); tWarn('Доступ в админ-панель ограничен'); location.hash = '#/admin-login'; return; }
    return renderAdmin();
  }

  if (parts.length===0) {
    const res = renderHome(router);
    try { ScrollReset.request(document.getElementById('view')); } catch {}
    return res;
  }

  const match = (pattern) => {
    const p = pattern.split('/').filter(Boolean); if (p.length !== parts.length) return null;
    const params = {}; for (let i=0;i<p.length;i++){ if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i]); else if (p[i] !== parts[i]) return null; }
    return params;
  };

  const m1=match('category/:slug'); if (m1){ return renderCategory(m1); }
  const m2=match('product/:id');   if (m2){ return renderProduct(m2); }
  const m3=match('track/:id');     if (m3){ return renderTrack(m3); }

  if (match('favorites'))          { return renderFavorites(); }
  if (match('cart'))               { return renderCart(); }
  if (match('orders'))             {
    clearUnseen(kinds.orders);
    paintAccountDot(); paintAccountDotsSafe();
    return renderOrders();
  }

  if (match('account'))            {
    const res = renderAccount(); 
    paintAccountDotsSafe();
    return res;
  }
  if (match('account/addresses'))  { const r = renderAddresses(); paintAccountDotsSafe(); return r; }
  if (match('account/settings'))   { const r = renderSettings();  paintAccountDotsSafe(); return r; }
  if (match('account/cashback'))   {
    clearUnseen(kinds.cashback);
    paintAccountDot(); paintAccountDotsSafe();
    const r = renderCashback(); return r;
  }
  if (match('account/referrals'))  {
    clearUnseen(kinds.referrals);
    paintAccountDot(); paintAccountDotsSafe();
    const r = renderReferrals(); return r;
  }

  if (match('notifications')){
    await renderNotifications(updateNotifBadge);
    try { localStorage.setItem(k('notifs_unread'),'0'); } catch {}
    try { window.dispatchEvent(new CustomEvent('notifs:unread', { detail: 0 })); } catch {}
    await syncMyNotifications();
    return;
  }

  if (match('ref')){ return renderRefBridge(); }

  if (match('admin')){
    if (!canAccessAdmin()){
      tWarn('Доступ в админ-панель ограничен'); location.hash = '#/admin-login'; return;
    }
    confirmAdminSwitch(()=>{ setAdminMode(true); location.hash = '#/admin'; }, ()=>{ location.hash = '#/account'; });
    return;
  }

  if (match('faq')) { return renderFAQ(); }

  { const res = renderHome(router); try { ScrollReset.forceNow(); } catch {} return res; }
}

/* ===== серверная синхронизация снапшота корзины/избранного ===== */
function collectSnapshot(){
  const uid = getUID?.() || 'guest';
  const chatId = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tashkent';

  const cart = Array.isArray(state.cart?.items) ? state.cart.items.map(it=>{
    const p = state.products.find(x => String(x.id)===String(it.productId)) || {};
    return { id: it.productId, qty: Number(it.qty||1), title: p.title || it.title || 'товар', price: Number(p.price || it.price || 0) };
  }) : [];

  const favorites = (state.favorites instanceof Set) ? Array.from(state.favorites)
                  : (Array.isArray(state.favorites) ? state.favorites.slice() : []);

  return { uid, chatId, tz, cart, favorites };
}
async function sendSnapshot(){
  try{
    const snap = collectSnapshot();
    if (!snap.uid || !snap.chatId) return;
    await fetch('/.netlify/functions/user-sync', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(snap) });
  }catch{}
}
function startUserSnapshotSync(){
  sendSnapshot();
  window.addEventListener('cart:updated', sendSnapshot);
  window.addEventListener('favorites:updated', sendSnapshot);
  setInterval(sendSnapshot, 10*60*1000);
}

/* ---------- ИНИЦИАЛИЗАЦИЯ ---------- */
async function init(){
  captureInviterFromContext();

  // загрузка каталога
  try{
    const res = await fetch('data/products.json');
    const data = await res.json();
    state.products   = Array.isArray(data?.products)   ? data.products   : [];
    state.categories = Array.isArray(data?.categories) ? data.categories.map(c=>({ ...c, name: c.name })) : [];
  }catch{ state.products = []; state.categories = []; }

  try{ state.orders = await getOrders(); }catch{ state.orders = []; }
await primeUnseenFromServer();


  pruneCartAgainstProducts(state.products);
  updateCartBadge();

  drawCategoriesChips(router);
  renderActiveFilterChips();

  // стартовый роут
  let startRoute = null;
  try{
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe){ tryUnlockFromStartParam(); }
    startRoute = sessionStorage.getItem('nas_start_route');
    sessionStorage.removeItem('nas_start_route');
  }catch{}
  if (startRoute){ location.hash = startRoute; }

  // одноразовый пинг о новом пользователе (только TG)
  await ensureUserJoinReported();

  // дозреть кешбэк
  settleMatured();

  await router();

  // После старта — попробовать привязать приглашение
  await tryBindPendingInviter();

  window.addEventListener('hashchange', ()=>{ router(); });

  window.addEventListener('orders:updated', ()=>{
    const inAdmin = document.body.classList.contains('admin-mode');
    const isAdminRoute = location.hash.replace('#','').startsWith('/admin');
    if (inAdmin && isAdminRoute){ try{ window.dispatchEvent(new CustomEvent('admin:refresh')); }catch{} }
    else { router(); }
  });

  window.addEventListener('force:rerender', router);

  window.addEventListener('auth:updated', ()=>{
    if (document.body.classList.contains('admin-mode') && !canAccessAdmin()){
      setAdminMode(false); location.hash = '#/admin-login';
    }
    router(); tryBindPendingInviter();
  });

  function buildOrderShortTitle(order) {
    const firstTitle = order?.cart?.[0]?.title || order?.cart?.[0]?.name || order?.title || 'товар';
    const extra = Math.max(0, (order?.cart?.length || 0) - 1);
    return extra > 0 ? `${firstTitle} + ещё ${extra}` : firstTitle;
  }

  function instantLocalIfSelf(targetUid, notif){
    if (String(targetUid) === String(getUID?.())) { pushNotification(notif); updateNotifBadge?.(); }
  }

  // === Уведомления вокруг заказов (+ unseen:orders) ===
  window.addEventListener('client:orderPlaced', async (e)=>{
    try{
      const id = e.detail?.id;
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);
      const notif = {
        id: `order-placed-${id}`, ts: Date.now(), icon:'package',
        title:'Заказ оформлен',
        sub: dispId ? `#${dispId} — ожидает подтверждения` : 'Ожидает подтверждения',
        read:false
      };
      pushNotification(notif); updateNotifBadge?.();
      setUnseen(kinds.orders, true); // НОВОЕ: точка «Заказы»
      await serverPushFor(getUID(), notif);
      window.dispatchEvent(new CustomEvent('orders:updated'));
    }catch{}
  });

  window.addEventListener('admin:orderAccepted', async (e)=>{
    try{
      const { id, userId } = e.detail || {};
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);
      const notif = { icon:'shield-check', title:'Заказ принят администратором', sub: dispId ? `#${dispId}` : '' };
      await serverPushFor(userId, notif); instantLocalIfSelf(userId, notif);
      if (String(userId) === String(getUID?.())) setUnseen(kinds.orders, true);
    }catch{}
  });

  window.addEventListener('admin:statusChanged', async (e)=>{
    try{
      const { id, status, userId } = e.detail || {};
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);
      const notif = { icon:'refresh-ccw', title:'Статус заказа обновлён', sub: dispId ? `#${dispId}: ${getStatusLabel(status)}` : getStatusLabel(status) };
      await serverPushFor(userId, notif); instantLocalIfSelf(userId, notif);
      if (String(userId) === String(getUID?.())) setUnseen(kinds.orders, true);
    }catch{}
  });

  window.addEventListener('admin:orderCanceled', async (e)=>{
    try{
      const { id, reason, userId } = e.detail || {};
      const order = (await getOrders() || []).find(o => String(o.id) === String(id));
      const dispId = makeDisplayOrderId(order);
      const subSuffix = reason ? ` — ${reason}` : '';
      const notif = { icon:'x-circle', title:'Заказ отменён', sub: dispId ? `#${dispId}${subSuffix}` : (reason || '') };
      await serverPushFor(userId, notif); instantLocalIfSelf(userId, notif);
      if (String(userId) === String(getUID?.())) setUnseen(kinds.orders, true);
    }catch{}
  });

  // === Локальные события лояльности/рефералок — триггеры точек ===
  window.addEventListener('loyalty:accrue',     ()=> setUnseen(kinds.cashback, true));
  window.addEventListener('loyalty:confirmed',  ()=> setUnseen(kinds.cashback, true));
  window.addEventListener('referrals:joined',   ()=> setUnseen(kinds.referrals, true));

  window.lucide && lucide.createIcons?.();

  // онбординг-уведомления только для новых пользователей
  await ensureOnboardingNotifsOnce();

  // подтянуть + обновить бейдж
  await syncMyNotifications(); updateNotifBadge();

  // синк уведомлений по интервалу + дозревание кешбэка
  const NOTIF_POLL_MS = 30000;
  setInterval(()=>{ syncMyNotifications(); settleMatured(); }, NOTIF_POLL_MS);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden){ syncMyNotifications(); settleMatured(); } });

  // серверная синхронизация снапшота
  startUserSnapshotSync();

  // лёгкий поллер заказов
  setInterval(async ()=>{ try { await getOrders(); } catch {} }, 45000);

  // первичная отрисовка «красной точки» в таббаре и в аккаунте, вдруг уже есть flags
  paintAccountDot(); paintAccountDotsSafe();
}
init();

/* ---------- ФИЛЬТРЫ ---------- */
document.getElementById('openFilters')?.addEventListener('click', ()=> openFilterModal(router));

export { updateNotifBadge, getNotifications, setNotifications, setTabbarMenu, setTabbarCTA, setTabbarCTAs };

/* ===== одноразовый пинг «новый пользователь» для Telegram ===== */
async function ensureUserJoinReported(){
  try{
    const tgUser = window?.Telegram?.WebApp?.initDataUnsafe?.user; if (!tgUser) return;
    const uid = String(tgUser.id);
    const FLAG = `user_join_sent__${uid}`; if (localStorage.getItem(FLAG) === '1') return;

    const payload = {
      uid,
      first_name: String(tgUser.first_name || '').trim(),
      last_name: String(tgUser.last_name || '').trim(),
      username: String(tgUser.username || '').trim(),
    };

    const r = await fetch('/.netlify/functions/user-join', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
    });
    localStorage.setItem(FLAG, '1');
    await r.json().catch(()=> ({}));
  }catch{}
}

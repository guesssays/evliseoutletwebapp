import { state, loadCart, updateCartBadge, loadAddresses } from './core/state.js';
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

loadCart(); loadAddresses(); updateCartBadge(); initTelegramChrome();

/* ---------- helpers для динамического таббара ---------- */
function mountIcons(){ window.lucide?.createIcons && lucide.createIcons(); }

function setTabbarMenu(activeKey = 'home'){
  const inner = document.querySelector('.tabbar .tabbar-inner');
  if (!inner) return;
  inner.innerHTML = `
    <a href="#/" data-tab="home" class="tab ${activeKey==='home'?'active':''}" role="tab" aria-selected="${activeKey==='home'}">
      <i data-lucide="home"></i><span>Главная</span>
    </a>
    <a href="#/favorites" data-tab="saved" class="tab ${activeKey==='saved'?'active':''}" role="tab" aria-selected="${activeKey==='saved'}">
      <i data-lucide="heart"></i><span>Избранное</span>
    </a>
    <a href="#/cart" data-tab="cart" class="tab badge-wrap ${activeKey==='cart'?'active':''}" role="tab" aria-selected="${activeKey==='cart'}">
      <i data-lucide="shopping-bag"></i><span>Корзина</span>
      <b id="cartBadge" class="badge">0</b>
    </a>
    <a href="#/account" data-tab="account" class="tab ${activeKey==='account'?'active':''}" role="tab" aria-selected="${activeKey==='account'}">
      <i data-lucide="user-round"></i><span>Аккаунт</span>
    </a>
  `;
  mountIcons();
  updateCartBadge(); // бэйдж перерисовали — обновим
}

function setTabbarCTA(html){
  const inner = document.querySelector('.tabbar .tabbar-inner');
  if (!inner) return;
  inner.innerHTML = `
    <button id="ctaBtn" class="btn" style="width:100%;">
      ${html}
    </button>
  `;
  mountIcons();
}

// делаем доступным из компонентов
window.setTabbarMenu = setTabbarMenu;
window.setTabbarCTA  = setTabbarCTA;

/* ---------- Telegram авторизация ---------- */
(function initTelegram(){
  const tg = window.Telegram?.WebApp;
  if (tg?.initDataUnsafe?.user){
    state.user = tg.initDataUnsafe.user;
  }
})();

/* ---------- Поиск ---------- */
el('#searchInput').addEventListener('input', (e)=>{
  state.filters.query = e.target.value;
  renderHome(router);
});

/* ---------- Уведомления (localStorage) ---------- */
const NOTIF_KEY = 'nas_notifications';

function seedNotificationsOnce(){
  try{
    if (localStorage.getItem(NOTIF_KEY)) return;
    const seed = [
      { id: 1, title: 'Добро пожаловать в EVLISE OUTLET', sub: 'Подборка новинок уже на главной.', ts: Date.now()-1000*60*60*6, read:false, icon:'bell' },
      { id: 2, title: 'Скидки на худи', sub: 'MANIA и DIRT — выгоднее на 15% до воскресенья.', ts: Date.now()-1000*60*50, read:false, icon:'percent' },
    ];
    localStorage.setItem(NOTIF_KEY, JSON.stringify(seed));
  }catch{}
}
function getNotifications(){ try{ return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); }catch{ return []; } }
function setNotifications(list){ localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); }
function updateNotifBadge(){
  const unread = getNotifications().filter(n=>!n.read).length;
  const b = document.getElementById('notifBadge');
  if (!b) return;
  if (unread>0){ b.textContent = String(unread); b.hidden = false; } else { b.hidden = true; }
}

/* Клик по колокольчику в шапке */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#openNotifications');
  if (!btn) return;
  location.hash = '#/notifications';
});

/* ---------- Роутер ---------- */
function router(){
  const path=(location.hash||'#/').slice(1);
  const clean = path.replace(/#.*/,'');
  const parts = path.split('/').filter(Boolean);

  // карта для подсветки табов (меню)
  const map = { '':'home','/':'home','/favorites':'saved','/cart':'cart','/account':'account','/orders':'account' };

  const match = (pattern)=>{
    const p=pattern.split('/').filter(Boolean); if(p.length!==parts.length) return null;
    const params={};
    for(let i=0;i<p.length;i++){
      if(p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i]);
      else if(p[i]!==parts[i]) return null;
    }
    return params;
  };

  // по умолчанию — меню-таббар
  setTabbarMenu(map[clean] || 'home');

  if (parts.length===0) return renderHome(router);
  const m1=match('category/:slug'); if (m1) return renderCategory(m1);
  const m2=match('product/:id');   if (m2) return renderProduct(m2);     // сам компонент переключит таббар на CTA
  const m3=match('track/:id');     if (m3) return renderTrack(m3);

  if (match('favorites'))          return renderFavorites();
  if (match('cart'))               return renderCart();                   // сам компонент переключит таббар на CTA
  if (match('orders'))             return renderOrders();

  if (match('account'))            return renderAccount();
  if (match('account/addresses'))  return renderAddresses();
  if (match('account/settings'))   return renderSettings();

  if (match('notifications'))      return renderNotifications(updateNotifBadge);

  if (match('faq'))                return renderFAQ();

  renderHome(router);
}

/* ---------- Инициализация ---------- */
async function init(){
  const res = await fetch('data/products.json'); const data = await res.json();
  state.products = data.products;
  state.categories = data.categories.map(c=>({ ...c, name: c.name }));

  drawCategoriesChips(router);
  renderActiveFilterChips();
  router();

  window.addEventListener('hashchange', router);
  mountIcons();

  seedNotificationsOnce();
  updateNotifBadge();
}
init();

/* ---------- Фильтры ---------- */
document.getElementById('openFilters').onclick=()=> openFilterModal(router);

// экспорт если понадобится
export { updateNotifBadge, getNotifications, setNotifications, setTabbarMenu, setTabbarCTA };

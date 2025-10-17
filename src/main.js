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

/* ---------- Telegram авторизация (без UI в шапке) ---------- */
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
function getNotifications(){
  try{ return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); }catch{ return []; }
}
function setNotifications(list){
  localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
}
function updateNotifBadge(){
  const unread = getNotifications().filter(n=>!n.read).length;
  const b = document.getElementById('notifBadge');
  if (!b) return;
  if (unread>0){ b.textContent = unread; b.hidden = false; } else { b.hidden = true; }
}

/* Клик по колокольчику в шапке */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#openNotifications');
  if (!btn) return;
  location.hash = '#/notifications';
});

/* ---------- Роутер (без отдельной страницы поиска) ---------- */
function router(){
  const path=(location.hash||'#/').slice(1);
  document.querySelectorAll('.tabbar .tab').forEach(t=> t.classList.remove('active'));

  // какие пути подсвечивают таббар
  const map = { '':'home','/':'home','/favorites':'saved','/cart':'cart','/account':'account','/orders':'account' };
  const clean = path.replace(/#.*/,'');
  if (map[clean]) document.querySelector(`.tabbar .tab[data-tab="${map[clean]}"]`)?.classList.add('active');

  const parts = path.split('/').filter(Boolean);
  const match = (pattern)=>{
    const p=pattern.split('/').filter(Boolean); if(p.length!==parts.length) return null;
    const params={};
    for(let i=0;i<p.length;i++){
      if(p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i]);
      else if(p[i]!==parts[i]) return null;
    }
    return params;
  };

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
  window.lucide?.createIcons && lucide.createIcons();

  // уведомления
  seedNotificationsOnce();
  updateNotifBadge();
}
init();

/* ---------- Фильтры ---------- */
document.getElementById('openFilters').onclick=()=> openFilterModal(router);

/* Экспорт если где-то понадобится */
export { updateNotifBadge, getNotifications, setNotifications };

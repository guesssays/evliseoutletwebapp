import { state, loadCart, updateCartBadge } from './core/state.js';
import { toast } from './core/toast.js';
import { el } from './core/utils.js';
import { renderHome, drawCategoriesChips } from './components/Home.js';
import { renderProduct } from './components/Product.js';
import { renderCart } from './components/Cart.js';
import { renderFavorites } from './components/Favorites.js';
import { renderCategory } from './components/Category.js';
import { renderOrders, renderTrack } from './components/Orders.js';
import { openFilterModal, renderActiveFilterChips } from './components/Filters.js';

loadCart(); updateCartBadge();

// Telegram авторизация (аккаунт)
function initTelegram(){
  const tg = window.Telegram?.WebApp;
  const btn = document.getElementById('tgAuthBtn');
  if (tg?.initDataUnsafe?.user){
    state.user = tg.initDataUnsafe.user;
    document.getElementById('userName').textContent = `${state.user.first_name || ''} ${state.user.last_name || ''}`.trim() || state.user.username || 'Пользователь';
    btn.style.display='none';
  }else{
    btn.onclick = ()=>{
      toast('Если открыть это приложение внутри Telegram, авторизация произойдёт автоматически.');
      btn.style.display='none';
    };
  }
}
initTelegram();

// поиск
el('#searchInput').addEventListener('input', (e)=>{ state.filters.query = e.target.value; renderHome(router); });

// маршрутизация
function router(){
  const path=(location.hash||'#/').slice(1);
  document.querySelectorAll('.tabbar .tab').forEach(t=> t.classList.remove('active'));
  const map = { '':'home','/':'home','/search':'search','/favorites':'saved','/cart':'cart','/account':'account','/orders':'account' };
  const tab = map[path.replace(/#.*/,'')] || (path.startsWith('/product')? 'home' : 'home');
  document.querySelector(`.tabbar .tab[data-tab="${tab}"]`)?.classList.add('active');

  const parts = path.split('/').filter(Boolean);
  const match = (pattern)=>{
    const p=pattern.split('/').filter(Boolean); if(p.length!==parts.length) return null;
    const params={}; for(let i=0;i<p.length;i++){ if(p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i]); else if(p[i]!==parts[i]) return null; }
    return params;
  };

  if (parts.length===0) return renderHome(router);
  const m1=match('category/:slug'); if (m1) return renderCategory(m1);
  const m2=match('product/:id'); if (m2) return renderProduct(m2);
  const m3=match('track/:id'); if (m3) return renderTrack(m3);
  if (match('favorites')) return renderFavorites();
  if (match('cart')) return renderCart();
  if (match('orders')) return renderOrders();
  if (match('account')){ document.getElementById('view').innerHTML = `
      <div class="section-title">Аккаунт</div>
      <section class="checkout">
        <a class="pill primary" href="#/orders"><i data-lucide="package-open"></i>Мои заказы</a>
      </section>`; window.lucide?.createIcons(); return; }
  renderHome(router);
}

async function init(){
  const res = await fetch('data/products.json'); const data = await res.json();
  state.products = data.products;
  state.categories = data.categories.map(c=>({ ...c, name: c.name }));

  drawCategoriesChips(router);
  renderActiveFilterChips();
  router();
  window.addEventListener('hashchange', router);
  window.lucide?.createIcons && lucide.createIcons();
}
init();

// Фильтры — рабочая модалка
document.getElementById('openFilters').onclick=()=> openFilterModal(router);

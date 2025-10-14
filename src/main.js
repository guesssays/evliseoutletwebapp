import { initTelegramChrome, DEFAULT_THEME } from './core/config.js';
import { setLang, toggleLanguage } from './core/i18n.js';
import { state, updateCartBadge } from './core/state.js';
import { updateToastTop } from './core/toast.js';
import { buildDrawer, openDrawer, closeDrawer } from './components/Drawer.js';
import { renderHome } from './components/Home.js';
import { renderCategory } from './components/Category.js';
import { renderProduct } from './components/Product.js';
import { renderCart } from './components/Cart.js';
import { renderFAQ } from './components/FAQ.js';
import { renderFavorites } from './components/Favorites.js';
import { showOnboardingOnce, renderOnboardingSlide } from './components/Onboarding.js';

initTelegramChrome();

document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
updateToastTop();
window.addEventListener('resize', updateToastTop);

// header bindings
function bindChrome(){
  document.querySelector('#menuBtn').onclick=()=>openDrawer();
  document.querySelector('#closeDrawer').onclick=()=>closeDrawer();
  document.querySelector('#overlay').onclick=()=>{ closeDrawer(); document.querySelector('#modal').classList.remove('show'); };
  document.querySelector('#modalClose').onclick=()=>{ document.querySelector('#modal').classList.remove('show'); };
  document.querySelector('#themeBtn').onclick=()=>{
    const cur=document.documentElement.getAttribute('data-theme'); const next=cur==='light'?'dark':'light';
    document.documentElement.setAttribute('data-theme', next); localStorage.setItem('evlise_theme', next);
    const isLight = document.documentElement.getAttribute('data-theme')==='light';
    document.querySelector('#themeBtn').innerHTML = `<i data-lucide="${isLight ? 'moon' : 'sun'}"></i>`;
    window.lucide?.createIcons && lucide.createIcons();
  };
  document.querySelector('#langBtn').onclick=()=>{
    toggleLanguage(); buildDrawer(); router();
    if (document.querySelector('#modal').classList.contains('show') && document.querySelector('#modalBody').querySelector('.ob')){
      renderOnboardingSlide(0);
    }
  };
}
function router(){
  const tg = window.Telegram?.WebApp; if (tg?.MainButton) tg.MainButton.hide();
  let hash=location.hash.replace(/^#/, '') || '/'; const path=hash.split('?')[0];
  const match = (pattern)=>{
    const p=pattern.split('/').filter(Boolean); const a=path.split('/').filter(Boolean); if (p.length!==a.length) return null;
    const params={}; for (let i=0;i<p.length;i++){ if(p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]); else if(p[i]!==a[i]) return null; }
    return params;
  };
  if (match('/')) return renderHome(router);
  const m1=match('/category/:slug'); if (m1) return renderCategory(m1, router);
  const m2=match('/product/:id'); if (m2) return renderProduct(m2);
  if (match('/cart')) return renderCart();
  if (match('/faq')) return renderFAQ();
  if (match('/favorites')) return renderFavorites();
  renderHome(router);
}

async function init(){
  const res = await fetch('data/products.json'); const data = await res.json();
  state.products = data.products; state.categories = data.categories;
  buildDrawer(); updateCartBadge(); bindChrome(); showOnboardingOnce(); router();
  window.addEventListener('hashchange', router);
  window.lucide?.createIcons && lucide.createIcons();
}
init();

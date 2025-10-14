import { el } from '../core/dom.js';
import { state } from '../core/state.js';
import { t } from '../core/i18n.js';

export function openDrawer(){ el('#drawer').classList.add('open'); el('#overlay').classList.add('show'); el('#drawer').setAttribute('aria-hidden','false'); }
export function closeDrawer(){ el('#drawer').classList.remove('open'); el('#overlay').classList.remove('show'); el('#drawer').setAttribute('aria-hidden','true'); }

export function buildDrawer(){
  const nav = el('#drawerNav'); nav.innerHTML='';
  const mkLink = (label, href)=>{ const a=document.createElement('a'); a.href=href; a.textContent=label; nav.appendChild(a); };
  mkLink(t('home'), '#/'); mkLink(t('favorites'), '#/favorites');

  const sec=document.createElement('div'); sec.className='nav-section';
  const header=document.createElement('button'); header.className='nav-accordion';
  header.innerHTML = `<span class="nav-accordion-title">${t('categories')}</span><i data-lucide="chevron-down" class="chev"></i>`;
  const panel=document.createElement('div'); panel.className='nav-panel';
  state.categories.forEach(c=>{ const a=document.createElement('a'); a.href=`#/category/${c.slug}`; a.textContent=c.name; panel.appendChild(a); });
  header.onclick=()=>{ const opened = panel.classList.toggle('open'); header.classList.toggle('open', opened); if (window.lucide?.createIcons) lucide.createIcons(); };
  sec.appendChild(header); sec.appendChild(panel); nav.appendChild(sec);

  mkLink(t('faq'), '#/faq'); mkLink(t('cart'), '#/cart');
  if (window.lucide?.createIcons) lucide.createIcons();
}

import { el } from '../core/utils.js';
import { state } from '../core/state.js';

export function openDrawer(){ el('#drawer').classList.add('open'); el('#overlay').classList.add('show'); el('#drawer').setAttribute('aria-hidden','false'); }
export function closeDrawer(){ el('#drawer').classList.remove('open'); el('#overlay').classList.remove('show'); el('#drawer').setAttribute('aria-hidden','true'); }

export function buildDrawer(){
  const nav = el('#drawerNav'); if (!nav) return; nav.innerHTML='';
  const mkLink = (label, href)=>{ const a=document.createElement('a'); a.href=href; a.textContent=label; return a; };

  // верхние ссылки
  nav.appendChild(mkLink('Главная', '#/'));
  nav.appendChild(mkLink('Избранное', '#/favorites'));

  // секция с иерархией категорий
  const sec=document.createElement('div'); sec.className='nav-section';
  const header=document.createElement('button'); header.className='nav-accordion';
  header.innerHTML = `<span class="nav-accordion-title">Категории</span><i data-lucide="chevron-down" class="chev"></i>`;
  const panel=document.createElement('div'); panel.className='nav-panel';

  // служебные
  panel.appendChild(mkLink('Все товары', '#/category/all'));
  panel.appendChild(mkLink('Новинки', '#/category/new'));

  // группы и подкатегории
  state.categories.forEach(group=>{
    // Ссылка на группу (агрегирует подкатегории)
    const gLink = mkLink(group.name, `#/category/${group.slug}`);
    gLink.classList.add('nav-group');
    panel.appendChild(gLink);

    // Дети (узкие категории)
    (group.children||[]).forEach(ch=>{
      const sub = mkLink('— ' + ch.name, `#/category/${ch.slug}`);
      sub.classList.add('nav-sub');
      panel.appendChild(sub);
    });
  });

  header.onclick=()=>{
    const opened = panel.classList.toggle('open');
    header.classList.toggle('open', opened);
    if (window.lucide?.createIcons) lucide.createIcons();
  };
  sec.appendChild(header); sec.appendChild(panel); nav.appendChild(sec);

  nav.appendChild(mkLink('FAQ', '#/faq'));
  nav.appendChild(mkLink('Корзина', '#/cart'));
  window.lucide?.createIcons && lucide.createIcons();
}

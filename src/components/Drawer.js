export function buildDrawer(){
  const nav = el('#drawerNav'); if (!nav) return; nav.innerHTML='';
  const mkLink = (label, href)=>{ const a=document.createElement('a'); a.href=href; a.textContent=label; return a; };

  // верхние ссылки
  nav.appendChild(mkLink('Главная', '#/'));
  nav.appendChild(mkLink('Избранное', '#/favorites'));

  // ===== helpers: упорядочить верхние группы и выкинуть "Другое"
  const isOther = (g)=>{
    const s = (g.slug||'').toLowerCase();
    const n = (g.name||'').toLowerCase();
    return ['другое','разное','other','misc'].includes(s) || ['другое','разное','other','misc'].includes(n);
  };
  const sortKey = (g)=>{
    const s = (g.slug||'').toLowerCase();
    const n = (g.name||'').toLowerCase();
    if (['top','верх','verh','up'].includes(s) || ['верх'].includes(n)) return 0;     // Верх
    if (['bottom','низ','niz','down'].includes(s) || ['низ'].includes(n)) return 1;  // Низ
    if (['shoes','обувь','obu'].includes(s) || ['обувь'].includes(n)) return 2;      // Обувь
    if (['bags','сумки','sumki'].includes(s) || ['сумки'].includes(n)) return 3;     // Сумки
    return 99;
  };
  const topGroupsOrdered = (state.categories||[])
    .filter(g => !isOther(g))
    .sort((a,b)=> sortKey(a) - sortKey(b));

  // секция «Категории»
  const sec=document.createElement('div'); sec.className='nav-section';
  const header=document.createElement('button'); header.className='nav-accordion';
  header.innerHTML = `<span class="nav-accordion-title">Категории</span><i data-lucide="chevron-down" class="chev"></i>`;
  const panel=document.createElement('div'); panel.className='nav-panel';

  // — строго заданный порядок:
  panel.appendChild(mkLink('Все товары', '#/category/all'));
  panel.appendChild(mkLink('Акции',     '#/promo'));              // добавили «Акции»
  panel.appendChild(mkLink('Новинки',   '#/category/new'));
  panel.appendChild(mkLink('В наличии', '#/category/instock'));
  // — затем верхние группы в нужном порядке (без «Другое»)
  topGroupsOrdered.forEach(group=>{
    panel.appendChild(mkLink(group.name, `#/category/${group.slug}`));
  });

  header.onclick=()=>{
    const opened = panel.classList.toggle('open');
    header.classList.toggle('open', opened);
    if (window.lucide?.createIcons) lucide.createIcons();
  };

  sec.appendChild(header);
  sec.appendChild(panel);
  nav.appendChild(sec);

  nav.appendChild(mkLink('FAQ',    '#/faq'));
  nav.appendChild(mkLink('Корзина','#/cart'));
  window.lucide?.createIcons && lucide.createIcons();
}

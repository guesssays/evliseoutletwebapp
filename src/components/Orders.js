// src/components/Orders.js
import { state, getUID } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { getOrdersForUser, getStatusLabel as _getStatusLabel } from '../core/orders.js';

/* ===== безопасный label для статуса ===== */
function getStatusLabel(s) {
  try {
    return _getStatusLabel(s);
  } catch {
    return String(s || '—');
  }
}

/* ===== helpers for short ids ===== */
function getDisplayId(o){
  const sid = o?.shortId || o?.code;
  if (sid) return String(sid).toUpperCase();
  const full = String(o?.id ?? '');
  if (!full) return '';
  return full.slice(-6).toUpperCase();
}

function matchesAnyId(o, val){
  const needleRaw = String(val || '').trim();
  if (!needleRaw) return false;

  const needle = needleRaw.toUpperCase();
  const idFull = String(o?.id || '');
  const short  = String(o?.shortId || o?.code || '').toUpperCase();

  if (idFull && idFull === needleRaw) return true;
  if (short && short === needle) return true;

  if (idFull) {
    const tail6 = idFull.slice(-6).toUpperCase();
    if (needle === tail6) return true;
  }
  return false;
}

/* === общая помощь: при клике по ссылкам трекинга — держать активным таб "account" === */
function keepAccountTabOnTrackLinks(root=document){
  try{
    const links = root.querySelectorAll('a[href^="#/track/"]');
    links.forEach(a => {
      a.addEventListener('click', () => window.setTabbarMenu?.('account'), { once:false });
    });
  }catch{}
}

export async function renderOrders(){
  // 🔒 всегда фиксируем активный таббар на "Аккаунт" для этой секции
  window.setTabbarMenu?.('account');

  const v = document.getElementById('view');
  const myUid = getUID?.() || '';

  if (!myUid) {
    v.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="ordersBack"><i data-lucide="chevron-left"></i></button>
        Мои заказы
      </div>
      <section class="checkout">
        <div class="cart-sub">Похоже, вы не авторизованы.</div>
      </section>`;
    window.lucide?.createIcons && lucide.createIcons();
    document.getElementById('ordersBack')?.addEventListener('click', ()=> history.back());
    // страхуемся: даже с заглушкой не переключаем таб
    window.setTabbarMenu?.('account');
    return;
  }

  let myOrders = [];
  try {
    const list = await getOrdersForUser(myUid);
    myOrders = Array.isArray(list) ? list.slice() : [];
  } catch {
    myOrders = [];
  }

  if (!myOrders.length){
    v.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="ordersBack"><i data-lucide="chevron-left"></i></button>
        Мои заказы
      </div>
      <section class="checkout">
        <div style="text-align:center;color:#999; padding:40px 0">
          <i data-lucide="package" style="width:60px;height:60px;opacity:.35"></i>
          <div style="font-weight:800; font-size:22px; margin-top:6px">Заказов нет</div>
          <div class="cart-sub">Оформите первый заказ — и он появится здесь</div>
        </div>
      </section>`;
    window.lucide?.createIcons && lucide.createIcons();
    document.getElementById('ordersBack')?.addEventListener('click', ()=> history.back());
    // держим активным "Аккаунт"
    window.setTabbarMenu?.('account');
    return;
  }

  myOrders.sort((a,b)=> (b?.createdAt||0) - (a?.createdAt||0));

  const inProgress = myOrders.filter(o => !['выдан','отменён'].includes(o?.status));
  const received   = myOrders.filter(o => o?.status === 'выдан');
  const canceled   = myOrders.filter(o => o?.status === 'отменён');

  v.innerHTML = `
    <div class="section-title" style="display:flex;align-items:center;gap:10px">
      <button class="square-btn" id="ordersBack"><i data-lucide="chevron-left"></i></button>
      Мои заказы
    </div>
    <section class="checkout orders-groups">
      ${groupBlock('В процессе', inProgress)}
      ${groupBlock('Получены', received)}
      ${groupBlock('Отменены', canceled)}
    </section>
  `;

  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('ordersBack')?.addEventListener('click', ()=> history.back());

  // 💡 при клике на «Подробнее» и вообще все переходы на #/track/... — не менять таб
  keepAccountTabOnTrackLinks(v);

  // И дополнительно страхуемся от любых внешних перерисовок
  window.setTabbarMenu?.('account');
}

function groupBlock(title, list){
  const count = Array.isArray(list) ? list.length : 0;
  return `
    <div class="orders-group">
      <div class="subsection-title" style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 6px">
        <span>${title}</span>
        <span class="muted mini">${count}</span>
      </div>
      ${count ? list.map(orderCard).join('') : emptyRow(title)}
    </div>
  `;
}

function orderCard(o){
  const cover = (o?.cart?.[0]?.images?.[0]) || 'assets/placeholder.jpg';

  const displayId = getDisplayId(o);
  const link = `#/track/${encodeURIComponent(displayId)}`;

  let actionHtml = `<a class="pill" href="${link}" data-keep-tab="account">Подробнее</a>`;
  if (o?.status === 'выдан'){
    actionHtml = `
      <a class="pill" href="${link}" data-keep-tab="account" style="display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="check-circle"></i><span>Детали</span>
      </a>`;
  } else if (o?.status === 'отменён'){
    actionHtml = `
      <a class="pill outline" href="${link}" data-keep-tab="account" style="display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="x-circle"></i><span>Детали</span>
      </a>`;
  }

  const subLines = [];
  subLines.push(getStatusLabel(o?.status));
  if (o?.status === 'отменён' && o?.cancelReason){
    subLines.push(`Причина: ${escapeHtml(o.cancelReason)}`);
  }

  return `
    <div class="order-row">
      <div class="cart-img"><img src="${cover}" alt=""></div>
      <div>
        <div class="cart-title">${'Заказ #'+escapeHtml(displayId)}</div>
        <div class="cart-sub" style="overflow-wrap:anywhere">${subLines.map(escapeHtml).join(' · ')}</div>
        <div class="cart-price">${priceFmt(Number(o?.total || 0))}</div>
      </div>
      ${actionHtml}
    </div>
  `;
}

export async function renderTrack({id}){
  // 🔒 экран деталей заказа — тоже всегда «Аккаунт»
  window.setTabbarMenu?.('account');

  const v = document.getElementById('view');
  const myUid = getUID?.() || '';

  let list = [];
  try {
    const l = await getOrdersForUser(myUid);
    list = Array.isArray(l) ? l : [];
  } catch {
    list = [];
  }

  const o = list.find(x => matchesAnyId(x, id));
  if(!o){
    v.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="trackBackNF"><i data-lucide="chevron-left"></i></button>
        Трекинг
      </div>
      <section class="checkout">Не найдено</section>
    `;
    window.lucide?.createIcons && lucide.createIcons();
    document.getElementById('trackBackNF')?.addEventListener('click', ()=> history.back());
    // страхуемся: активная вкладка — аккаунт
    window.setTabbarMenu?.('account');
    return;
  }

  const stepsKeys = [
    'новый','принят','собирается в китае','вылетел в узб',
    'на таможне','на почте','забран с почты','выдан'
  ];
  const steps = stepsKeys.map(k => ({ key:k, label:getStatusLabel(k) }));
  const curIdx = Math.max(steps.findIndex(s=>s.key===o.status), 0);
  const progress = Math.max(0, Math.min(100, Math.round(curIdx * 100 / Math.max(1, (steps.length - 1)))));

  const itemsHtml = itemsBlock(o);
  const displayId = getDisplayId(o);

  v.innerHTML = `
    <style>
      .order-detail-page{overflow-x:hidden; max-width:100%;}
      .order-detail-page *{box-sizing:border-box;}
      .track-head{ display:grid; grid-template-columns: 1fr auto; align-items:center; gap:8px; }
      .track-status{font-weight:800;text-align:right}
      @media (max-width: 480px){
        .track-head{grid-template-columns: 1fr; gap:4px;}
        .track-status{text-align:left}
      }
      .progress-bar{ width:100%; overflow:hidden; border-radius:999px; height:8px; background:var(--border, rgba(0,0,0,.08)); }
      .progress-bar b{ display:block; height:100%; background:var(--primary,#111); transition:width .25s ease; }
      .progress-list{display:grid; gap:8px}
      .progress-item{display:flex; align-items:center; gap:8px; min-width:0}
      .progress-label{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%}
      .order-item{ display:grid; grid-template-columns: 56px minmax(0,1fr) auto; gap:10px; align-items:center; margin-top:10px; width:100%; }
      .order-item .cart-img img{width:56px;height:56px;object-fit:cover;border-radius:10px}
      .order-item__meta .cart-title{word-break:break-word; overflow-wrap:anywhere}
      .order-item__meta .cart-sub{color:var(--muted); font-size:.92rem; overflow-wrap:anywhere; display:flex; align-items:center; gap:6px; flex-wrap:wrap}
      .order-item__qty-inline{white-space:nowrap; color:var(--muted)}
      .order-item__sum{justify-self:end; font-weight:700; padding-left:8px; white-space:nowrap}
      @media (max-width: 420px){ .order-item{ grid-template-columns: 56px minmax(0,1fr) auto; } }
      .kv{display:block; width:100%;}
      .kv__row{display:grid; grid-template-columns:minmax(80px, 40%) minmax(0,1fr); gap:10px; align-items:start; margin:6px 0}
      .kv__row dt{color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
      .kv__row dd{margin:0; word-break:break-word; overflow-wrap:anywhere}
      .subsection-title{font-weight:700;margin:10px 0 6px}
      .pill, .btn{max-width:100%; white-space:nowrap; text-overflow:ellipsis; overflow:hidden}
      .back-wrap{ margin-top:12px; display:flex; justify-content:center; align-items:center; width:100%; }
      .back-btn{ display:inline-flex; align-items:center; gap:8px; }
    </style>

    <div class="section-title" style="display:flex;align-items:center;gap:10px">
      <button class="square-btn" id="trackBack"><i data-lucide="chevron-left"></i></button>
      Заказ #${escapeHtml(displayId)}
    </div>
    <section class="checkout order-detail-page">
      <div class="track-head">
        <div class="track-caption">Этап ${Math.min(curIdx+1, steps.length)} из ${steps.length}</div>
        <div class="track-status">${escapeHtml(getStatusLabel(o.status))}</div>
      </div>

      ${o.status!=='отменён' ? `
        <div class="progress-bar" aria-label="Прогресс заказа"><b style="width:${progress}%"></b></div>
        <div class="progress-list" style="margin-top:12px" role="list">
          ${steps.map((s,i)=>`
            <div class="progress-item ${i<curIdx?'is-done':''} ${i===curIdx?'is-current':''}" role="listitem" aria-current="${i===curIdx?'step':'false'}">
              <span class="progress-dot" aria-hidden="true"></span>
              <span class="progress-label">${s.label}</span>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="note" style="grid-template-columns:auto 1fr">
          <i data-lucide="x-circle"></i>
          <div>
            <div class="note-title">Заказ отменён</div>
            ${o.cancelReason ? `<div class="note-sub">Причина: ${escapeHtml(o.cancelReason)}</div>` : ''}
          </div>
        </div>
      `}

      ${itemsBlock(o)}

      <div class="kv" style="margin-top:12px">
        <div class="kv__row">
          <dt>Адрес доставки</dt>
          <dd class="break">${escapeHtml(o.address || '—')}</dd>
        </div>
        <div class="kv__row">
          <dt>Телефон</dt>
          <dd>${escapeHtml(o.phone || '—')}</dd>
        </div>
        <div class="kv__row">
          <dt>Плательщик</dt>
          <dd class="break">${escapeHtml(o.payerFullName || '—')}</dd>
        </div>
      </div>

      <div class="back-wrap">
        <a class="pill primary back-btn" href="#/orders" aria-label="Назад к заказам">
          <i data-lucide="arrow-left"></i><span>Назад к заказам</span>
        </a>
      </div>
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('trackBack')?.addEventListener('click', ()=> history.back());

  // Подстраховка: если кто-то перерисовал таббар — возвращаем «Аккаунт»
  window.setTabbarMenu?.('account');
}

function itemsBlock(o){
  const items = Array.isArray(o?.cart) ? o.cart : [];
  if (!items.length){
    return `<div class="muted" style="margin-top:12px">В заказе нет позиций</div>`;
  }

  const rows = items.map((x)=>{
    const cover = x?.images?.[0] || 'assets/placeholder.jpg';
    const colorLabel = x?.color ? `Цвет: ${escapeHtml(colorNameFromValue(String(x.color)))}` : '';
    const opts = [
      x?.size ? `Размер: ${escapeHtml(x.size)}` : '',
      colorLabel
    ].filter(Boolean).join(' · ');
    const qty = `×${escapeHtml(String(x?.qty||0))}`;
    const line = Number(x?.qty||0) * Number(x?.price||0);
    return `
      <div class="order-item">
        <div class="cart-img"><img src="${cover}" alt=""></div>
        <div class="order-item__meta">
          <div class="cart-title">${escapeHtml(x?.title || 'Товар')}</div>
          <div class="cart-sub">
            ${opts ? `<span>${opts}</span>` : ''}
            <span class="order-item__qty-inline">${qty}</span>
          </div>
        </div>
        <div class="order-item__sum">${priceFmt(line)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="subsection-title" style="margin-top:12px">Состав заказа</div>
    ${rows}
    <div style="display:flex;justify-content:flex-end;margin-top:6px">
      <div style="text-align:right"><b>Итого: ${priceFmt(Number(o?.total||0))}</b></div>
    </div>
  `;
}

function emptyRow(title){
  let hint = 'Нет заказов';
  if (title === 'В процессе') hint = 'Сейчас нет активных заказов';
  if (title === 'Получены')   hint = 'Вы ещё ничего не получили';
  if (title === 'Отменены')   hint = 'Отменённых заказов нет';
  return `<div class="orders-empty" style="color:#999; padding:8px 0 16px">${hint}</div>`;
}

/* === helpers === */

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/**
 * Преобразует значение цвета (hex, rgb, английское имя, сокращения) в русское название.
 * При неизвестном значении — возвращает исходное.
 */
function colorNameFromValue(raw){
  if (!raw) return '';
  const v = String(raw).trim().toLowerCase();

  const dict = {
    'black':'чёрный','white':'белый','red':'красный','green':'зелёный','blue':'синий',
    'yellow':'жёлтый','orange':'оранжевый','purple':'фиолетовый','violet':'фиолетовый',
    'pink':'розовый','brown':'коричневый','gray':'серый','grey':'серый','beige':'бежевый',
    'gold':'золотой','silver':'серебристый','navy':'тёмно-синий','teal':'бирюзовый',
    'turquoise':'бирюзовый','maroon':'бордовый','burgundy':'бордовый','olive':'оливковый',
    'lime':'лаймовый','cyan':'голубой','magenta':'пурпурный','tan':'светло-коричневый',
    'ivory':'слоновая кость','cream':'кремовый','khaki':'хаки','mustard':'горчичный',
    'lavender':'лавандовый','mint':'мятный','peach':'персиковый','coral':'коралловый',
    'черный':'чёрный','чёрный':'чёрный','белый':'белый','красный':'красный','зелёный':'зелёный','зеленый':'зелёный',
    'синий':'синий','голубой':'голубой','жёлтый':'жёлтый','желтый':'жёлтый','оранжевый':'оранжевый','фиолетовый':'фиолетовый',
    'розовый':'розовый','коричневый':'коричневый','серый':'серый','бежевый':'бежевый','бордовый':'бордовый',
    'серебристый':'серебристый','золотой':'золотой','хаки':'хаки','оливковый':'оливковый'
  };

  if (dict[v]) return dict[v];

  const short = {
    'bk':'чёрный','bl':'синий','blu':'синий','blk':'чёрный','wht':'белый','wh':'белый',
    'gr':'серый','gry':'серый','gy':'серый','rd':'красный','gn':'зелёный','grn':'зелёный',
    'yl':'жёлтый','ylw':'жёлтый','org':'оранжевый','pur':'фиолетовый','prp':'фиолетовый',
    'pnk':'розовый','brn':'коричневый','br':'коричневый','be':'бежевый','nv':'тёмно-синий'
  };
  if (short[v]) return short[v];

  const hex = normalizeHex(v);
  if (hex){
    const name = hexToRuName(hex);
    if (name) return name;
  }

  if (v.startsWith('rgb')){
    const hexFromRgb = rgbToHex(v);
    if (hexFromRgb){
      const name = hexToRuName(hexFromRgb);
      if (name) return name;
    }
  }

  if (v.includes('/') || v.includes('-')){
    const parts = v.split(/[/\-]/).map(s=>s.trim()).filter(Boolean);
    const mapped = parts.map(p => colorNameFromValue(p));
    if (mapped.length) return mapped.join(' / ');
  }

  return v.startsWith('#') ? v.toUpperCase() : v;
}

function normalizeHex(v){
  const m = v.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '';
  let h = m[1].toLowerCase();
  if (h.length===3){
    h = h.split('').map(c=>c+c).join('');
  }
  return '#'+h;
}

const HEX_MAP = [
  ['#000000','чёрный'],
  ['#ffffff','белый'],
  ['#ff0000','красный'],
  ['#00ff00','зелёный'],
  ['#0000ff','синий'],
  ['#ffff00','жёлтый'],
  ['#ffa500','оранжевый'],
  ['#800080','фиолетовый'],
  ['#ffc0cb','розовый'],
  ['#8b4513','коричневый'],
  ['#808080','серый'],
  ['#c0c0c0','серебристый'],
  ['#ffd700','золотой'],
  ['#000080','тёмно-синий'],
  ['#00ffff','голубой'],
  ['#800000','бордовый'],
  ['#556b2f','оливковый'],
  ['#f5f5dc','бежевый'],
  ['#e6e6fa','лавандовый'],
  ['#98ff98','мятный'],
  ['#ffdab9','персиковый'],
  ['#ff7f50','коралловый'],
  ['#bdb76b','хаки']
];

function hexToRuName(hex){
  const exact = HEX_MAP.find(([h]) => h === hex.toLowerCase());
  if (exact) return exact[1];
  const [r,g,b] = hexToRGB(hex);
  let best = { dist: Infinity, name: '' };
  for (const [h, name] of HEX_MAP){
    const [R,G,B] = hexToRGB(h);
    const d = (R-r)**2 + (G-g)**2 + (B-b)**2;
    if (d < best.dist){ best = { dist:d, name }; }
  }
  return best.name;
}

function hexToRGB(hex){
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return [r,g,b];
}

function rgbToHex(rgbStr){
  const m = rgbStr.replace(/\s+/g,'').match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,([01]?\.?\d*))?\)$/i);
  if (!m) return '';
  const r = clamp255(+m[1]);
  const g = clamp255(+m[2]);
  const b = clamp255(+m[3]);
  return '#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function clamp255(n){ return Math.max(0, Math.min(255, n|0)); }

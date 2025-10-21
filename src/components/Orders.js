// src/components/Orders.js
import { state, getUID } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { getOrdersForUser, getStatusLabel } from '../core/orders.js';

export async function renderOrders(){
  const v=document.getElementById('view');
  const myUid = getUID();
  const myOrders = (await getOrdersForUser(myUid) || []).slice();

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
    return;
  }

  myOrders.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  const inProgress = myOrders.filter(o => !['выдан','отменён'].includes(o.status));
  const received   = myOrders.filter(o => o.status === 'выдан');
  const canceled   = myOrders.filter(o => o.status === 'отменён');

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
}

function groupBlock(title, list){
  const count = list.length;
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
  const cover = o.cart?.[0]?.images?.[0] || 'assets/placeholder.jpg';

  let actionHtml = `<a class="pill" href="#/track/${encodeURIComponent(o.id)}">Подробнее</a>`;
  if (o.status === 'выдан'){
    actionHtml = `
      <a class="pill" href="#/track/${encodeURIComponent(o.id)}" style="display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="check-circle"></i><span>Детали</span>
      </a>`;
  } else if (o.status === 'отменён'){
    actionHtml = `
      <a class="pill outline" href="#/track/${encodeURIComponent(o.id)}" style="display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="x-circle"></i><span>Детали</span>
      </a>`;
  }

  const subLines = [];
  subLines.push(getStatusLabel(o.status));
  if (o.status === 'отменён' && o.cancelReason){
    subLines.push(`Причина: ${escapeHtml(o.cancelReason)}`);
  }

  return `
    <div class="order-row">
      <div class="cart-img"><img src="${cover}" alt=""></div>
      <div>
        <div class="cart-title">${'Заказ #'+escapeHtml(o.id)}</div>
        <div class="cart-sub" style="overflow-wrap:anywhere">${subLines.map(escapeHtml).join(' · ')}</div>
        <div class="cart-price">${priceFmt(o.total || 0)}</div>
      </div>
      ${actionHtml}
    </div>
  `;
}

export async function renderTrack({id}){
  const v=document.getElementById('view');
  const myUid = getUID();
  const list = await getOrdersForUser(myUid);
  const o = list.find(x=>String(x.id)===String(id));
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
    return;
  }

  const stepsKeys = [
    'новый','принят','собирается в китае','вылетел в узб',
    'на таможне','на почте','забран с почты','выдан'
  ];
  const steps = stepsKeys.map(k => ({ key:k, label:getStatusLabel(k) }));
  const curIdx = Math.max(steps.findIndex(s=>s.key===o.status), 0);
  const progress = Math.max(0, Math.min(100, Math.round(curIdx * 100 / (steps.length - 1))));

  const itemsHtml = itemsBlock(o);

  v.innerHTML = `
    <style>
      .order-detail-page{overflow-x:hidden; max-width:100%;}
      .order-detail-page *{box-sizing:border-box;}

      .track-head{
        display:grid;
        grid-template-columns: 1fr auto;
        align-items:center;
        gap:8px;
      }
      .track-status{font-weight:800;text-align:right}
      @media (max-width: 480px){
        .track-head{grid-template-columns: 1fr; gap:4px;}
        .track-status{text-align:left}
      }

      .progress-bar{width:100%; overflow:hidden; border-radius:999px}
      .progress-list{display:grid; gap:8px}
      .progress-item{display:flex; align-items:center; gap:8px; min-width:0}
      .progress-label{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%}

      /* список позиций */
      .order-item{
        display:grid;
        grid-template-columns: 56px minmax(0,1fr) auto;
        gap:10px;
        align-items:center;
        margin-top:10px;
        width:100%;
      }
      .order-item .cart-img img{width:56px;height:56px;object-fit:cover;border-radius:10px}
      .order-item__meta .cart-title{word-break:break-word; overflow-wrap:anywhere}
      .order-item__meta .cart-sub{color:var(--muted); font-size:.92rem; overflow-wrap:anywhere; display:flex; align-items:center; gap:6px; flex-wrap:wrap}
      .order-item__qty-inline{white-space:nowrap; color:var(--muted)}
      .order-item__sum{justify-self:end; font-weight:700; padding-left:8px; white-space:nowrap}

      @media (max-width: 420px){
        .order-item{ grid-template-columns: 56px minmax(0,1fr) auto; }
      }

      .kv{display:block; width:100%;}
      .kv__row{display:grid; grid-template-columns:minmax(80px, 40%) minmax(0,1fr); gap:10px; align-items:start; margin:6px 0}
      .kv__row dt{color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
      .kv__row dd{margin:0; word-break:break-word; overflow-wrap:anywhere}

      .subsection-title{font-weight:700;margin:10px 0 6px}
      .pill, .btn{max-width:100%; white-space:nowrap; text-overflow:ellipsis; overflow:hidden}
    </style>

    <div class="section-title" style="display:flex;align-items:center;gap:10px">
      <button class="square-btn" id="trackBack"><i data-lucide="chevron-left"></i></button>
      Заказ #${escapeHtml(o.id)}
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

      ${itemsHtml}

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

      <a class="pill primary" href="#/orders" style="margin-top:12px">Назад к заказам</a>
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('trackBack')?.addEventListener('click', ()=> history.back());
}

function itemsBlock(o){
  const items = Array.isArray(o.cart) ? o.cart : [];
  if (!items.length){
    return `<div class="muted" style="margin-top:12px">В заказе нет позиций</div>`;
  }

  const rows = items.map((x)=>{
    const cover = x.images?.[0] || 'assets/placeholder.jpg';
    const opts = [
      x.size ? `Размер: ${escapeHtml(x.size)}` : '',
      x.color ? `Цвет: ${escapeHtml(x.color)}` : '',
    ].filter(Boolean).join(' · ');
    const qty = `×${escapeHtml(String(x.qty||0))}`;
    const line = Number(x.qty||0) * Number(x.price||0);
    return `
      <div class="order-item">
        <div class="cart-img"><img src="${cover}" alt=""></div>
        <div class="order-item__meta">
          <div class="cart-title">${escapeHtml(x.title || 'Товар')}</div>
          <div class="cart-sub">
            ${opts ? `<span>${escapeHtml(opts)}</span>` : ''}
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
      <div style="text-align:right"><b>Итого: ${priceFmt(o.total||0)}</b></div>
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
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

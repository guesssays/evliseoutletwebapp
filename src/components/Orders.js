// src/components/Orders.js
import { state, getUID } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { getOrdersForUser, getStatusLabel } from '../core/orders.js';

export async function renderOrders(){
  const v=document.getElementById('view');
  const myUid = getUID();
  const myOrders = (await getOrdersForUser(myUid) || []).slice();

  if (!myOrders.length){
    v.innerHTML = `<div class="section-title">Мои заказы</div>
      <section class="checkout">
        <div style="text-align:center;color:#999; padding:40px 0">
          <i data-lucide="package" style="width:60px;height:60px;opacity:.35"></i>
          <div style="font-weight:800; font-size:22px; margin-top:6px">Заказов нет</div>
          <div class="cart-sub">Оформите первый заказ — и он появится здесь</div>
        </div>
      </section>`;
    window.lucide?.createIcons && lucide.createIcons();
    return;
  }

  myOrders.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  const inProgress = myOrders.filter(o => !['выдан','отменён'].includes(o.status));
  const received   = myOrders.filter(o => o.status === 'выдан');
  const canceled   = myOrders.filter(o => o.status === 'отменён');

  v.innerHTML = `
    <div class="section-title">Мои заказы</div>
    <section class="checkout orders-groups">
      ${groupBlock('В процессе', inProgress)}
      ${groupBlock('Получены', received)}
      ${groupBlock('Отменены', canceled)}
    </section>
  `;

  window.lucide?.createIcons && lucide.createIcons();
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
        <div class="cart-title">Заказ #${escapeHtml(o.id)}</div>
        <div class="cart-sub">${subLines.map(escapeHtml).join(' · ')}</div>
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
    v.innerHTML='<div class="section-title">Трекинг</div><section class="checkout">Не найдено</section>';
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
    <div class="section-title">Заказ #${escapeHtml(o.id)}</div>
    <section class="checkout">
      <div class="track-head">
        <div class="track-caption">Этап ${Math.min(curIdx+1, steps.length)} из ${steps.length}</div>
        <div style="min-width:120px; text-align:right; font-weight:800">${escapeHtml(getStatusLabel(o.status))}</div>
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
}

function itemsBlock(o){
  const items = Array.isArray(o.cart) ? o.cart : [];
  if (!items.length){
    return `<div class="muted" style="margin-top:12px">В заказе нет позиций</div>`;
  }

  const rows = items.map((x,i)=>{
    const cover = x.images?.[0] || 'assets/placeholder.jpg';
    const opts = [
      x.size ? `Размер: ${escapeHtml(x.size)}` : '',
      x.color ? `Цвет: ${escapeHtml(x.color)}` : '',
    ].filter(Boolean).join(' · ');
    const line = Number(x.qty||0) * Number(x.price||0);
    return `
      <div class="order-item">
        <div class="cart-img"><img src="${cover}" alt=""></div>
        <div class="order-item__meta">
          <div class="cart-title">${escapeHtml(x.title || 'Товар')}</div>
          ${opts ? `<div class="cart-sub">${opts}</div>` : ''}
        </div>
        <div class="order-item__qty">×${escapeHtml(String(x.qty||0))}</div>
        <div class="order-item__sum">${priceFmt(line)}</div>
      </div>
    `;
  }).join('');

  return `
    <style>
      .order-item{display:grid;grid-template-columns:56px 1fr auto auto;gap:10px;align-items:center;margin-top:10px}
      .order-item__qty{min-width:44px;text-align:right;color:var(--muted)}
      .order-item__sum{min-width:90px;text-align:right;font-weight:700}
      .table-wrap{overflow:auto}
      .size-table th,.size-table td{white-space:nowrap}
    </style>
    <div class="subsection-title" style="margin-top:12px">Состав заказа</div>
    ${rows}
    <div style="display:flex;justify-content:flex-end;margin-top:6px">
      <div style="min-width:90px;text-align:right"><b>Итого: ${priceFmt(o.total||0)}</b></div>
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

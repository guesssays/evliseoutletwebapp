// src/components/Orders.js
import { state, getUID } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { getOrdersForUser, getStatusLabel } from '../core/orders.js';

export function renderOrders(){
  const v=document.getElementById('view');
  const myUid = getUID();
  const myOrders = (getOrdersForUser(myUid) || []).slice();

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

  // сортируем по дате создания (новые выше)
  myOrders.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  // группы
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

  // действие справа
  let actionHtml = '';
  if (o.status === 'выдан'){
    actionHtml = `
      <span class="pill" style="pointer-events:none;opacity:.95;display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="check-circle"></i><span>Получен</span>
      </span>`;
  } else if (o.status === 'отменён'){
    actionHtml = `
      <span class="pill outline" style="pointer-events:none;opacity:.95;display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="x-circle"></i><span>Отменён</span>
      </span>`;
  } else {
    actionHtml = `<a class="pill primary" href="#/track/${encodeURIComponent(o.id)}">Отследить</a>`;
  }

  return `
    <div class="order-row">
      <div class="cart-img"><img src="${cover}" alt=""></div>
      <div>
        <div class="cart-title">Заказ #${escapeHtml(o.id)}</div>
        <div class="cart-sub">${escapeHtml(getStatusLabel(o.status))}</div>
        <div class="cart-price">${priceFmt(o.total || 0)}</div>
      </div>
      ${actionHtml}
    </div>
  `;
}

function emptyRow(title){
  let hint = 'Нет заказов';
  if (title === 'В процессе') hint = 'Сейчас нет активных заказов';
  if (title === 'Получены')   hint = 'Вы ещё ничего не получили';
  if (title === 'Отменены')   hint = 'Отменённых заказов нет';
  return `
    <div class="orders-empty" style="color:#999; padding:8px 0 16px">
      ${hint}
    </div>
  `;
}

export function renderTrack({id}){
  // доступ к чужому заказу скрываем простым фильтром
  const myUid = getUID();
  const myOrders = getOrdersForUser(myUid);
  const o = myOrders.find(x=>String(x.id)===String(id));

  const v=document.getElementById('view');
  if(!o){
    v.innerHTML='<div class="section-title">Трекинг</div><section class="checkout">Не найдено</section>';
    return;
  }

  // последовательность шагов для визуализации прогресса
  const stepsKeys = [
    'новый',
    'принят',
    'собирается в китае',
    'вылетел в узб',
    'на таможне',
    'на почте',
    'забран с почты',
    'выдан'
  ];
  const steps = stepsKeys.map(k => ({ key:k, label:getStatusLabel(k) }));

  const curIdx = Math.max(steps.findIndex(s=>s.key===o.status), 0);
  const progress = Math.max(0, Math.min(100, Math.round(curIdx * 100 / (steps.length - 1))));

  v.innerHTML = `<div class="section-title">Трекинг заказа #${escapeHtml(o.id)}</div>
    <section class="checkout">
      <div class="track-head">
        <div class="track-caption">Этап ${curIdx+1} из ${steps.length}</div>
        <div style="min-width:120px; text-align:right; font-weight:800">${escapeHtml(getStatusLabel(o.status))}</div>
      </div>
      <div class="progress-bar" aria-label="Прогресс заказа"><b style="width:${progress}%"></b></div>

      <div class="progress-list" style="margin-top:12px" role="list">
        ${steps.map((s,i)=>`
          <div class="progress-item ${i<curIdx?'is-done':''} ${i===curIdx?'is-current':''}" role="listitem" aria-current="${i===curIdx?'step':'false'}">
            <span class="progress-dot" aria-hidden="true"></span>
            <span class="progress-label">${s.label}</span>
          </div>
        `).join('')}
      </div>

      <a class="pill primary" href="#/orders" style="margin-top:10px">Назад к заказам</a>
    </section>`;
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

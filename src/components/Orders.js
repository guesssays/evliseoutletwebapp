// src/components/Orders.js
import { state, getUID } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { getOrdersForUser, ORDER_STATUSES, getStatusLabel } from '../core/orders.js';

export function renderOrders(){
  const v=document.getElementById('view');
  const myUid = getUID();
  const myOrders = getOrdersForUser(myUid);

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

  v.innerHTML = `<div class="section-title">Мои заказы</div>
    <section class="checkout">
      ${myOrders.map(o=>`
        <div class="order-row">
          <div class="cart-img"><img src="${o.cart?.[0]?.images?.[0] || 'assets/placeholder.jpg'}" alt=""></div>
          <div>
            <div class="cart-title">Заказ #${o.id}</div>
            <div class="cart-sub">${getStatusLabel(o.status)}</div>
            <div class="cart-price">${priceFmt(o.total || 0)}</div>
          </div>
          <a class="pill primary" href="#/track/${o.id}">Отследить</a>
        </div>`).join('')}
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();
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

  v.innerHTML = `<div class="section-title">Трекинг заказа #${o.id}</div>
    <section class="checkout">
      <div class="track-head">
        <div class="track-caption">Этап ${curIdx+1} из ${steps.length}</div>
        <div style="min-width:120px; text-align:right; font-weight:800">${getStatusLabel(o.status)}</div>
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

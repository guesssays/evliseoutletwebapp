import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

export function renderOrders(){
  const v=document.getElementById('view');
  if (!state.orders.length){
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
      ${state.orders.map(o=>`
        <div class="order-row">
          <div class="cart-img"><img src="${o.cart?.[0]?.images?.[0] || 'assets/placeholder.jpg'}" alt=""></div>
          <div>
            <div class="cart-title">Заказ #${o.id}</div>
            <div class="cart-sub">${statusTextClient(o.status)}</div>
            <div class="cart-price">${priceFmt(o.total || 0)}</div>
          </div>
          <a class="pill primary" href="#/track/${o.id}">Отследить</a>
        </div>`).join('')}
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();
}

export function renderTrack({id}){
  const o = state.orders.find(x=>String(x.id)===String(id));
  const v=document.getElementById('view');
  if(!o){ v.innerHTML='<div class="section-title">Трекинг</div><section class="checkout">Не найдено</section>'; return; }

  // Минималистичные, короткие статусы
  const steps = [
    { key:'новый', label:'В обработке' },
    { key:'принят', label:'Подтверждён' },
    { key:'собирается в китае', label:'Сборка' },
    { key:'вылетел в узб', label:'В пути' },
    { key:'на таможне', label:'Таможня' },
    { key:'на почте', label:'На почте' },
    { key:'забран с почты', label:'Забран' },
    { key:'выдан', label:'Выдан' }
  ];
  const curIdx = Math.max(steps.findIndex(s=>s.key===o.status), 0);
  const progress = Math.max(0, Math.min(100, Math.round(curIdx * 100 / (steps.length - 1))));

  v.innerHTML = `<div class="section-title">Трекинг заказа #${o.id}</div>
    <section class="checkout">
      <div class="track-head">
        <div class="track-caption">Этап ${curIdx+1} из ${steps.length}</div>
        <div style="min-width:120px; text-align:right; font-weight:800">${statusTextClient(o.status)}</div>
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

function statusTextClient(s){
  if (s==='новый') return 'В обработке';
  if (s==='принят') return 'Подтверждён';
  if (s==='выдан') return 'Выдан';
  return String(s||'').charAt(0).toUpperCase() + String(s||'').slice(1);
}

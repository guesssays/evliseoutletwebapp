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
        <div class="cart-row">
          <div class="cart-img"><img src="${o.cart?.[0]?.images?.[0] || 'assets/placeholder.jpg'}"></div>
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

  const steps = [
    { key:'новый', label:'В обработке' },
    { key:'принят', label:'Принят администратором' },
    { key:'собирается в китае', label:'Собирается в Китае' },
    { key:'вылетел в узб', label:'Вылетел в Узбекистан' },
    { key:'на таможне', label:'На таможне' },
    { key:'на почте', label:'На почте' },
    { key:'забран с почты', label:'Забран с почты' },
    { key:'готов к отправке', label:'Готов к отправке' },
  ];
  const curIdx = Math.max(steps.findIndex(s=>s.key===o.status), 0);

  v.innerHTML = `<div class="section-title">Трекинг заказа #${o.id}</div>
    <section class="checkout">
      <div style="border:1px dashed #ddd;border-radius:16px;padding:14px">
        ${steps.map((s,i)=>`
          <div style="display:flex;align-items:center;gap:10px;margin:10px 0">
            <div style="width:12px;height:12px;border-radius:50%;${i<=curIdx?'background:#121111':'background:#ddd'}"></div>
            <div class="cart-title" style="font-size:16px">${s.label}</div>
          </div>`).join('')}
      </div>
      <a class="pill primary" href="#/orders">Назад к заказам</a>
    </section>`;
}

function statusTextClient(s){
  if (s==='новый') return 'В обработке';
  if (s==='принят') return 'Принят администратором';
  if (s==='готов к отправке') return 'Готов к отправке';
  // остальное — просто нормализуем регистр
  return String(s||'').charAt(0).toUpperCase() + String(s||'').slice(1);
}

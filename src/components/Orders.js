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
    window.lucide?.createIcons();
    return;
  }
  v.innerHTML = `<div class="section-title">Мои заказы</div>
    <section class="checkout">
      ${state.orders.map(o=>`
        <div class="cart-row">
          <div class="cart-img"><img src="${o.cart?.[0]?.image || o.cart?.[0]?.images?.[0] || 'assets/placeholder.jpg'}"></div>
          <div>
            <div class="cart-title">Заказ #${o.id}</div>
            <div class="cart-sub">${statusToText(o.status)}</div>
            <div class="cart-price">${priceFmt(o.total)}</div>
          </div>
          <a class="pill primary" href="#/track/${o.id}">Отследить</a>
        </div>`).join('')}
    </section>`;
}

export function renderTrack({id}){
  const o = state.orders.find(x=>String(x.id)===String(id));
  const v=document.getElementById('view');
  if(!o){ v.innerHTML='<div class="section-title">Трекинг</div><section class="checkout">Не найдено</section>'; return; }
  const steps=['packing','picked','in_transit','delivered'];
  const cur = steps.indexOf(o.status);
  v.innerHTML = `<div class="section-title">Трекинг заказа #${o.id}</div>
    <section class="checkout">
      <div class="cart-sub">Обновляется администратором вручную</div>
      <div style="border:1px dashed #ddd;border-radius:16px;padding:14px">
        ${steps.map((s,i)=>`
          <div style="display:flex;align-items:center;gap:10px;margin:10px 0">
            <div style="width:12px;height:12px;border-radius:50%;${i<=cur?'background:#121111':'background:#ddd'}"></div>
            <div class="cart-title" style="font-size:16px">${statusToText(s)}</div>
          </div>`).join('')}
      </div>
      <a class="pill primary" href="#/orders">Назад к заказам</a>
    </section>`;
}
function statusToText(s){
  return s==='packing'?'Упаковка': s==='picked'?'Передан курьеру': s==='in_transit'?'В пути': s==='delivered'?'Доставлен': s;
}

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

  const steps = [
    { key:'новый', label:'В обработке', sub:'Мы получили заказ и проверяем детали', icon:'clock' },
    { key:'принят', label:'Принят администратором', sub:'Заказ подтверждён, готовим к сборке', icon:'shield-check' },
    { key:'собирается в китае', label:'Собирается в Китае', sub:'Комплектуем посылку', icon:'boxes' },
    { key:'вылетел в узб', label:'Вылетел в Узбекистан', sub:'Посылка в авиадоставке', icon:'plane' },
    { key:'на таможне', label:'На таможне', sub:'Проходит таможенный контроль', icon:'badge-check' },
    { key:'на почте', label:'На почте', sub:'Готовится к выдаче', icon:'mail' },
    { key:'забран с почты', label:'Забран с почты', sub:'Заказ получен со склада', icon:'package-check' },
    { key:'готов к отправке', label:'Готов к отправке', sub:'Ожидает финальной доставки', icon:'truck' },
  ];
  const curIdx = Math.max(steps.findIndex(s=>s.key===o.status), 0);

  v.innerHTML = `<div class="section-title">Трекинг заказа #${o.id}</div>
    <section class="checkout">
      <div class="timeline">
        ${steps.map((s,i)=>`
          <div class="timeline-step ${i<curIdx?'is-done':''} ${i===curIdx?'is-current':''}">
            <span class="dot"></span>
            <div class="timeline-title">
              ${s.label}
              ${i===curIdx ? `<span class="pill small" style="margin-left:6px">текущий этап</span>` : ''}
            </div>
            <div class="timeline-sub">
              <i data-lucide="${s.icon}" style="width:14px;height:14px;vertical-align:-2px"></i>
              <span style="margin-left:6px">${s.sub}</span>
            </div>
          </div>`).join('')}
      </div>

      <div class="note" style="grid-template-columns:auto 1fr">
        <i data-lucide="info"></i>
        <div>
          <div class="note-title">Статусы обновляются администратором</div>
          <div class="note-sub">Как только этап изменится — вы получите уведомление в профиле.</div>
        </div>
      </div>

      <a class="pill primary" href="#/orders">Назад к заказам</a>
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();
}

function statusTextClient(s){
  if (s==='новый') return 'В обработке';
  if (s==='принят') return 'Принят администратором';
  if (s==='готов к отправке') return 'Готов к отправке';
  return String(s||'').charAt(0).toUpperCase() + String(s||'').slice(1);
}

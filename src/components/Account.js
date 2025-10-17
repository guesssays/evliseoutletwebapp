import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { priceFmt } from '../core/utils.js';
import { openModal, closeModal } from '../core/modal.js';

export function renderAccount(){
  const view = document.querySelector('#view');
  const u = state.tgUser;
  view.innerHTML = `
    <section class="section">
      <div class="h1">Account</div>
      <div class="row">
        <div class="sub">Вход: ${u ? '@'+(u.username ?? u.id) : 'Гость (зайдите из Telegram)'}</div>
      </div>
    </section>
    <section class="section">
      <div class="grid" style="grid-template-columns:1fr 1fr; gap:12px">
        <a class="card" href="#/account/orders"><div class="card-body"><div class="card-title">My Orders</div><div class="sub">Отслеживание</div></div></a>
        <a class="card" href="#/account/details"><div class="card-body"><div class="card-title">My Details</div><div class="sub">Профиль</div></div></a>
        <a class="card" href="#/favorites"><div class="card-body"><div class="card-title">Saved</div><div class="sub">Избранное</div></div></a>
        <a class="card" href="#/account/address/new"><div class="card-body"><div class="card-title">New Address</div><div class="sub">Доставка</div></div></a>
      </div>
    </section>`;
}

function ordersKey(){ return `ev_orders_${state.tgUser?.id ?? 'demo'}`; }

export function renderMyOrders(){
  const view = document.querySelector('#view');
  const list = JSON.parse(localStorage.getItem(ordersKey()) || '[]');
  const ongoing = list.filter(o=>o.status!=='Completed');
  const completed = list.filter(o=>o.status==='Completed');

  const orderCard = (o)=>`
    <div class="card" style="overflow:visible">
      <div class="card-body">
        <div class="row" style="justify-content:space-between">
          <div class="card-title">#${o.id}</div>
          <span class="chip ${o.status==='Completed'?'active':''}">${o.status}</span>
        </div>
        <div class="sub" style="margin-top:6px">${new Date(o.ts).toLocaleString()}</div>
        <div class="hr"></div>
        ${o.cart.slice(0,2).map(i=>`
          <div class="row" style="justify-content:space-between; align-items:center">
            <div class="row" style="gap:10px">
              <img src="${i.image}" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid #E7E7E7">
              <div><div style="font-weight:800">${i.title}</div><div class="sub">${i.qty} × ${priceFmt(i.price)}</div></div>
            </div>
            <div style="font-weight:900">${priceFmt(i.price*i.qty)}</div>
          </div>
        `).join('')}
        ${o.cart.length>2?`<div class="sub" style="margin-top:6px">…и ещё ${o.cart.length-2} поз.</div>`:''}
        <div class="hr"></div>
        <div class="row" style="justify-content:space-between">
          <div class="sub">Итого</div><div style="font-weight:900">${priceFmt(o.total)}</div>
        </div>
        ${o.status==='Completed'? `<div class="row" style="margin-top:10px"><button class="btn" data-review="${o.id}">Leave Review</button></div>`:''}
      </div>
    </div>`;

  view.innerHTML = `
    <section class="section">
      <div class="h1">My Orders</div>
      <div class="toolbar" role="tablist">
        <a href="#/account/orders" class="chip active">Ongoing</a>
        <a href="#/account/orders?tab=completed" class="chip">Completed</a>
      </div>
    </section>
    <section class="section" id="ordersWrap">${ongoing.map(orderCard).join('') || `<div class="sub">Нет активных заказов</div>`}</section>`;

  view.querySelectorAll('[data-review]').forEach(btn=>{
    btn.onclick = ()=> openReviewModal(btn.getAttribute('data-review'));
  });

  if (window.lucide?.createIcons) lucide.createIcons();

  // если в урле ?tab=completed — показать вторую вкладку
  const tab = new URLSearchParams((location.hash.split('?')[1]||'')).get('tab');
  if (tab==='completed'){
    const wrap = document.getElementById('ordersWrap');
    wrap.innerHTML = completed.map(orderCard).join('') || `<div class="sub">Пусто</div>`;
  }
}

function openReviewModal(orderId){
  openModal({
    title:'Leave a Review',
    body: `
      <div class="h2">Как был заказ?</div>
      <div style="font-size:28px">⭐⭐⭐⭐⭐</div>
      <textarea id="revText" class="note-input" rows="4" placeholder="Write your review..."></textarea>
    `,
    actions: [
      { label: 'Cancel', variant:'secondary', onClick: closeModal },
      { label: 'Submit', onClick: ()=>{ closeModal(); } }
    ]
  });
}

export function renderMyDetails(){
  const u = state.tgUser;
  const view = document.querySelector('#view');
  view.innerHTML = `
    <section class="section">
      <div class="h1">My Details</div>
      <div class="card">
        <div class="card-body">
          <label class="sub">Full Name</label>
          <input class="note-input" value="${(u?.first_name||'')+' '+(u?.last_name||'')}" />
          <div class="row" style="gap:12px; margin-top:12px">
            <button class="btn">Submit</button>
          </div>
        </div>
      </div>
    </section>`;
}

export function renderNewAddress(){
  const view = document.querySelector('#view');
  view.innerHTML = `
    <section class="section">
      <div class="h1">New Address</div>
      <div class="card">
        <div class="card-body">
          <label class="sub">Address Nickname</label>
          <select class="note-input"><option>Home</option><option>Office</option></select>
          <div class="hr"></div>
          <label class="sub">Full Address</label>
          <textarea class="note-input" rows="3" placeholder="Enter your full address..."></textarea>
          <div class="row" style="margin-top:12px"><button class="btn">Add</button></div>
        </div>
      </div>
    </section>`;
}

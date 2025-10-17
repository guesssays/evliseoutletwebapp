import { state, persistAddresses } from '../core/state.js';
import { openModal, closeModal } from '../core/modal.js';
import { toast } from '../core/toast.js';

export function renderAccount(){
  const view = document.querySelector('#view');
  const u = state.user;
  view.innerHTML = `
    <section class="section">
      <div class="section-title">Профиль</div>
      <div class="grid" style="grid-template-columns:1fr 1fr; gap:12px">
        <a class="card" href="#/orders"><div class="card-body"><div class="title">Мои заказы</div><div class="subtitle">Статусы</div></div></a>
        <a class="card" href="#/account/addresses"><div class="card-body"><div class="title">Адреса</div><div class="subtitle">Доставка</div></div></a>
        <a class="card" href="#/favorites"><div class="card-body"><div class="title">Избранное</div><div class="subtitle">Ваши товары</div></div></a>
        <a class="card" href="#/account/settings"><div class="card-body"><div class="title">Настройки</div><div class="subtitle">Тема/о приложении</div></div></a>
        <a class="card" href="#/faq"><div class="card-body"><div class="title">FAQ</div><div class="subtitle">Ответы на вопросы</div></div></a>
      </div>
    </section>`;
  window.lucide?.createIcons();
}

export function renderAddresses(){
  const v=document.getElementById('view');
  const list = state.addresses.list;
  v.innerHTML = `
    <div class="section-title">Адреса</div>
    <section class="checkout">
      ${list.map(a=>`
        <div class="cart-row">
          <div class="cart-img"><img src="assets/map-pin.png" alt=""></div>
          <div>
            <div class="cart-title">${a.nickname}${a.id===state.addresses.defaultId ? ' • по умолчанию' : ''}</div>
            <div class="cart-sub">${a.address}</div>
          </div>
          <div class="qty-mini">
            <button class="pill" data-def="${a.id}">${a.id===state.addresses.defaultId?'Выбрано':'Сделать осн.'}</button>
            <button class="pill" data-del="${a.id}">Удалить</button>
          </div>
        </div>`).join('')}
      <div><a class="pill primary" id="addAddr">Добавить адрес</a></div>
    </section>`;

  v.querySelectorAll('[data-def]').forEach(b=> b.onclick=()=>{ state.addresses.defaultId=b.getAttribute('data-def'); persistAddresses(); renderAddresses(); });
  v.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{
    const id=b.getAttribute('data-del');
    state.addresses.list = state.addresses.list.filter(x=>x.id!==id);
    if (state.addresses.defaultId===id) state.addresses.defaultId = state.addresses.list[0]?.id || null;
    persistAddresses(); renderAddresses();
  });
  document.getElementById('addAddr').onclick=()=> openAddrModal();
}

function openAddrModal(){
  let nickname='Дом', address='';
  openModal({
    title:'Новый адрес',
    body:`<label class="sub">Название</label>
          <input id="an" class="search" value="${nickname}">
          <div class="hr" style="margin:8px 0"></div>
          <label class="sub">Полный адрес</label>
          <textarea id="aa" class="search" rows="3" placeholder="Введите адрес..."></textarea>`,
    actions:[
      {label:'Отмена', onClick: closeModal},
      {label:'Добавить', variant:'primary', onClick: ()=>{
        nickname = document.getElementById('an').value.trim() || 'Адрес';
        address = document.getElementById('aa').value.trim();
        if (!address){ toast('Введите адрес'); return; }
        const id=String(Date.now());
        state.addresses.list.push({id, nickname, address});
        if (!state.addresses.defaultId) state.addresses.defaultId=id;
        persistAddresses(); closeModal(); renderAddresses();
      }}
    ]
  });
}

export function renderSettings(){
  const v=document.getElementById('view');
  v.innerHTML = `
    <div class="section-title">Настройки</div>
    <section class="checkout">
      <div class="cart-row">
        <div class="cart-img"><img src="assets/info.png" alt=""></div>
        <div>
          <div class="cart-title">Версия</div>
          <div class="cart-sub">WebApp 1.0</div>
        </div>
      </div>
      <div class="cart-row">
        <div class="cart-img"><img src="assets/brush.png" alt=""></div>
        <div>
          <div class="cart-title">Тема интерфейса</div>
          <div class="cart-sub">Светлая (по умолчанию)</div>
        </div>
      </div>
      <div class="cart-row">
        <div class="cart-img"><img src="assets/help.png" alt=""></div>
        <div>
          <div class="cart-title">Поддержка</div>
          <div class="cart-sub">Напишите менеджеру в Telegram после оформления заказа</div>
        </div>
      </div>
    </section>`;
}

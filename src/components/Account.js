import { state, persistAddresses } from '../core/state.js';
import { canAccessAdmin } from '../core/auth.js';

export function renderAccount(){
  const v=document.getElementById('view');
  const u = state.user;

  const isAdmin = canAccessAdmin();

  v.innerHTML = `
    <section class="section">
      <div class="section-title">Личный кабинет</div>
      <div class="account-card">
        <div class="avatar">${(u?.first_name||'Г')[0]}</div>
        <div class="info">
          <div class="name">${u ? `${u.first_name||''} ${u.last_name||''}`.trim() || u.username || 'Пользователь' : 'Гость'}</div>
          <div class="muted">${u ? 'Авторизован через Telegram' : 'Анонимный режим'}</div>
        </div>
      </div>

      <nav class="menu">
        <a class="menu-item" href="#/orders"><i data-lucide="package"></i><span>Мои заказы</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/addresses"><i data-lucide="map-pin"></i><span>Адреса доставки</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/favorites"><i data-lucide="heart"></i><span>Избранное</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/faq"><i data-lucide="help-circle"></i><span>FAQ</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/settings"><i data-lucide="settings"></i><span>Настройки</span><i data-lucide="chevron-right" class="chev"></i></a>
        ${isAdmin ? `<a class="menu-item" href="#/admin"><i data-lucide="shield-check"></i><span>Админка</span><i data-lucide="chevron-right" class="chev"></i></a>` : ''}
      </nav>
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();
}

export function renderAddresses(){
  const v=document.getElementById('view');
  const list = state.addresses.list;
  v.innerHTML = `
    <section class="section">
      <div class="section-title">Адреса доставки</div>
      <div class="addr-list">
        ${list.map(a=>`
          <label class="addr">
            <input type="radio" name="addr" ${a.id===state.addresses.defaultId?'checked':''} data-id="${a.id}">
            <div class="addr-body">
              <div class="addr-title">${a.nickname}</div>
              <div class="addr-sub">${a.address}</div>
            </div>
          </label>
        `).join('')}
      </div>
      <div class="addr-actions">
        <button id="addAddr" class="pill primary">Добавить адрес</button>
        <button id="saveAddr" class="pill">Сохранить</button>
      </div>
    </section>`;

  document.getElementById('addAddr').onclick=()=>{
    const nickname = prompt('Название (например, Дом)');
    const address = prompt('Полный адрес');
    if (!nickname || !address) return;
    const id = Date.now();
    state.addresses.list.push({ id, nickname, address });
    if (!state.addresses.defaultId) state.addresses.defaultId = id;
    persistAddresses();
    renderAddresses();
  };
  document.getElementById('saveAddr').onclick=()=>{
    const r = document.querySelector('input[name="addr"]:checked');
    if (r){ state.addresses.defaultId = Number(r.getAttribute('data-id')); persistAddresses(); }
    history.back();
  };
}

export function renderSettings(){
  const v=document.getElementById('view');
  v.innerHTML = `
    <section class="section">
      <div class="section-title">Настройки</div>
      <div class="menu">
        <div class="menu-item"><i data-lucide="moon"></i><span>Тема устройства</span></div>
      </div>
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();
}

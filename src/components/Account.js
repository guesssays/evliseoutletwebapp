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
  const list = state.addresses.list.slice();
  const defId = state.addresses.defaultId;

  v.innerHTML = `
    <section class="section">
      <div class="section-title">Адреса доставки</div>

      <!-- локальные стили — кнопки в столбик справа -->
      <style>
        .addr-list .addr{
          display:grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          column-gap: 10px;
          padding: 10px 12px;
          border: 1px solid var(--border, rgba(0,0,0,.08));
          border-radius: 10px;
          margin-bottom: 8px;
          background: var(--card, rgba(0,0,0,.03));
        }
        .addr-list .addr input[type="radio"]{
          margin: 0 4px 0 0;
          align-self: start;
        }
        .addr-list .addr-body{
          min-width: 0;
        }
        .addr-list .addr-title{
          font-weight: 700;
          line-height: 1.2;
        }
        .addr-list .addr-sub{
          color: var(--muted, #777);
          font-size: .92rem;
          line-height: 1.3;
          word-break: break-word;
        }
        .addr-list .addr-ops{
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-end;
          justify-content: center;
        }
        .addr-list .addr-ops .icon-btn{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:32px; height:32px;
          border-radius:8px;
          border:1px solid var(--border, rgba(0,0,0,.08));
          background: var(--btn, #fff);
        }
        .addr-list .addr-ops .icon-btn.danger{
          border-color: rgba(220, 53, 69, .35);
          background: rgba(220, 53, 69, .06);
        }
        @media (hover:hover){
          .addr-list .addr-ops .icon-btn:hover{
            filter: brightness(0.98);
          }
        }
      </style>

      <div class="addr-list">
        ${list.length ? list.map(a=>`
          <label class="addr">
            <input type="radio" name="addr" ${a.id===defId?'checked':''} data-id="${a.id}" aria-label="Выбрать адрес по умолчанию">
            <div class="addr-body">
              <div class="addr-title">${escapeHtml(a.nickname||'Без названия')}</div>
              <div class="addr-sub">${escapeHtml(a.address||'')}</div>
            </div>
            <div class="addr-ops" aria-label="Действия с адресом">
              <button class="icon-btn edit" data-id="${a.id}" title="Редактировать" aria-label="Редактировать адрес">
                <i data-lucide="pencil"></i>
              </button>
              <button class="icon-btn danger delete" data-id="${a.id}" title="Удалить" aria-label="Удалить адрес">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </label>
        `).join('') : `
          <div class="muted" style="padding:8px 2px">Адресов пока нет — добавьте первый.</div>
        `}
      </div>

      <div class="addr-actions">
        <button id="addAddr" class="pill primary">Добавить адрес</button>
        <button id="saveAddr" class="pill">Сохранить</button>
      </div>
    </section>`;

  // делегирование кликов на список (редактирование/удаление)
  const listEl = v.querySelector('.addr-list');
  if (listEl){
    listEl.addEventListener('click', (e)=>{
      const delBtn = e.target.closest('.delete');
      const editBtn = e.target.closest('.edit');
      if (!delBtn && !editBtn) return;

      const id = Number((delBtn||editBtn).getAttribute('data-id'));
      const idx = state.addresses.list.findIndex(x => Number(x.id)===id);
      if (idx === -1) return;

      if (editBtn){
        const cur = state.addresses.list[idx];
        const nickname = prompt('Название (например, Дом)', cur.nickname || '');
        if (nickname === null) return; // отмена
        const address = prompt('Полный адрес', cur.address || '');
        if (address === null) return; // отмена
        state.addresses.list[idx] = { ...cur, nickname: (nickname||'').trim(), address: (address||'').trim() };
        persistAddresses();
        renderAddresses();
        return;
      }

      if (delBtn){
        const cur = state.addresses.list[idx];
        const ok = confirm(`Удалить адрес "${cur.nickname||'Без названия'}"?`);
        if (!ok) return;
        state.addresses.list.splice(idx, 1);

        // если удалили адрес по умолчанию — поставить другой
        if (Number(state.addresses.defaultId) === id){
          state.addresses.defaultId = state.addresses.list[0]?.id ?? null;
        }
        persistAddresses();
        renderAddresses();
        return;
      }
    });
  }

  // добавить новый
  document.getElementById('addAddr').onclick=()=>{
    const nickname = prompt('Название (например, Дом)');
    if (nickname === null) return;
    const address = prompt('Полный адрес');
    if (address === null) return;
    if (!nickname.trim() || !address.trim()) return;
    const id = Date.now();
    state.addresses.list.push({ id, nickname: nickname.trim(), address: address.trim() });
    if (!state.addresses.defaultId) state.addresses.defaultId = id;
    persistAddresses();
    renderAddresses();
  };

  // сохранить выбранный адрес по умолчанию
  document.getElementById('saveAddr').onclick=()=>{
    const r = v.querySelector('input[name="addr"]:checked');
    if (r){ state.addresses.defaultId = Number(r.getAttribute('data-id')); persistAddresses(); }
    history.back();
  };

  window.lucide?.createIcons && lucide.createIcons();
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

/* utils */
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

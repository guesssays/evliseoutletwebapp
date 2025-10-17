import { canAccessAdmin, isAdminByTelegram, unlockAdminWithPasscode, logoutAdmin } from '../core/auth.js';

export function renderAdminLogin(){
  const v = document.getElementById('view');

  const tgOk = isAdminByTelegram();
  const hint = tgOk
    ? 'Вы авторизованы в Telegram как администратор. Можете перейти в админ-панель.'
    : 'Введите секретный код администратора, чтобы получить доступ.';

  v.innerHTML = `
    <section class="section">
      <div class="section-title">Вход в админ-панель</div>
      <div class="notes" style="margin:0 18px">
        <div class="note">
          <i data-lucide="shield-check"></i>
          <div>
            <div class="note-title">Защищённый доступ</div>
            <div class="note-sub">${hint}</div>
          </div>
          <div class="time" style="min-width:200px; display:grid; gap:8px; justify-items:end">
            ${tgOk ? `<button id="goAdmin" class="pill primary">Открыть админку</button>` : ''}
            <button id="btnLogout" class="pill" title="Сбросить локальную разблокировку">Сбросить доступ</button>
          </div>
        </div>
      </div>

      ${tgOk ? '' : `
      <div class="section" style="margin-top:12px">
        <div class="grid grid-compact">
          <input id="admCode" class="search" placeholder="Секретный код" type="password" />
          <button id="admEnter" class="pill primary">Войти</button>
        </div>
        <div id="admError" class="muted" style="color:#ff5966; margin-top:8px; display:none">Неверный код</div>
      </div>`}
    </section>
  `;
  window.lucide?.createIcons && lucide.createIcons();

  // «Открыть админку» — просто джамп на #/admin, роутер покажет предупреждение и переведёт UI в админ режим
  document.getElementById('goAdmin')?.addEventListener('click', ()=>{
    location.hash = '#/admin';
  });

  document.getElementById('btnLogout')?.addEventListener('click', ()=>{
    logoutAdmin();
    location.hash = '#/admin-login';
  });

  const enterBtn = document.getElementById('admEnter');
  if (enterBtn){
    enterBtn.addEventListener('click', ()=>{
      const code = (document.getElementById('admCode')?.value || '').trim();
      const ok = unlockAdminWithPasscode(code);
      if (!ok){
        const e = document.getElementById('admError');
        if (e){ e.style.display='block'; }
        return;
      }
      location.hash = '#/admin'; // роутер покажет предупреждение
    });
  }
}

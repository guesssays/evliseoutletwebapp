// src/views/adminLogin.js

import { canAccessAdmin, isAdminByTelegram, unlockAdminWithPasscode, logoutAdmin } from '../core/auth.js';
import { setAdminToken, getAdminToken } from '../core/orders.js';

export function renderAdminLogin(){
  const v = document.getElementById('view');

  // Если токен инжектнули через window — сразу положим его в localStorage
  try {
    if (typeof window !== 'undefined') {
      const injected = window.__ADMIN_API_TOKEN__ || window.ADMIN_API_TOKEN;
      if (injected && !getAdminToken()) setAdminToken(String(injected));
    }
  } catch {}

  const tgOk = isAdminByTelegram();
  const hint = tgOk
    ? 'Вы авторизованы в Telegram как администратор. Можете перейти в админ-панель.'
    : 'Введите секретный код администратора, чтобы получить доступ. При необходимости укажите внутр. токен API.';

  const existingToken = getAdminToken();

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
          <div class="time" style="min-width:260px; display:grid; gap:8px; justify-items:end">
            ${tgOk ? `<button id="goAdmin" class="pill primary">Открыть админку</button>` : ''}
            <button id="btnLogout" class="pill" title="Сбросить локальную разблокировку и токен">Сбросить доступ</button>
          </div>
        </div>
      </div>

      ${tgOk ? '' : `
      <div class="section" style="margin-top:12px">
        <div class="grid grid-compact" style="gap:8px">
          <input id="admCode" class="search" placeholder="Секретный код" type="password" />
          <input id="admToken" class="search" placeholder="Админ токен API (если требуется)" type="password" value="${existingToken ? '••••••••' : ''}" />
          <div style="display:flex; gap:8px; justify-content:flex-end">
            <button id="saveToken" class="pill">Сохранить токен</button>
            <button id="admEnter" class="pill primary">Войти</button>
          </div>
        </div>
        <div id="admError" class="muted" style="color:#ff5966; margin-top:8px; display:none">Неверный код</div>
        <div id="admTokenOk" class="muted" style="color:#2bb673; margin-top:8px; display:none">Токен сохранён</div>
      </div>`}
    </section>
  `;
  window.lucide?.createIcons && lucide.createIcons();

  // «Открыть админку» — просто джамп на #/admin, роутер покажет предупреждение и переведёт UI в админ режим
  document.getElementById('goAdmin')?.addEventListener('click', ()=>{
    location.hash = '#/admin';
  });

  document.getElementById('btnLogout')?.addEventListener('click', ()=>{
    try { setAdminToken(''); } catch {}
    logoutAdmin();
    location.hash = '#/admin-login';
  });

  const saveTokenBtn = document.getElementById('saveToken');
  if (saveTokenBtn){
    saveTokenBtn.addEventListener('click', ()=>{
      const raw = (document.getElementById('admToken')?.value || '').trim();
      if (raw && raw !== '••••••••') {
        setAdminToken(raw);
        const ok = document.getElementById('admTokenOk');
        if (ok) ok.style.display = 'block';
      }
    });
  }

  const enterBtn = document.getElementById('admEnter');
  if (enterBtn){
    enterBtn.addEventListener('click', ()=>{
      const code = (document.getElementById('admCode')?.value || '').trim();
      // если пользователь ввёл токен — сохраним его
      const maybeToken = (document.getElementById('admToken')?.value || '').trim();
      if (maybeToken && maybeToken !== '••••••••') {
        setAdminToken(maybeToken);
      } else {
        // попробуем подтянуть из window, если ещё не сохранили
        try {
          const injected = window.__ADMIN_API_TOKEN__ || window.ADMIN_API_TOKEN;
          if (injected && !getAdminToken()) setAdminToken(String(injected));
        } catch {}
      }

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

// src/components/Account.js
import { state, persistAddresses } from '../core/state.js';
import { canAccessAdmin } from '../core/auth.js';
import { getUID } from '../core/state.js';
import { makeReferralLink } from '../core/loyalty.js';

const OP_CHAT_URL = 'https://t.me/evliseorder';

/* ===== Локальные ключи и работа с кошельком/рефералами ===== */
function k(base){ try{ const uid=getUID?.()||'guest'; return `${base}__${uid}`; }catch{ return `${base}__guest`; } }

/* — кошелёк баллов — */
const POINTS_MATURITY_MS  = 24*60*60*1000;
function readWallet(){
  try{
    const w = JSON.parse(localStorage.getItem(k('points_wallet')) || '{}');
    return {
      available: Math.max(0, Number(w.available||0)|0),
      pending: Array.isArray(w.pending) ? w.pending : [],
      history: Array.isArray(w.history) ? w.history : [],
    };
  }catch{ return { available:0, pending:[], history:[] }; }
}
function writeWallet(w){ localStorage.setItem(k('points_wallet'), JSON.stringify(w||{available:0,pending:[],history:[]})); }
function settleMatured(){
  const w = readWallet();
  const now = Date.now();
  let changed=false;
  const keep=[];
  for (const p of w.pending){
    if ((p.tsUnlock||0)<=now){
      w.available += Math.max(0, Number(p.pts)||0);
      w.history.unshift({ ts: now, type:'accrue', pts: p.pts|0, reason: p.reason||'Кэшбек', orderId: p.orderId||null });
      changed=true;
    }else keep.push(p);
  }
  if (changed){ w.pending = keep; writeWallet(w); }
  return w;
}

/* — реф-профиль — */
function readRefProfile(){ try{ return JSON.parse(localStorage.getItem(k('ref_profile')) || '{}'); }catch{ return {}; } }
function writeRefProfile(v){ localStorage.setItem(k('ref_profile'), JSON.stringify(v||{})); }

/* — реф-ссылка (теперь T.ME deep link) — */
function getReferralLink(){
  return makeReferralLink();
}

/* — список моих рефералов/статистика — */
function readMyReferrals(){
  try{
    const raw = localStorage.getItem(k('my_referrals')) || '[]';
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function writeMyReferrals(arr){ localStorage.setItem(k('my_referrals'), JSON.stringify(Array.isArray(arr)?arr:[])); }

export function renderAccount(){
  try{
    document.querySelector('.app-header')?.classList.remove('hidden');
    const fix = document.getElementById('productFixHdr');
    if (fix){ fix.classList.remove('show'); fix.setAttribute('aria-hidden','true'); }
  }catch{}

  // ✅ фикс активной вкладки в таббаре
  window.setTabbarMenu?.('account');

  const v=document.getElementById('view');
  const u = state.user;
  const isAdmin = canAccessAdmin();

  const w = settleMatured();
  const ref = readRefProfile();
  const hasBoost = !!ref.firstOrderBoost && !ref.firstOrderDone;

  v.innerHTML = `
    <section class="section">
      <div class="section-title">Личный кабинет</div>
      <div class="account-card">
        <div class="avatar">${(u?.first_name||u?.username||'Г').toString().slice(0,1)}</div>
        <div class="info">
          <div class="name">${u ? `${u.first_name||''} ${u.last_name||''}`.trim() || u.username || 'Пользователь' : 'Гость'}</div>
          <div class="muted">${u ? 'Авторизован через Telegram' : 'Анонимный режим'}</div>
        </div>
      </div>

      <div class="cb-box" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">Баланс баллов</div>
          <div style="font-weight:800;font-size:20px">${(w.available|0).toLocaleString('ru-RU')}</div>
        </div>
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">Ожидает начисления</div>
          <div style="font-weight:800;font-size:20px">${w.pending.reduce((s,p)=>s+(p?.pts|0),0).toLocaleString('ru-RU')}</div>
        </div>
      </div>

      ${hasBoost ? `
        <div class="note" style="display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start;margin:8px 0;padding:10px;border:1px dashed #d97706;border-radius:12px;background:rgba(245,158,11,.06)">
          <i data-lucide="zap"></i>
          <div class="muted">
            У вас активен бонус <b>x2 кэшбек</b> на первый заказ по реф-ссылке.
          </div>
        </div>` : ''}

      <nav class="menu">
        <a class="menu-item" href="#/orders"><i data-lucide="package"></i><span>Мои заказы</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/cashback"><i data-lucide="coins"></i><span>Мой кэшбек</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/referrals"><i data-lucide="users"></i><span>Мои рефералы</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/addresses"><i data-lucide="map-pin"></i><span>Адреса доставки</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/favorites"><i data-lucide="heart"></i><span>Избранное</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/faq"><i data-lucide="help-circle"></i><span>Помощь</span><i data-lucide="chevron-right" class="chev"></i></a>
        ${isAdmin ? `<a class="menu-item" href="#/admin"><i data-lucide="shield-check"></i><span>Админка</span><i data-lucide="chevron-right" class="chev"></i></a>` : ''}
      </nav>

      <div style="margin-top:12px;display:flex;gap:10px">
        <button id="supportBtn" class="pill" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px">
          <i data-lucide="message-circle"></i>
          <span>Поддержка</span>
        </button>
      </div>
    </section>`;
  window.lucide?.createIcons && lucide.createIcons();

  document.getElementById('supportBtn')?.addEventListener('click', ()=>{
    openExternal(OP_CHAT_URL);
  });

  document.querySelectorAll('.menu a').forEach(a=>{
    a.addEventListener('click', ()=> window.setTabbarMenu?.('account'));
  });
}

/* ====== МОЙ КЭШБЕК ====== */
export function renderCashback(){
  window.setTabbarMenu?.('account');
  const v=document.getElementById('view');
  const w = settleMatured();

  const rows = (w.history||[]).slice(0,50).map(h=>{
    const sign = h.pts>=0 ? '+' : '';
    const dt = new Date(h.ts||Date.now());
    const d  = `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    return `
      <tr>
        <td>${d}</td>
        <td>${escapeHtml(h.reason||'')}</td>
        <td style="text-align:right"><b>${sign}${(h.pts|0).toLocaleString('ru-RU')}</b></td>
      </tr>
    `;
  }).join('');

  const pend = (w.pending||[]).map(p=>{
    const left = Math.max(0, (p.tsUnlock||0) - Date.now());
    const hrs = Math.ceil(left / (60*60*1000));
    return `<li>+${(p.pts|0).toLocaleString('ru-RU')} баллов — через ~${hrs} ч (${escapeHtml(p.reason||'')})</li>`;
  }).join('');

  v.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAcc"><i data-lucide="chevron-left"></i></button>
        Мой кэшбек
      </div>

      <div class="stat-cb" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 10px">
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">Баланс</div>
          <div style="font-weight:800;font-size:22px">${(w.available|0).toLocaleString('ru-RU')}</div>
        </div>
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">Ожидает (24ч)</div>
          <div style="font-weight:800;font-size:22px">${w.pending.reduce((s,p)=>s+(p?.pts|0),0).toLocaleString('ru-RU')}</div>
        </div>
      </div>

      ${pend ? `
        <div class="subsection-title">Ожидающие начисления</div>
        <ul class="muted mini" style="margin:6px 0 10px">${pend}</ul>
      ` : ''}

      <div class="subsection-title">История</div>
      <div class="table-wrap">
        <table class="size-table">
          <thead>
            <tr><th>Дата</th><th>Событие</th><th style="text-align:right">Баллы</th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="3" class="muted">Пока пусто</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('backAcc')?.addEventListener('click', ()=> history.back());
}

/* ====== МОИ РЕФЕРАЛЫ ====== */
export function renderReferrals(){
  window.setTabbarMenu?.('account');

  const v=document.getElementById('view');
  const link = getReferralLink();
  const arr = readMyReferrals();
  const monthKey = new Date().toISOString().slice(0,7);
  const monthCount = arr.filter(x => (x.month||'')===monthKey).length;

  v.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAcc"><i data-lucide="chevron-left"></i></button>
        Мои рефералы
      </div>

      <div class="ref-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px;background:var(--card,rgba(0,0,0,.03));display:grid;gap:8px">
        <div class="muted mini">Ваша реф-ссылка</div>
        <div class="input" style="overflow:auto;user-select:all">${escapeHtml(link)}</div>
        <div class="muted mini">Первый заказ по этой ссылке даёт рефералу x2 кэшбек, а вам — 5% с каждого его заказа. Лимит — не более 10 новых рефералов в месяц.</div>
        <div class="muted mini">В этом месяце новых рефералов: <b>${monthCount}</b> / 10</div>
      </div>

      <div class="subsection-title" style="margin-top:12px">Список рефералов</div>
      <div class="table-wrap">
        <table class="size-table">
          <thead><tr><th>#</th><th>UID</th><th>Когда добавлен</th></tr></thead>
          <tbody>
            ${arr.length ? arr.map((r,i)=>{
              const d = new Date(r.ts||0);
              const dt = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
              return `<tr><td>${i+1}</td><td>${escapeHtml(String(r.uid||''))}</td><td>${dt}</td></tr>`;
            }).join('') : `<tr><td colspan="3" class="muted">Пока нет</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('backAcc')?.addEventListener('click', ()=> history.back());
}

export function renderAddresses(){
  // ✅ фикс активной вкладки в таббаре
  window.setTabbarMenu?.('account');

  const v=document.getElementById('view');
  const list = state.addresses.list.slice();
  const defId = state.addresses.defaultId;

  v.innerHTML = `
    <section class="section">
      <div class="section-title">Адреса доставки</div>

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
          align-self: center;
        }
        .addr-list .addr-body{ min-width: 0; }
        .addr-list .addr-title{ font-weight: 700; line-height: 1.2; }
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
          display:inline-flex; align-items:center; justify-content:center;
          width:32px; height:32px; border-radius:8px;
          border:1px solid var(--border, rgba(0,0,0,.08));
          background: var(--btn, #fff);
        }
        .addr-list .addr-ops .icon-btn.danger{
          border-color: rgba(220, 53, 69, .35);
          background: rgba(220, 53, 69, .06);
        }
        @media (hover:hover){
          .addr-list .addr-ops .icon-btn:hover{ filter: brightness(0.98); }
        }
        .addr-actions{ display:flex; gap:10px; margin-top:10px; }
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
        if (nickname === null) return;
        const address = prompt('Полный адрес', cur.address || '');
        if (address === null) return;
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
        if (Number(state.addresses.defaultId) === id){
          state.addresses.defaultId = state.addresses.list[0]?.id ?? null;
        }
        persistAddresses();
        renderAddresses();
        return;
      }
    });
  }

  document.getElementById('addAddr')?.addEventListener('click', ()=>{
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
  });

  document.getElementById('saveAddr')?.addEventListener('click', ()=>{
    const r = v.querySelector('input[name="addr"]:checked');
    if (r){ state.addresses.defaultId = Number(r.getAttribute('data-id')); persistAddresses(); }
    history.back();
  });

  window.lucide?.createIcons && lucide.createIcons();
}

// Настройки оставлены для прямого URL, но не показываются в меню
export function renderSettings(){
  // ✅ фикс активной вкладки в таббаре
  window.setTabbarMenu?.('account');

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

/* helpers */
function openExternal(url){
  try{
    const tg = window?.Telegram?.WebApp;
    if (tg?.openTelegramLink){ tg.openTelegramLink(url); return; }
    if (tg?.openLink){ tg.openLink(url, { try_instant_view:false }); return; }
  }catch{}
  window.open(url, '_blank', 'noopener');
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

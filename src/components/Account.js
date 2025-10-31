// src/components/Account.js
import { state, persistAddresses, getUID } from '../core/state.js';
import { canAccessAdmin } from '../core/auth.js';
import { makeReferralLink, fetchMyLoyalty, getLocalLoyalty } from '../core/loyalty.js';
import { notifyCashbackMatured } from '../core/botNotify.js'; // ✅ бот-уведомление о дозревшем кэшбеке

const OP_CHAT_URL = 'https://t.me/evliseorder';
const DEFAULT_AVATAR = 'assets/user-default.png'; // ← путь к дефолтной аватарке
const AVATAR_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/* ===== Локальные ключи и работа с кошельком/рефералами ===== */
function k(base){ try{ const uid=getUID?.()||'guest'; return `${base}__${uid}`; }catch{ return `${base}__guest`; } }

/* — кошелёк баллов (локальные функции оставлены как вспомогательные, но не используются для отображения) — */
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

/** Перенос дозревших баллов + уведомления (in-app + бот)
 *  ⚠️ Не используется в UI — баланс берём с сервера, оставлено для совместимости
 */
function settleMatured(){
  const w = readWallet();
  const now = Date.now();
  let changed=false;
  const keep=[];
  let maturedSum = 0;
  for (const p of w.pending){
    if ((p.tsUnlock||0)<=now){
      const add = Math.max(0, Number(p.pts)||0);
      w.available += add;
      maturedSum += add;
      w.history.unshift({ ts: now, type:'accrue', pts: p.pts|0, reason: p.reason||'Кэшбек', orderId: p.orderId||null });
      changed=true;
    }else keep.push(p);
  }
  if (changed){
    w.pending = keep;
    writeWallet(w);
    // In-app уведомление
    try{
      const uid = getUID?.() || 'guest';
      postAppNotif(uid, {
        icon: 'coins',
        title: 'Кэшбек доступен для оплаты',
        sub: `+${maturedSum.toLocaleString('ru-RU')} баллов — можно использовать при оформлении заказа.`,
      });
    }catch{}
    // Бот-уведомление
    try{
      notifyCashbackMatured(getUID?.(), { text: `✅ Кэшбек доступен: +${maturedSum.toLocaleString('ru-RU')} баллов. Используйте их при оплате.` });
    }catch{}
  }
  return w;
}

/* — реф-профиль — */
function readRefProfile(){ try{ return JSON.parse(localStorage.getItem(k('ref_profile')) || '{}'); }catch{ return {}; } }

/* — реф-ссылка (t.me deeplink) — */
function getReferralLink(){
  return makeReferralLink();
}

/* — список моих рефералов/статистика (локальный кеш) — */
function readMyReferrals(){
  try{
    const raw = localStorage.getItem(k('my_referrals')) || '[]';
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}

/* ===== Telegram helpers ===== */
function getTgInitDataRaw(){
  try {
    return typeof window?.Telegram?.WebApp?.initData === 'string'
      ? window.Telegram.WebApp.initData
      : '';
  } catch { return ''; }
}
function getTelegramUserId(u){
  return String(
    u?.id ??
    u?.tg_id ??
    u?.tgId ??
    u?.chatId ??
    u?.uid ??
    ''
  ).trim();
}
function getTelegramPhotoUrlFallback(){
  try{
    const p = window?.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url;
    return p ? String(p) : '';
  }catch{ return ''; }
}

/* ===== загрузка аватарки из Telegram через серверную функцию ===== */
function avatarCacheKey(){ return k('tg_avatar_url_v2'); } // v2 чтобы сбросить старый формат
function cacheAvatar(url, ts = Date.now()){
  try{
    const rec = { url: String(url||''), ts: Number(ts)||Date.now() };
    localStorage.setItem(avatarCacheKey(), JSON.stringify(rec));
  }catch{}
}
function readCachedAvatar(){
  try{
    const raw = localStorage.getItem(avatarCacheKey());
    if (!raw) return { url:'', ts:0 };
    const rec = JSON.parse(raw);
    if (!rec || !rec.url) return { url:'', ts:0 };
    // TTL
    if ((Date.now() - Number(rec.ts||0)) > AVATAR_TTL_MS) return { url:'', ts:0 };
    return { url: String(rec.url), ts: Number(rec.ts||0) };
  }catch{ return { url:'', ts:0 }; }
}

/** GET /.netlify/functions/user-avatar с X-Tg-Init-Data */
async function fetchTgAvatarUrl(uid){
  const url = `/.netlify/functions/user-avatar?uid=${encodeURIComponent(uid)}&t=${Date.now()}`;
  const headers = {};
  const initData = getTgInitDataRaw();
  if (initData) headers['X-Tg-Init-Data'] = initData;
  const r = await fetch(url, { method:'GET', headers });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok === false) throw new Error('avatar fetch failed');
  // сервер может вернуть {url: "..."} или {dataUrl: "..."} — поддержим оба
  return String(j?.url || j?.dataUrl || '');
}

/** Аккуратно проставить src с bust’ом кэша, если это не data: */
function setImgSrcWithBust(img, url, ts = Date.now()){
  if (!img) return;
  const isData = /^data:/i.test(url);
  const isBlob = /^blob:/i.test(url);
  if (isData || isBlob) { img.src = url; return; }
  try{
    const u = new URL(url, location.origin);
    u.searchParams.set('v', String(ts));
    img.src = u.toString();
  }catch{
    // на всякий — если это невалидный URL, просто присвоим
    img.src = url;
  }
}

function ensureImgErrorGuard(img, box){
  if (!img || img._evliseErrorBound) return;
  img._evliseErrorBound = true;
  img.addEventListener('error', () => {
    // чтобы не зациклиться — сравним с дефолтом
    const defAbs = (location.origin + '/' + DEFAULT_AVATAR).replace(/\/+$/, '');
    const cur = (img.src||'').replace(/\/+$/, '');
    if (cur !== defAbs && !cur.endsWith(`/${DEFAULT_AVATAR}`) && !cur.endsWith(DEFAULT_AVATAR)) {
      img.src = DEFAULT_AVATAR;
    }
    box?.classList.add('has-img');
  }, { passive: true });
}

/** Главный загрузчик аватара */
async function loadTgAvatar(){
  const u = state?.user || null;
  const uid = getTelegramUserId(u);
  const box = document.getElementById('avatarBox');
  const img = document.getElementById('tgAvatar');
  if (!img) return;

  // Безопасный обработчик ошибок (один раз)
  ensureImgErrorGuard(img, box);

  // Предустановим дефолт, если пусто
  if (!img.getAttribute('src')) {
    img.src = DEFAULT_AVATAR;
  }

  // Нет UID — показываем дефолт
  if (!uid) {
    img.src = DEFAULT_AVATAR;
    box?.classList.add('has-img');
    return;
  }

  // 1) Мгновенный фолбэк: из кэша (валидного), иначе photo_url из initData, иначе дефолт
  let instantUrl = '';
  const cached = readCachedAvatar();
  if (cached.url) instantUrl = cached.url;
  if (!instantUrl) {
    const ph = getTelegramPhotoUrlFallback();
    if (ph) instantUrl = ph;
  }
  if (!instantUrl) instantUrl = DEFAULT_AVATAR;
  setImgSrcWithBust(img, instantUrl, cached.ts || Date.now());
  box?.classList.add('has-img');

  // 2) Актуализируем с сервера (может вернуть более стабильный proxied URL)
  try{
    const fresh = await fetchTgAvatarUrl(uid);
    if (fresh) {
      // если новый — кладём в кэш (и ставим bust чтобы обновить превью)
      if (fresh !== cached.url) cacheAvatar(fresh);
      setImgSrcWithBust(img, fresh, Date.now());
      box?.classList.add('has-img');
    } else {
      // нет фото на стороне TG — очистим кэш и поставим дефолт
      cacheAvatar('');
      img.src = DEFAULT_AVATAR;
      box?.classList.add('has-img');
    }
  }catch{
    // сетевые/серверные ошибки — не трогаем то, что уже показали (кэш/фолбэк/дефолт)
  }
}

/* ===== рендеры ===== */
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

  // ⚠️ раньше тут был settleMatured(); теперь показываем серверный баланс
  const ref = readRefProfile();
  const hasBoost = !!ref.firstOrderBoost && !ref.firstOrderDone; // <-- флаг

  // ⛔ УБРАН заголовок «Личный кабинет»
  v.innerHTML = `
    <section class="section" style="padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));">

      <style>
        .account-card{
          display:flex; gap:12px; align-items:center;
          padding:12px; border:1px solid var(--border,rgba(0,0,0,.1));
          border-radius:12px; background:var(--card,rgba(0,0,0,.03));
        }
        .avatar{
          width:56px; height:56px; border-radius:50%;
          display:grid; place-items:center;
          overflow:hidden; user-select:none;
          background:#111827;
        }
        .avatar img{ display:block; width:100%; height:100%; object-fit:cover; }
        .avatar.has-img{ background:transparent; }
        .info .name{ font-weight:800; font-size:16px; }
        .muted{ color:var(--muted,#6b7280); }
        .muted.mini{ font-size:.9rem; }

        /* ======= Баллы (обновлённый стиль, БЕЗ градиента) ======= */
        .points-card{
          position:relative; overflow:hidden;
          margin:12px 0 8px; padding:14px;
          border-radius:14px;
          background: var(--card, rgba(0,0,0,.03)); /* без градиента */
          border:1px solid rgba(0,0,0,.08);
        }

        .points-top{ display:flex; align-items:center; justify-content:flex-start; gap:8px; white-space:nowrap; min-width:0; }
        .points-title{
          display:flex; align-items:center; gap:6px;
          font-weight:700; letter-spacing:.2px;
          font-size: clamp(13px, 3.5vw, 16px);
          color:#0f172a; white-space:nowrap;
        }
        .points-title i{ width:18px; height:18px; flex:0 0 auto; }

        .points-row{ margin-top:10px; display:grid; grid-template-columns: 1fr; gap:8px; }
        .points-chip{
          display:flex; align-items:center; gap:8px;
          padding:8px 10px; border-radius:10px; border:1px solid rgba(0,0,0,.06);
          background:#fff;
        }
        .points-chip i{ width:18px; height:18px; flex:0 0 auto; }
        .points-chip .label{ font-size:12px; color:var(--muted,#6b7280); white-space:nowrap; }
        .points-chip .val{ margin-left:auto; font-weight:800; white-space:nowrap; }

        .points-actions{ margin-top:10px; display:flex; gap:8px; align-items:stretch; flex-wrap:nowrap; min-width:0; }
        .points-actions .pill{
          height:36px; padding:0 10px;
          display:inline-flex; align-items:center; justify-content:center; gap:8px;
          border-radius:10px; border:1px solid var(--border,rgba(0,0,0,.08)); background:#fff;
          font-weight:600; line-height:1;
          flex:1 1 0; min-width:0;
          font-size: clamp(12px, 3.3vw, 14px);
          white-space:nowrap;
        }
        .points-actions .pill i{ width:18px; height:18px; flex:0 0 auto; }

        .points-actions .primary{
          color:#fff; border-color:transparent;
          background: linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ea580c 100%);
          box-shadow: 0 1px 0 rgba(0,0,0,.06), inset 0 0 0 1px rgba(255,255,255,.15);
        }
        @media (hover:hover){
          .points-actions .primary:hover{ filter:brightness(.98); }
          .points-actions .pill:not(.primary):hover{ filter:brightness(.98); }
        }
        @media (min-width: 420px){ .points-row{ grid-template-columns: 1fr 1fr; } }
        @media (max-width: 360px){
          .points-actions{ gap:6px; }
          .points-actions .pill{ height:34px; padding:0 8px; font-size:12px; }
          .points-title i{ width:16px; height:16px; }
        }
      </style>

      <div class="account-card">
        <div class="avatar" id="avatarBox" aria-label="Аватар">
          <img id="tgAvatar" alt="Аватар" src="${DEFAULT_AVATAR}">
        </div>
        <div class="info">
          <div class="name">${u ? `${u.first_name||''} ${u.last_name||''}`.trim() || u.username || 'Пользователь' : 'Гость'}</div>
          <div class="muted">${u ? 'Авторизован через Telegram' : 'Анонимный режим'}</div>
        </div>
      </div>

      <!-- Блок баллов -->
      <div class="points-card" role="region" aria-label="Баллы и кэшбек">
        <div class="points-top">
          <div class="points-title"><i data-lucide="coins"></i><span>Ваши баллы</span></div>
        </div>

        <div class="points-row" aria-label="Состояние баллов">
          <div class="points-chip" title="Баллы, которыми можно оплатить часть заказа">
            <i data-lucide="badge-check"></i>
            <div class="label">Готово к оплате</div>
            <div class="val" id="ptsAvail">${(0).toLocaleString('ru-RU')}</div>
          </div>
          <div class="points-chip" title="Баллы появятся на балансе после подтверждения (обычно 24 часа или вручную при «выдан»)">
            <i data-lucide="hourglass"></i>
            <div class="label">Ожидает начисления</div>
            <div class="val" id="ptsPend">${(0).toLocaleString('ru-RU')}</div>
          </div>
        </div>

        <div class="points-actions">
          <a class="pill primary" href="#/account/cashback"><i data-lucide="sparkles"></i><span>Мой кэшбек</span></a>
          <a class="pill" href="#/faq"><i data-lucide="help-circle"></i><span>Как потратить</span></a>
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
  try { window.lucide?.createIcons?.(); } catch {}

  // Загрузка серверного баланса и обновление чисел
  (async () => {
    try{
      await fetchMyLoyalty();
      const b = getLocalLoyalty();
      const a = document.getElementById('ptsAvail');
      const p = document.getElementById('ptsPend');
      if (a) a.textContent = (Number(b.available||0)).toLocaleString('ru-RU');
      if (p) p.textContent = (Number(b.pending||0)).toLocaleString('ru-RU');
    }catch{}
  })();

  document.getElementById('supportBtn')?.addEventListener('click', ()=>{
    openExternal(OP_CHAT_URL);
  });

  // подгружаем аватар (и обновляем при возврате на вкладку)
  loadTgAvatar();
  document.addEventListener('visibilitychange', ()=>{
    if (!document.hidden) {
      loadTgAvatar();
      // и баланс обновим при возврате
      (async ()=> {
        try{
          await fetchMyLoyalty();
          const b = getLocalLoyalty();
          const a = document.getElementById('ptsAvail');
          const p = document.getElementById('ptsPend');
          if (a) a.textContent = (Number(b.available||0)).toLocaleString('ru-RU');
          if (p) p.textContent = (Number(b.pending||0)).toLocaleString('ru-RU');
        }catch{}
      })();
    }
  });

  // на случай мгновенного перехода по ссылкам из аккаунта — ещё раз фиксируем вкладку
  document.querySelectorAll('.menu a').forEach(a=>{
    a.addEventListener('click', ()=> window.setTabbarMenu?.('account'));
  });
}

/* ====== МОЙ КЭШБЕК ====== */
export function renderCashback(){
  window.setTabbarMenu?.('account');
  const v=document.getElementById('view');

  // Рендерим каркас
  v.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAcc"><i data-lucide="chevron-left"></i></button>
        Мой кэшбек
      </div>

      <div class="stat-cb" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 10px">
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">Баланс</div>
          <div id="cbAvail" style="font-weight:800;font-size:22px">0</div>
        </div>
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">Ожидает (~24ч)</div>
          <div id="cbPend" style="font-weight:800;font-size:22px">0</div>
        </div>
      </div>

      <div class="subsection-title">История</div>
      <div class="table-wrap">
        <table class="size-table">
          <thead>
            <tr><th>Дата</th><th>Событие</th><th style="text-align:right">Баллы</th></tr>
          </thead>
          <tbody id="cbRows"><tr><td colspan="3" class="muted">Загружаем…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;
  try { window.lucide?.createIcons?.(); } catch {}
  document.getElementById('backAcc')?.addEventListener('click', ()=> history.back());

  // Подтягиваем серверный баланс и историю
  (async ()=>{
    try{
      await fetchMyLoyalty();
    }catch{}
    const b = getLocalLoyalty();
    const avail = Number(b.available||0);
    const pend  = Number(b.pending||0);
    const hist  = Array.isArray(b.history) ? b.history.slice().reverse() : []; // addHist пушит в конец

    const availEl = document.getElementById('cbAvail');
    const pendEl  = document.getElementById('cbPend');
    if (availEl) availEl.textContent = avail.toLocaleString('ru-RU');
    if (pendEl)  pendEl.textContent  = pend.toLocaleString('ru-RU');

    const rowsEl = document.getElementById('cbRows');
    if (rowsEl){
      if (!hist.length){
        rowsEl.innerHTML = `<tr><td colspan="3" class="muted">Пока пусто</td></tr>`;
      }else{
        rowsEl.innerHTML = hist.slice(-200).map(h=>{
          const dt = new Date(h.ts||Date.now());
          const d  = `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
          const pts = Number(h.pts||0)|0;
          const sign = pts>=0 ? '+' : '';
          const reason = h.info || h.reason || mapKind(h.kind) || 'Операция';
          return `
            <tr>
              <td>${d}</td>
              <td>${escapeHtml(reason)}</td>
              <td style="text-align:right"><b>${sign}${pts.toLocaleString('ru-RU')}</b></td>
            </tr>
          `;
        }).join('');
      }
    }
  })();
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
    <section class="section" style="padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAcc"><i data-lucide="chevron-left"></i></button>
        Мои рефералы
      </div>

      <style>
        /* ——— Реф-карточка ——— */
        .ref-card{
          padding:12px;
          border:1px solid var(--border,rgba(0,0,0,.12));
          border-radius:12px;
          background:var(--card,rgba(0,0,0,.03));
          display:grid; gap:10px;
        }
        .ref-grid{
          display:grid;
          grid-template-columns: minmax(0,1fr) auto;
          align-items: stretch;
          gap:10px;
        }
        .ref-linkbox{
          min-height:42px;
          padding:10px 12px;
          border:1px solid var(--border,rgba(0,0,0,.12));
          border-radius:10px;
          background:var(--bg,#fff);
          overflow-x:auto;
          overflow-y:hidden;
          white-space:nowrap;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size:.92rem;
          line-height:1.2;
          user-select:all;
        }
        .ref-actions .pill{
          height:42px;
          display:inline-flex; align-items:center; gap:8px;
          white-space:nowrap;
        }
        .ref-hint{ color:var(--muted,#6b7280); font-size:.9rem; }
        @media (max-width: 460px){
          .ref-grid{ grid-template-columns: 1fr; }
          .ref-actions .pill{ width:100%; justify-content:center; }
        }
      </style>

      <div class="ref-card">
        <div class="muted mini">Ваша реф-ссылка</div>

        <div class="ref-grid">
          <div id="refLinkBox" class="ref-linkbox">${escapeHtml(link)}</div>
          <div class="ref-actions"><button id="copyRef" class="pill"><i data-lucide="copy"></i><span>Скопировать</span></button></div>
        </div>

        <div id="copyHint" class="ref-hint" style="display:none">Скопировано!</div>

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
  try { window.lucide?.createIcons?.(); } catch {}

  document.getElementById('backAcc')?.addEventListener('click', ()=> history.back());

  // copy button logic
  const btn = document.getElementById('copyRef');
  const hint = document.getElementById('copyHint');
  btn?.addEventListener('click', async ()=>{
    const text = String(link);
    let ok = false;
    try{
      await navigator.clipboard.writeText(text);
      ok = true;
    }catch{
      try{
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position='fixed'; ta.style.left='-9999px';
        document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      }catch{}
    }

    if (ok){
      // краткий фидбек
      const icon = btn.querySelector('i[data-lucide]');
      const label = btn.querySelector('span');
      const prev = { label: label?.textContent || 'Скопировать', icon: icon?.getAttribute('data-lucide') || 'copy' };
      if (label) label.textContent = 'Скопировано!';
      if (icon){ icon.setAttribute('data-lucide','check'); try { window.lucide?.createIcons?.(); } catch {} }
      if (hint){ hint.style.display = 'block'; }
      setTimeout(()=>{
        if (label) label.textContent = prev.label;
        if (icon){ icon.setAttribute('data-lucide', prev.icon); try { window.lucide?.createIcons?.(); } catch {} }
        if (hint){ hint.style.display = 'none'; }
      }, 1500);
    }
  });
}

export function renderAddresses(){
  // ✅ фикс активной вкладки в таббаре
  window.setTabbarMenu?.('account');

  const v=document.getElementById('view');
  const list = state.addresses.list.slice();
  const defId = state.addresses.defaultId;

  v.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAccAddrs"><i data-lucide="chevron-left"></i></button>
        Адреса доставки
      </div>

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

  // 👈 новая кнопка «назад»
  document.getElementById('backAccAddrs')?.addEventListener('click', ()=> history.back());

  try { window.lucide?.createIcons?.(); } catch {}
}

// Настройки оставлены для прямого URL, но не показываются в меню
export function renderSettings(){
  // ✅ фикс активной вкладки в таббаре
  window.setTabbarMenu?.('account');

  const v=document.getElementById('view');
  v.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAccSettings"><i data-lucide="chevron-left"></i></button>
        Настройки
      </div>
      <div class="menu">
        <div class="menu-item"><i data-lucide="moon"></i><span>Тема устройства</span></div>
      </div>
    </section>`;
  try { window.lucide?.createIcons?.(); } catch {}
  document.getElementById('backAccSettings')?.addEventListener('click', ()=> history.back());
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

/* ===== Уведомления: helperы под новый notifs-бэкенд ===== */

/** Локальный помощник: создать in-app уведомление для uid (с учётом X-Tg-Init-Data) */
async function postAppNotif(uid, { icon='bell', title='', sub='' } = {}){
  const safe = (s, n=256) => String(s||'').trim().slice(0, n);
  const body = {
    op: 'add',
    uid: String(uid||''),
    notif: { icon: safe(icon, 32), title: safe(title), sub: safe(sub, 512) }
  };

  // В проде предпочтителен X-Tg-Init-Data
  const initData = getTgInitDataRaw();
  const headers = { 'Content-Type':'application/json' };
  if (initData) headers['X-Tg-Init-Data'] = initData;

  try{
    await fetch('/.netlify/functions/notifs', {
      method:'POST',
      headers,
      body: JSON.stringify(body)
    });
  }catch{}
}

/** Маппинг вида операции для истории */
function mapKind(kind=''){
  const dict = {
    accrue: 'Начисление (ожидание/подтверждено)',
    confirm: 'Подтверждение начисления',
    redeem: 'Оплата баллами',
    reserve: 'Резервирование',
    reserve_cancel: 'Возврат резерва',
    ref_accrue: 'Реферальное начисление (ожидание)',
    ref_confirm: 'Реферальные подтверждены'
  };
  return dict[kind] || '';
}

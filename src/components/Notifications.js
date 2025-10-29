// src/components/Notifications.js
import { k, getUID, getNotifications as getList, setNotifications as setList } from '../core/state.js';

const ENDPOINT = '/.netlify/functions/notifs';
const FETCH_TIMEOUT_MS = 10000;

/* ===== Общий таймаут (как в других модулях) ===== */
function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

// Сырой initData из Telegram Mini App (для серверной верификации)
function getTgInitDataRaw(){
  try {
    return typeof window?.Telegram?.WebApp?.initData === 'string'
      ? window.Telegram.WebApp.initData
      : '';
  } catch {
    return '';
  }
}

/* ===== badge helpers ===== */
function unreadCount(list){ return (list||[]).reduce((a,n)=> a + (!n.read ? 1 : 0), 0); }
function updateUnreadBadge(n){
  const v = Math.max(0, n|0);
  try { localStorage.setItem(k('notifs_unread'), String(v)); } catch {}
  try { window.dispatchEvent(new CustomEvent('notifs:unread', { detail: v })); } catch {}
}

/* ===== основной рендер ===== */
export async function renderNotifications(onAfterMarkRead){
  const v = document.getElementById('view');
  if (!v) return;

  // 1) получаем список (сервер → локаль)
  let list = await fetchServerListSafe().catch(()=>null);
  if (!Array.isArray(list)) list = getList();

  list = list.slice().sort((a,b)=> (b.ts||0) - (a.ts||0));

  // первичный рендер
  if (!list.length){
    v.innerHTML = `
      <div class="section-title">Уведомления</div>
      <div class="notes-empty">Пока нет уведомлений. Мы сообщим, когда появятся новости или акции.</div>
    `;
  } else {
    v.innerHTML = `
      <div class="section-title">Уведомления</div>
      <section class="notes" id="notesList">
        ${list.map(n=> noteTpl(n)).join('')}
      </section>
    `;
  }

  // 2) помечаем прочитанными: сначала сервер, затем локальный кэш и DOM
  const serverItems = await markAllServerSafe().catch(()=>null);

  if (Array.isArray(serverItems)) {
    // сервер — источник истины
    const norm = serverItems.map(n => normalize({ ...n, read: true }));
    const sorted = norm.sort((a,b)=> (b.ts||0)-(a.ts||0));
    setList(sorted);
    applyDomReadState(sorted);         // ← мгновенно в DOM
    updateUnreadBadge(unreadCount(sorted)); // будет 0
  } else {
    // оффлайн-фолбэк: локально всё отметить
    const updated = list.map(n => normalize({ ...n, read: true }));
    setList(updated);
    applyDomReadState(updated);
    updateUnreadBadge(0);
  }

  onAfterMarkRead && onAfterMarkRead();
  window.lucide?.createIcons && lucide.createIcons();
}

/* ===== шаблон карточки ===== */
function noteTpl(n){
  const icon = n.icon || 'bell';
  const d = new Date(n.ts || Date.now());
  const time = d.toLocaleTimeString?.([], { hour:'2-digit', minute:'2-digit' }) ||
               `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `
    <div class="note ${n.read ? 'is-read' : ''}" data-id="${escapeAttr(n.id)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <div>
        <div class="note-title">${escapeHtml(n.title || '')}</div>
        ${n.sub ? `<div class="note-sub">${escapeHtml(n.sub)}</div>` : ''}
      </div>
      <div class="time">${escapeHtml(time)}</div>
    </div>
  `;
}

/* ===== нормализация ===== */
function normalize(n){
  return {
    id: String(n.id || Date.now()),
    ts: Number(n.ts || Date.now()),
    read: !!n.read,
    icon: String(n.icon || 'bell'),
    title: String(n.title || ''),
    sub: String(n.sub || ''),
  };
}

/* ===== server API ===== */
async function fetchServerListSafe(){
  const uid = getUID();
  if (!uid) return null;
  try{
    const r = await withTimeout(fetch(`${ENDPOINT}?op=list&uid=${encodeURIComponent(uid)}&ts=${Date.now()}`, {
      method:'GET',
      headers:{ 'X-Tg-Init-Data': getTgInitDataRaw(), 'Cache-Control':'no-store' }
    }));
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j?.ok === false) return null;

    const items = Array.isArray(j.items) ? j.items : [];
    const norm = items.map(normalize).sort((a,b)=> (b.ts||0)-(a.ts||0));
    setList(norm);
    // не трогаем read здесь — пометим централизованно в renderNotifications
    return norm;
  }catch{
    return null;
  }
}

async function markAllServerSafe(){
  const uid = getUID();
  if (!uid) return null;

  const initData = getTgInitDataRaw();
  const hasInit  = !!(initData && initData.length);

  try{
    const headers = { 'Content-Type':'application/json', ...(hasInit ? { 'X-Tg-Init-Data': initData } : {}) };

    // Пытаемся по «приватному» пути (initData), затем — по публичному с uid
    const attempts = hasInit
      ? [ { op:'markmine' }, { op:'markseen' } ]   // без uid, сервер возьмёт его из initData
      : [ { op:'markAll', uid } ];                 // публичный путь требует uid

    for (const body of attempts){
      const r = await withTimeout(fetch(ENDPOINT, {
        method:'POST',
        headers,
        body: JSON.stringify(body),
      }));
      const j = await r.json().catch(()=> ({}));

      // диагностический лог (оставь пока)
      console.info('[notifs] mark attempt:', body, '→ status:', r.status, 'ok:', j?.ok, 'items:',
        Array.isArray(j?.items) ? j.items.length : 'no items');

      if (r.ok && j?.ok !== false){
        // если сервер вернул актуальные items — используем их; если нет — просто вернём []
        return Array.isArray(j.items) ? j.items : [];
      }
    }
    return null;
  }catch(e){
    console.warn('[notifs] markAllServerSafe failed:', e?.message||e);
    return null;
  }
}

/* ===== моментальное обновление DOM после read ===== */
function applyDomReadState(list){
  try{
    const idsRead = new Set((list||[]).filter(n => n.read).map(n => String(n.id)));
    const root = document.getElementById('notesList') || document;
    root.querySelectorAll('.note').forEach(el => {
      const id = el.getAttribute('data-id') || '';
      if (idsRead.has(id)) el.classList.add('is-read');
    });
  }catch{}
}

/* ===== helpers ===== */
function escapeHtml(s=''){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function escapeAttr(s=''){ return escapeHtml(String(s)); }

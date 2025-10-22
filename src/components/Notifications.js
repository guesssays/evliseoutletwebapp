// src/components/Notifications.js
import { k, getUID } from '../core/state.js';

const ENDPOINT = '/.netlify/functions/notifs';

export async function renderNotifications(onAfterMarkRead){
  const v = document.getElementById('view');

  // 1) грузим с сервера (fall back на локальное)
  let list = await fetchServerListSafe().catch(()=>null);
  if (!Array.isArray(list)) list = getList();

  // сортировка (на всякий случай)
  list = list.slice().sort((a,b)=> (b.ts||0) - (a.ts||0));

  if (!list.length){
    v.innerHTML = `
      <div class="section-title">Уведомления</div>
      <div class="notes-empty">Пока нет уведомлений. Мы сообщим, когда появятся новости или акции.</div>
    `;
  }else{
    v.innerHTML = `
      <div class="section-title">Уведомления</div>
      <section class="notes">
        ${list.map(n=> noteTpl(n)).join('')}
      </section>
    `;
  }

  // 2) отмечаем прочитанными: сперва сервер, затем локальный кэш
  if (list.some(n=>!n.read)){
    await markAllServerSafe().catch(()=>{});
    const updated = list.map(n=> ({ ...n, read:true })); // ✅ фикс синтаксиса
    setList(updated);
    onAfterMarkRead && onAfterMarkRead();
  }

  // иконки
  window.lucide?.createIcons && lucide.createIcons();
}

function noteTpl(n){
  const icon = n.icon || 'bell';
  const d = new Date(n.ts || Date.now());
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const time = `${hh}:${mm}`;
  return `
    <div class="note" data-id="${n.id}">
      <i data-lucide="${icon}"></i>
      <div>
        <div class="note-title">${escapeHtml(n.title || '')}</div>
        ${n.sub ? `<div class="note-sub">${escapeHtml(n.sub)}</div>` : ''}
      </div>
      <div class="time">${time}</div>
    </div>
  `;
}

/* ===== server API ===== */
async function fetchServerListSafe(){
  const uid = getUID();
  if (!uid) return null;
  const r = await fetch(`${ENDPOINT}?op=list&uid=${encodeURIComponent(uid)}`, { method:'GET' });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok || j?.ok === false) return null;
  const items = Array.isArray(j.items) ? j.items : [];
  // подстрахуемся от мусора
  const norm = items.map(n => ({
    id: String(n.id || Date.now()),
    ts: Number(n.ts || Date.now()),
    read: !!n.read,
    icon: String(n.icon || 'bell'),
    title: String(n.title || ''),
    sub: String(n.sub || ''),
  }));
  setList(norm);
  return norm;
}

async function markAllServerSafe(){
  const uid = getUID();
  if (!uid) return;
  try{
    await fetch(ENDPOINT, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ op:'markAll', uid })
    });
  }catch{}
}

/* ===== local cache ===== */
function key(){ return k('notifs_list'); }
function getList(){
  try{ return JSON.parse(localStorage.getItem(key()) || '[]'); }catch{ return []; }
}
function setList(list){
  localStorage.setItem(key(), JSON.stringify(Array.isArray(list) ? list : []));
}

/* ===== helpers ===== */
function escapeHtml(s){
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

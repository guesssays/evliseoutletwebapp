// src/components/Admin.js
import {
  ORDER_STATUSES,
  getOrders,
  acceptOrder,
  cancelOrder,
  updateOrderStatus,
  seedOrdersOnce,
  getStatusLabel,
} from '../core/orders.js';
import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

const CANCEL_STORE_KEY = 'nas_cancel_reasons';

function loadCancelReasons(){
  try{ return JSON.parse(localStorage.getItem(CANCEL_STORE_KEY) || '{}'); }catch{ return {}; }
}
function saveCancelReason(orderId, text=''){
  const map = loadCancelReasons();
  map[String(orderId)] = String(text||'');
  localStorage.setItem(CANCEL_STORE_KEY, JSON.stringify(map));
}
function getCancelReason(orderId){
  const map = loadCancelReasons();
  return map[String(orderId)] || '';
}

export function renderAdmin(){
  const v = document.getElementById('view');
  seedOrdersOnce();

  document.body.classList.add('admin-mode');

  const TABS = [
    { key:'new',     label:'Новые' },
    { key:'active',  label:'В процессе' },
    { key:'done',    label:'Завершённые' },
  ];

  let tab = 'new';
  let mode = 'list';
  let selectedId = null;

  const getAll = ()=> {
    const orders = getOrders();
    state.orders = orders;
    return orders;
  };

  const filterByTab = (list)=>{
    if (tab==='new')    return list.filter(o => o.status==='новый' && !o.accepted);
    if (tab==='active') return list.filter(o => !['новый','выдан','отменён'].includes(o.status));
    if (tab==='done')   return list.filter(o => ['выдан','отменён'].includes(o.status));
    return list;
  };

  const getById = (id)=> getAll().find(o=>String(o.id)===String(id));

  const currentProductsMap = ()=>{
    const map = new Map();
    (state.products || []).forEach(p => map.set(String(p.id), p));
    return map;
  };

  const ACTIVE_STAGES = ORDER_STATUSES.filter(s => !['новый','отменён'].includes(s));

  function shell(innerHTML){
    v.innerHTML = `
      <section class="section admin-shell">
        <div class="admin-head">
          <div class="admin-title"><i data-lucide="shield-check"></i><span>Админ-панель</span></div>
        </div>

        <div class="admin-tabs" id="adminTabs" role="tablist" aria-label="Статусы заказов">
          ${TABS.map(t=>`
            <button class="admin-tab ${tab===t.key?'is-active':''}" data-k="${t.key}" role="tab" aria-selected="${tab===t.key}">${t.label}</button>
          `).join('')}
        </div>

        ${innerHTML}
      </section>
    `;
    window.lucide?.createIcons && lucide.createIcons();

    document.getElementById('adminTabs')?.addEventListener('click', (e)=>{
      const b = e.target.closest('.admin-tab');
      if(!b) return;
      tab = b.getAttribute('data-k');
      mode = 'list';
      selectedId = null;
      render();
    });
  }

  function listView(){
    const orders = filterByTab(getAll());
    const pmap   = currentProductsMap();

    const html = orders.length ? `
      <div class="admin-list-mini" id="adminListMini">
        ${orders.map(o=>{
          const prod  = pmap.get(String(o.productId));
          const price = prod?.price ? priceFmt(prod.price) : (o.total ? priceFmt(o.total) : '—');
          return `
            <article class="order-mini" data-id="${o.id}" tabindex="0" role="button" aria-label="Открыть заказ #${o.id}">
              <div class="order-mini__left">
                <div class="order-mini__sum">${price}</div>
                <div class="order-mini__meta">
                  <span class="chip-id">#${escapeHtml(o.id)}</span>
                  <span class="chip-user">@${escapeHtml(o.username||'—')}</span>
                  <span class="muted mini">· ${escapeHtml(getStatusLabel(o.status))}</span>
                </div>
              </div>
              <div class="order-mini__right">
                <i class="arrow" aria-hidden="true"></i>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <div class="admin-empty">
        <i data-lucide="inbox"></i>
        <div>В этой вкладке пока нет заказов</div>
      </div>
    `;

    shell(html);

    const hook = (card)=>{
      if(!card) return;
      selectedId = card.getAttribute('data-id');
      mode = 'detail';
      render();
    };
    document.getElementById('adminListMini')?.addEventListener('click', (e)=> hook(e.target.closest('.order-mini')));
    document.getElementById('adminListMini')?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.order-mini');
        if(!card) return;
        e.preventDefault();
        hook(card);
      }
    });
  }

  function detailView(){
    const o = getById(selectedId);
    if(!o){
      mode='list';
      return listView();
    }
    const pmap   = currentProductsMap();
    const prod   = pmap.get(String(o.productId));
    const price  = prod?.price ? priceFmt(prod.price) : (o.total ? priceFmt(o.total) : '—');
    const title  = prod?.title ? `${prod.title} ${price ? `· <span class="muted">${price}</span>`:''}` : `Заказ #${o.id}`;
    const isNew  = o.status==='новый' && !o.accepted;
    const isDone = ['выдан','отменён'].includes(o.status);

    shell(`
      <div class="order-detail">
        <div class="order-detail__top">
          <button id="backToList" class="btn-ghost" aria-label="Назад к списку">
            <i data-lucide="arrow-left"></i><span>Назад</span>
          </button>
          <div class="order-detail__title">${title}</div>
        </div>

        <div class="order-detail__body">
          <dl class="kv kv--detail">
            <div class="kv__row">
              <dt>Номер заказа</dt>
              <dd>#${escapeHtml(o.id)}</dd>
            </div>
            <div class="kv__row">
              <dt>Клиент</dt>
              <dd>@${escapeHtml(o.username||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Телефон</dt>
              <dd>${escapeHtml(o.phone||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Адрес</dt>
              <dd class="break">${escapeHtml(o.address||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Плательщик</dt>
              <dd class="break">${escapeHtml(o.payerFullName||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Размер/цвет</dt>
              <dd>${escapeHtml(o.size||'—')}${o.color?` · ${escapeHtml(o.color)}`:''}</dd>
            </div>
            <div class="kv__row">
              <dt>Сумма</dt>
              <dd>${price}</dd>
            </div>
            <div class="kv__row">
              <dt>Статус</dt>
              <dd>${escapeHtml(getStatusLabel(o.status))}</dd>
            </div>
            ${o.status==='отменён' ? `
              <div class="kv__row">
                <dt>Причина отмены</dt>
                <dd class="break">${escapeHtml(getCancelReason(o.id) || '—')}</dd>
              </div>` : ''}
            <div class="kv__row">
              <dt>Чек</dt>
              <dd>
                ${o.paymentScreenshot ? `
                  <div class="receipt-actions">
                    <button class="btn btn--sm btn--outline" data-preview="${escapeHtml(o.paymentScreenshot)}">
                      <i data-lucide="image"></i><span>&nbsp;Предпросмотр</span>
                    </button>
                    <button class="btn btn--sm" data-open="${escapeHtml(o.paymentScreenshot)}">
                      <i data-lucide="external-link"></i><span>&nbsp;Открыть в новой вкладке</span>
                    </button>
                    <button class="btn btn--sm btn--primary" data-download="${escapeHtml(o.paymentScreenshot)}" data-oid="${escapeHtml(o.id)}">
                      <i data-lucide="download"></i><span>&nbsp;Скачать</span>
                    </button>
                  </div>
                ` : '—'}
              </dd>
            </div>
          </dl>

          <div class="order-detail__actions">
            ${isNew ? `
              <button class="btn btn--primary" id="btnAccept" data-id="${o.id}">Принять</button>
              <button class="btn btn--outline" id="btnCancel" data-id="${o.id}">Отменить</button>
            ` : ''}

            ${(!isNew && !isDone) ? `
              <div class="stage-list" id="stageList" role="group" aria-label="Этапы заказа">
                ${ORDER_STATUSES.filter(s=>!['новый','отменён'].includes(s)).map(s=>`
                  <button class="stage-btn ${o.status===s?'is-active':''}" data-st="${s}">${getStatusLabel(s)}</button>
                `).join('')}
              </div>
            ` : ''}

            ${isDone?'<span class="muted mini">Заказ завершён</span>':''}
          </div>
        </div>
      </div>
    `);

    window.lucide?.createIcons && lucide.createIcons();

    document.getElementById('backToList')?.addEventListener('click', ()=>{
      mode='list'; selectedId=null; render();
    });

    // чек: предпросмотр / открыть / скачать
    document.querySelector('[data-preview]')?.addEventListener('click', (e)=>{
      const url = e.currentTarget.getAttribute('data-preview');
      openReceiptPreview(url, String(o.id||''));
    });
    document.querySelector('[data-open]')?.addEventListener('click', (e)=>{
      const url = e.currentTarget.getAttribute('data-open');
      safeOpenInNewTab(url);
    });
    document.querySelector('[data-download]')?.addEventListener('click', async (e)=>{
      const url = e.currentTarget.getAttribute('data-download');
      const oid = e.currentTarget.getAttribute('data-oid') || 'receipt';
      await triggerDownload(url, suggestReceiptFilename(url, oid));
    });

    // Новый: принять
    document.getElementById('btnAccept')?.addEventListener('click', ()=>{
      acceptOrder(o.id);
      render();
    });

    // Новый: отменить
    document.getElementById('btnCancel')?.addEventListener('click', ()=>{
      const reason = prompt('Укажите причину отмены (видно будет только админам):');
      saveCancelReason(o.id, reason||'');
      cancelOrder(o.id, reason||'');
      mode='list'; tab='done'; render();
    });

    // В процессе: этапы
    document.getElementById('stageList')?.addEventListener('click', (e)=>{
      const btn = e.target.closest('.stage-btn');
      if (!btn) return;
      const st = btn.getAttribute('data-st');
      if (!st) return;
      updateOrderStatus(o.id, st);
      if (st === 'выдан'){ mode='list'; tab='done'; }
      render();
    });
  }

  function render(){
    if (mode==='detail') detailView();
    else listView();
  }

  function openReceiptPreview(url, orderId=''){
    if(!url) return;
    const modal = document.getElementById('modal');
    const mb = document.getElementById('modalBody');
    const mt = document.getElementById('modalTitle');
    const ma = document.getElementById('modalActions');
    if (!modal || !mb || !mt || !ma){
      safeOpenInNewTab(url);
      return;
    }
    mt.textContent = 'Чек оплаты';
    mb.innerHTML = `
      <div class="receipt-view">
        <div class="receipt-img-wrap">
          <img class="receipt-img" src="${escapeHtml(url)}" alt="Чек оплаты">
        </div>
        <div class="muted" style="font-size:12px">Если изображение не загрузилось — ссылка может быть приватной (требует доступ) или запрещена CORS.</div>
      </div>
    `;
    ma.innerHTML = `
      <button class="btn btn--outline" id="rcOpen"><i data-lucide="external-link"></i><span>&nbsp;Открыть в новой вкладке</span></button>
      <button class="btn btn--primary" id="rcDownload"><i data-lucide="download"></i><span>&nbsp;Скачать</span></button>
    `;
    modal.classList.add('show');
    window.lucide?.createIcons && lucide.createIcons();

    document.getElementById('modalClose').onclick = ()=> modal.classList.remove('show');
    document.getElementById('rcOpen')?.addEventListener('click', ()=> safeOpenInNewTab(url));
    document.getElementById('rcDownload')?.addEventListener('click', ()=> triggerDownload(url, suggestReceiptFilename(url, orderId)));
  }

  render();
}

/* ---------------- Helpers: open & download ---------------- */

function safeOpenInNewTab(url){
  try{
    window.open(url, '_blank', 'noopener,noreferrer');
  }catch{
    // молча игнорируем — в некоторых окружениях popup может быть заблокирован
  }
}

/**
 * Пытаемся скачать по ссылке. Работает:
 * - для data: URL (чек, сохранённый в заказе)
 * - для http(s) при том же домене/разрешённом CORS
 * Если браузер/сервер не разрешает прямое скачивание — открываем в новой вкладке.
 */
async function triggerDownload(url, filename='receipt.jpg'){
  try{
    // простой путь: скрытая ссылка с download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }catch{
    // если вдруг не удалось — пробуем fetch -> blob (когда CORS позволяет)
    try{
      const resp = await fetch(url, { mode:'cors' });
      const blob = await resp.blob();
      const ext = extensionFromMime(blob.type) || filename.split('.').pop() || 'jpg';
      const name = ensureExt(filename, ext);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=> URL.revokeObjectURL(blobUrl), 2000);
    }catch{
      // финальный фолбэк — открыть в новой вкладке
      safeOpenInNewTab(url);
    }
  }
}

function suggestReceiptFilename(url, orderId=''){
  // data:image/jpeg;base64,...
  if (/^data:/i.test(url)){
    const m = /^data:([^;,]+)/i.exec(url);
    const ext = extensionFromMime(m?.[1] || '') || 'jpg';
    return `receipt_${orderId||'order'}.${ext}`;
  }
  // http(s) — пробуем вытащить имя из пути
  try{
    const u = new URL(url, location.href);
    const last = (u.pathname.split('/').pop() || '').split('?')[0];
    if (last) return last;
  }catch{}
  return `receipt_${orderId||'order'}.jpg`;
}

function extensionFromMime(mime=''){
  const map = {
    'image/jpeg':'jpg',
    'image/jpg':'jpg',
    'image/png':'png',
    'image/webp':'webp',
    'image/gif':'gif',
    'image/bmp':'bmp',
    'image/heic':'heic',
    'image/heif':'heif',
    'application/pdf':'pdf',
  };
  return map[mime.toLowerCase()] || '';
}

function ensureExt(name, ext){
  if (!ext) return name;
  const low = name.toLowerCase();
  if (low.endsWith(`.${ext.toLowerCase()}`)) return name;
  // срезать другой расшир
  const dot = name.lastIndexOf('.');
  const base = dot>0 ? name.slice(0,dot) : name;
  return `${base}.${ext}`;
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

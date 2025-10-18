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

export async function renderAdmin(){
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

  const getAll = async ()=> {
    const orders = await getOrders();
    state.orders = orders;
    return orders;
  };

  const filterByTab = (list)=>{
    if (tab==='new')    return list.filter(o => o.status==='новый' && !o.accepted);
    if (tab==='active') return list.filter(o => !['новый','выдан','отменён'].includes(o.status));
    if (tab==='done')   return list.filter(o => ['выдан','отменён'].includes(o.status));
    return list;
  };

  const currentProductsMap = ()=>{
    const map = new Map();
    (state.products || []).forEach(p => map.set(String(p.id), p));
    return map;
  };

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

  async function listView(){
    const orders = filterByTab(await getAll());
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

  async function detailView(){
    const orders = await getAll();
    const o = orders.find(x=>String(x.id)===String(selectedId));
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
                <dd class="break">${escapeHtml(o.cancelReason || '—')}</dd>
              </div>` : ''}
            <div class="kv__row">
              <dt>Чек</dt>
              <dd>
                ${o.paymentScreenshot ? `
                  <div class="receipt-actions">
                    <button class="btn btn--sm btn--outline" data-open="${escapeHtml(o.paymentScreenshot)}">
                      <i data-lucide="external-link"></i><span>&nbsp;Открыть</span>
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

    document.querySelector('[data-open]')?.addEventListener('click', (e)=>{
      const url = e.currentTarget.getAttribute('data-open');
      safeOpenInNewTab(url);
    });
    document.querySelector('[data-download]')?.addEventListener('click', async (e)=>{
      const url = e.currentTarget.getAttribute('data-download');
      const oid = e.currentTarget.getAttribute('data-oid') || 'receipt';
      await triggerDownload(url, suggestReceiptFilename(url, oid));
    });

    document.getElementById('btnAccept')?.addEventListener('click', async ()=>{
      await acceptOrder(o.id);
      render();
    });

    document.getElementById('btnCancel')?.addEventListener('click', async ()=>{
      const reason = prompt('Причина отмены (будет видна клиенту):');
      await cancelOrder(o.id, reason||'');
      mode='list'; tab='done'; render();
    });

    document.getElementById('stageList')?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.stage-btn');
      if (!btn) return;
      const st = btn.getAttribute('data-st');
      if (!st) return;
      await updateOrderStatus(o.id, st);
      if (st === 'выдан'){ mode='list'; tab='done'; }
      render();
    });
  }

  async function render(){
    if (mode==='detail') await detailView();
    else await listView();
  }

  window.addEventListener('orders:updated', render);
  await render();
}

/* helpers */
function safeOpenInNewTab(url){
  try{ window.open(url, '_blank', 'noopener,noreferrer'); }catch{}
}
async function triggerDownload(url, filename='receipt.jpg'){
  try{
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel='noopener'; a.style.display='none';
    document.body.appendChild(a); a.click(); a.remove();
  }catch{
    try{
      const resp = await fetch(url, { mode:'cors' });
      const blob = await resp.blob();
      const ext = extensionFromMime(blob.type) || filename.split('.').pop() || 'jpg';
      const name = ensureExt(filename, ext);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = blobUrl; a.download = name; a.style.display='none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(blobUrl), 2000);
    }catch{
      safeOpenInNewTab(url);
    }
  }
}
function suggestReceiptFilename(url, orderId=''){
  if (/^data:/i.test(url)){
    const m = /^data:([^;,]+)/i.exec(url);
    const ext = extensionFromMime(m?.[1] || '') || 'jpg';
    return `receipt_${orderId||'order'}.${ext}`;
  }
  try{
    const u = new URL(url, location.href);
    const last = (u.pathname.split('/').pop() || '').split('?')[0];
    if (last) return last;
  }catch{}
  return `receipt_${orderId||'order'}.jpg`;
}
function extensionFromMime(mime=''){
  const map = { 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','image/heic':'heic','image/heif':'heif','application/pdf':'pdf' };
  return map[mime.toLowerCase()] || '';
}
function ensureExt(name, ext){
  if (!ext) return name;
  const low = name.toLowerCase();
  if (low.endsWith(`.${ext.toLowerCase()}`)) return name;
  const dot = name.lastIndexOf('.'); const base = dot>0 ? name.slice(0,dot) : name;
  return `${base}.${ext}`;
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

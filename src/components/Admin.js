import {
  ORDER_STATUSES,
  getOrders,
  acceptOrder,
  updateOrderStatus,
  seedOrdersOnce
} from '../core/orders.js';
import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

/**
 * Профи-админка:
 * - Вкладки: Новые / В процессе / Завершённые
 * - Список заказов (мини-карточка: сумма, ID, @username, статус)
 * - Детальная карточка заказа (вся инфа, принять, смена статуса, чек с предпросмотром/скачиванием)
 * - Без «таббара», без кнопок «Выйти», «Создать заказ»
 * - События для нотификаций клиента:
 *    - 'admin:orderAccepted'  { id }
 *    - 'admin:statusChanged'  { id, status }
 */

export function renderAdmin(){
  const v = document.getElementById('view');
  seedOrdersOnce();

  // прячем клиентский таббар для режима админа
  document.body.classList.add('admin-mode');

  const TABS = [
    { key:'new',     label:'Новые' },
    { key:'active',  label:'В процессе' },
    { key:'done',    label:'Завершённые' },
  ];

  // локальное состояние экрана админки
  let tab = 'new';
  let mode = 'list';     // 'list' | 'detail'
  let selectedId = null; // id текущего заказа в detail

  // ---------- helpers ----------
  const getAll = ()=> {
    const orders = getOrders();
    state.orders = orders;
    return orders;
  };

  const filterByTab = (list)=>{
    if (tab==='new')    return list.filter(o => o.status==='новый' || (!o.accepted && o.status!=='готов к отправке'));
    if (tab==='active') return list.filter(o => (o.accepted && o.status!=='готов к отправке') || (o.status!=='новый' && o.status!=='готов к отправке'));
    if (tab==='done')   return list.filter(o => o.status==='готов к отправке');
    return list;
  };

  const getById = (id)=> getAll().find(o=>String(o.id)===String(id));

  const currentProductsMap = ()=>{
    const map = new Map();
    (state.products || []).forEach(p => map.set(String(p.id), p));
    return map;
  };

  // ---------- UI shells ----------
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
                </div>
              </div>
              <div class="order-mini__right">
                <span class="badge ${badgeMod(o)}">${escapeHtml(o.status)}</span>
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

    document.getElementById('adminListMini')?.addEventListener('click', (e)=>{
      const card = e.target.closest('.order-mini');
      if(!card) return;
      selectedId = card.getAttribute('data-id');
      mode = 'detail';
      render();
    });
    document.getElementById('adminListMini')?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.order-mini');
        if(!card) return;
        e.preventDefault();
        selectedId = card.getAttribute('data-id');
        mode = 'detail';
        render();
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
    const isDone = o.status==='готов к отправке';

    shell(`
      <div class="order-detail">
        <div class="order-detail__top">
          <button id="backToList" class="btn-ghost" aria-label="Назад к списку">
            <i data-lucide="arrow-left"></i><span>Назад</span>
          </button>
          <div class="order-detail__title">${escapeHtml(title)}</div>
          <!-- Бейдж статуса сверху справа удалён по просьбе -->
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
              <dt>Ссылка на товар</dt>
              <dd>${o.productId ? `<a class="link" href="#/product/${escapeHtml(o.productId)}">Открыть</a>`:'—'}</dd>
            </div>
            <div class="kv__row">
              <dt>Сумма</dt>
              <dd>${price}</dd>
            </div>
            <div class="kv__row">
              <dt>Чек</dt>
              <dd>
                ${o.paymentScreenshot ? `
                  <div class="receipt-actions">
                    <button class="btn btn--sm btn--outline" data-preview="${escapeHtml(o.paymentScreenshot)}">
                      <i data-lucide="image"></i><span>&nbsp;Предпросмотр</span>
                    </button>
                    <a class="btn btn--sm btn--primary" href="${escapeHtml(o.paymentScreenshot)}" target="_blank" rel="noopener" download>
                      <i data-lucide="download"></i><span>&nbsp;Скачать</span>
                    </a>
                  </div>
                ` : '—'}
              </dd>
            </div>
          </dl>

          <div class="order-detail__actions">
            ${isNew ? `<button class="btn btn--primary" id="btnAccept" data-id="${o.id}">Принять заказ</button>`:''}
            <label class="select-wrap">
              <select id="statusSelect" class="select" ${isNew?'disabled':''}>
                ${ORDER_STATUSES.filter(s=>s!=='новый').map(s=>`
                  <option value="${s}" ${o.status===s?'selected':''}>${s}</option>
                `).join('')}
              </select>
            </label>
            ${isDone?'<span class="muted text-xs">Заказ завершён</span>':''}
          </div>
        </div>
      </div>
    `);

    window.lucide?.createIcons && lucide.createIcons();

    document.getElementById('backToList')?.addEventListener('click', ()=>{
      mode='list'; selectedId=null; render();
    });

    document.querySelector('[data-preview]')?.addEventListener('click', (e)=>{
      const url = e.currentTarget.getAttribute('data-preview');
      openReceiptPreview(url);
    });

    document.getElementById('btnAccept')?.addEventListener('click', ()=>{
      acceptOrder(o.id);
      try {
        window.dispatchEvent(new CustomEvent('admin:orderAccepted',{ detail:{ id:o.id } }));
      }catch{}
      render();
    });

    document.getElementById('statusSelect')?.addEventListener('change', (e)=>{
      const st = e.target.value;
      updateOrderStatus(o.id, st);
      try {
        window.dispatchEvent(new CustomEvent('admin:statusChanged',{ detail:{ id:o.id, status: st } }));
      }catch{}
      render();
    });
  }

  function render(){
    if (mode==='detail') detailView();
    else listView();
  }

  function openReceiptPreview(url){
    if(!url) return;
    const modal = document.getElementById('modal');
    const mb = document.getElementById('modalBody');
    const mt = document.getElementById('modalTitle');
    const ma = document.getElementById('modalActions');
    if (!modal || !mb || !mt || !ma){
      window.open(url, '_blank', 'noopener');
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
      <a class="btn btn--outline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть в новой вкладке</a>
      <a class="btn btn--primary" href="${escapeHtml(url)}" download>Скачать</a>
    `;
    modal.classList.add('show');
    document.getElementById('modalClose').onclick = ()=> modal.classList.remove('show');
  }

  function badgeMod(o){
    if (o.status==='новый') return 'badge--new';
    if (o.status==='принят') return 'badge--accept';
    if (o.status==='готов к отправке') return 'badge--done';
    return 'badge--progress';
  }

  render();
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

import {
  ORDER_STATUSES,
  getOrders,
  addOrder,
  acceptOrder,
  updateOrderStatus,
  seedOrdersOnce
} from '../core/orders.js';
import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

export function renderAdmin(){
  const v = document.getElementById('view');
  seedOrdersOnce();

  const filterTabs = [
    { key:'all', label:'Все' },
    { key:'new', label:'Новые' },
    { key:'active', label:'В работе' },
    { key:'done', label:'Завершённые' },
  ];
  let current = 'all';

  function ui(){
    const orders = getOrders();
    state.orders = orders;

    const filtered = orders.filter(o=>{
      if(current==='all') return true;
      if(current==='new') return o.status==='новый' || (!o.accepted && o.status!=='готов к отправке');
      if(current==='active') return o.accepted && o.status!=='готов к отправке';
      if(current==='done') return o.status==='готов к отправке';
      return true;
    });

    v.innerHTML = `
      <section class="section">
        <div class="admin-toolbar">
          <div class="admin-title">
            <i data-lucide="shield-check"></i>
            <span>Админ-панель</span>
          </div>
          <button id="exitClientUi" class="btn btn--outline btn--sm">Выйти</button>
        </div>

        <div class="admin-filters">
          <div class="chipbar admin-chips" id="admTabs" role="tablist">
            ${filterTabs.map(t=>`
              <button class="chip ${current===t.key?'active':''}" data-k="${t.key}" role="tab" aria-selected="${current===t.key}">${t.label}</button>
            `).join('')}
          </div>
          <div class="admin-actions">
            <button id="admAdd" class="btn btn--primary btn--sm"><i data-lucide="plus"></i><span>&nbsp;Новый заказ</span></button>
          </div>
        </div>

        <div id="admList" class="admin-list">
          ${filtered.length ? filtered.map(renderOrderCard).join('') : `
            <div class="empty">
              <i data-lucide="inbox"></i>
              <div>Пока нет заказов в этой категории</div>
            </div>
          `}
        </div>
      </section>
    `;
    window.lucide?.createIcons && lucide.createIcons();

    // выйти из админ-режима
    document.getElementById('exitClientUi')?.addEventListener('click', ()=>{
      document.body.classList.remove('admin-mode');
      location.hash = '#/account';
    });

    // переключение вкладок
    document.getElementById('admTabs')?.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip');
      if(!b) return;
      current = b.getAttribute('data-k');
      ui();
    });

    // модалка создания
    document.getElementById('admAdd')?.addEventListener('click', openCreateModal);

    // действия по карточкам
    document.querySelectorAll('.adm-accept').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        acceptOrder(id);
        ui();
      });
    });
    document.querySelectorAll('.adm-status').forEach(sel=>{
      sel.addEventListener('change', ()=>{
        const id = sel.getAttribute('data-id');
        const st = sel.value;
        updateOrderStatus(id, st);
        ui();
      });
    });

    // просмотр чека
    document.querySelectorAll('[data-receipt-url]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const url = btn.getAttribute('data-receipt-url');
        openReceiptPreview(url);
      });
    });
  }

  function renderOrderCard(o){
    const product = state.products?.find(p=> String(p.id)===String(o.productId));
    const title = product?.title || `Товар #${o.productId ?? '—'}`;
    const price = product?.price ? priceFmt(product.price) : '';

    const isDone = o.status === 'готов к отправке';
    const isNew  = o.status === 'новый' && !o.accepted;

    const receipt = o.paymentScreenshot ? `
      <div class="kv__row">
        <dt>Оплата</dt>
        <dd class="break">
          <button class="btn btn--xs btn--outline" data-receipt-url="${escapeHtml(o.paymentScreenshot)}">
            <i data-lucide="image"></i><span>&nbsp;Показать чек</span>
          </button>
          <a class="btn btn--xs btn--primary" href="${escapeHtml(o.paymentScreenshot)}" target="_blank" rel="noopener" download>
            <i data-lucide="download"></i><span>&nbsp;Скачать</span>
          </a>
        </dd>
      </div>
    ` : '';

    const productLink = o.link ? `
      <div class="kv__row">
        <dt>Товар</dt>
        <dd class="break"><a class="link" href="${escapeHtml(o.link)}">Открыть</a></dd>
      </div>
    ` : '';

    return `
      <article class="order-card">
        <div class="order-card__icon"><i data-lucide="package"></i></div>

        <div class="order-card__main">
          <div class="order-card__title ellipsis">
            ${escapeHtml(title)} ${price ? `· <span class="muted">${price}</span>`:''}
          </div>

          <dl class="kv">
            <div class="kv__row">
              <dt>Клиент</dt>
              <dd class="break">@${escapeHtml(o.username||'—')} · ${escapeHtml(o.phone||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Адрес</dt>
              <dd class="break">${escapeHtml(o.address||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Размер/цвет</dt>
              <dd class="break">${escapeHtml(o.size||'—')}${o.color?` · ${escapeHtml(o.color)}`:''}</dd>
            </div>
            <div class="kv__row">
              <dt>Плательщик</dt>
              <dd class="break">${escapeHtml(o.payerFullName||'—')}</dd>
            </div>
            ${receipt}
            ${productLink}
          </dl>
        </div>

        <div class="order-card__actions">
          <span class="badge" style="background:${badgeColor(o)}">${escapeHtml(o.status)}</span>
          ${isNew ? `<button class="btn btn--primary btn--xs adm-accept" data-id="${o.id}">Принять</button>`:''}
          <label class="select-wrap">
            <select class="select adm-status" data-id="${o.id}" ${isNew?'disabled':''}>
              ${ORDER_STATUSES.filter(s=>s!=='новый').map(s=>`
                <option value="${s}" ${o.status===s?'selected':''}>${s}</option>
              `).join('')}
            </select>
          </label>
          ${isDone?'<span class="muted text-xs">Завершён</span>':''}
        </div>
      </article>
    `;
  }

  function openCreateModal(){
    const modal = document.getElementById('modal');
    const mb = document.getElementById('modalBody');
    const mt = document.getElementById('modalTitle');
    const ma = document.getElementById('modalActions');
    mt.textContent = 'Новый заказ';
    mb.innerHTML = `
      <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <label class="field"><span>Product ID</span><input id="fProd" class="input" placeholder="например 101"></label>
        <label class="field"><span>Размер</span><input id="fSize" class="input" placeholder="например M"></label>
        <label class="field"><span>Цвет</span><input id="fColor" class="input" placeholder="например Черный"></label>
        <label class="field"><span>Телефон</span><input id="fPhone" class="input" placeholder="+998 ..."></label>
        <label class="field"><span>Username</span><input id="fUser" class="input" placeholder="telegram_username"></label>
        <label class="field"><span>Адрес</span><input id="fAddr" class="input" placeholder="город, улица ..."></label>
        <label class="field"><span>ФИО плательщика</span><input id="fPayer" class="input" placeholder="Фамилия Имя"></label>
        <label class="field"><span>Скрин оплаты (URL)</span><input id="fShot" class="input" placeholder="https://..."></label>
      </div>
    `;
    ma.innerHTML = `
      <button id="mCancel" class="btn btn--outline">Отмена</button>
      <button id="mOk" class="btn btn--primary">Создать</button>
    `;
    modal.classList.add('show');
    document.getElementById('modalClose').onclick = closeModal;
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('mOk').onclick = ()=>{
      const o = {
        productId: value('#fProd'),
        size: value('#fSize'),
        color: value('#fColor'),
        phone: value('#fPhone'),
        username: value('#fUser'),
        address: value('#fAddr'),
        payerFullName: value('#fPayer'),
        paymentScreenshot: value('#fShot'),
        status: 'новый',
      };
      if (o.productId) o.link = `#/product/${o.productId}`;
      addOrder(o);
      closeModal();
      ui();
    };
    function value(sel){ return (document.querySelector(sel)?.value || '').trim(); }
    function closeModal(){ modal.classList.remove('show'); }
  }

  function openReceiptPreview(url){
    if(!url) return;
    const modal = document.getElementById('modal');
    const mb = document.getElementById('modalBody');
    const mt = document.getElementById('modalTitle');
    const ma = document.getElementById('modalActions');
    mt.textContent = 'Чек оплаты';
    mb.innerHTML = `
      <div class="receipt-view">
        <div class="receipt-img-wrap">
          <img class="receipt-img" src="${escapeHtml(url)}" alt="Чек оплаты">
        </div>
        <div class="muted" style="font-size:12px">Если изображение не открылось — возможно, ссылка требует авторизацию или недоступна по CORS.</div>
      </div>
    `;
    ma.innerHTML = `
      <a class="btn btn--outline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть в новой вкладке</a>
      <a class="btn btn--primary" href="${escapeHtml(url)}" download>Скачать</a>
    `;
    modal.classList.add('show');
    document.getElementById('modalClose').onclick = ()=> modal.classList.remove('show');
  }

  function badgeColor(o){
    if (o.status==='новый') return '#ff9f43';
    if (o.status==='принят') return '#34c759';
    if (o.status==='готов к отправке') return '#5856d6';
    return '#1e90ff';
  }

  ui();
}

// утилита
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

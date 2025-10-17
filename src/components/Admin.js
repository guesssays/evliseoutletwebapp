import { ORDER_STATUSES, getOrders, saveOrders, addOrder, acceptOrder, updateOrderStatus, seedOrdersOnce } from '../core/orders.js';
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
    state.orders = orders; // синхронизация с клиентскими вьюхами

    const filtered = orders.filter(o=>{
      if(current==='all') return true;
      if(current==='new') return o.status==='новый' || (!o.accepted && o.status!=='готов к отправке');
      if(current==='active') return o.accepted && o.status!=='готов к отправке';
      if(current==='done') return o.status==='готов к отправке';
      return true;
    });

    v.innerHTML = `
      <section class="section admin-topbar">
        <div class="admin-title">
          <i data-lucide="shield-check"></i>
          <span>Админ панель</span>
        </div>
        <button id="exitClientUi" class="pill outline small">Выйти</button>
      </section>

      <section class="section">
        <div class="chipbar scrollable" id="admTabs">
          ${filterTabs.map(t=>`
            <button class="chip ${current===t.key?'active':''}" data-k="${t.key}">${t.label}</button>
          `).join('')}
          <span style="flex:1"></span>
          <button id="admAdd" class="pill primary mobile-full"><i data-lucide="plus"></i><span>&nbsp;Новый заказ</span></button>
        </div>

        <div class="notes notes-mobile" id="admList">
          ${filtered.length ? filtered.map(renderOrderItem).join('') : `
            <div class="notes-empty">Пока нет заказов в этой категории.</div>
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

    document.getElementById('admTabs')?.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip');
      if(!b) return;
      current = b.getAttribute('data-k');
      ui();
    });

    document.getElementById('admAdd')?.addEventListener('click', openCreateModal);

    // действия в списке
    document.querySelectorAll('.adm-accept').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        acceptOrder(id);
        syncAndRerender();
      });
    });

    document.querySelectorAll('.adm-status').forEach(sel=>{
      sel.addEventListener('change', ()=>{
        const id = sel.getAttribute('data-id');
        const st = sel.value;
        updateOrderStatus(id, st);
        syncAndRerender();
      });
    });
  }

  function renderOrderItem(o){
    const product = state.products?.find(p=> String(p.id)===String(o.productId));
    const title = product?.title || `Товар #${o.productId ?? '—'}`;
    const price = product?.price ? priceFmt(product.price) : '';

    const isDone = o.status === 'готов к отправке';
    const isNew  = o.status === 'новый' && !o.accepted;

    return `
      <div class="note note-mobile">
        <i data-lucide="package"></i>
        <div>
          <div class="note-title">${escapeHtml(title)} ${price ? `· <span class="muted">${price}</span>`:''}</div>
          <div class="note-sub">
            <b>Клиент:</b> @${escapeHtml(o.username||'—')} · ${escapeHtml(o.phone||'—')}<br>
            <b>Адрес:</b> ${escapeHtml(o.address||'—')}<br>
            <b>Размер:</b> ${escapeHtml(o.size||'—')} ${o.color?`· <span class="muted">${escapeHtml(o.color)}</span>`:''}<br>
            <b>Плательщик:</b> ${escapeHtml(o.payerFullName||'—')}
            ${o.paymentScreenshot ? `<br><a href="${escapeHtml(o.paymentScreenshot)}" target="_blank" rel="noopener">Скрин об оплате</a>`:''}
            ${o.link ? `<br><a href="${escapeHtml(o.link)}">Открыть товар</a>`:''}
          </div>
        </div>
        <div class="time right-col">
          <span class="badge" style="position:static; background:${badgeColor(o)}">${escapeHtml(o.status)}</span>
          ${isNew ? `<button class="pill primary mobile-full adm-accept" data-id="${o.id}">Принять заказ</button>`:''}
          <select class="pill mobile-full adm-status" data-id="${o.id}" ${isNew?'disabled':''}>
            ${ORDER_STATUSES.filter(s=>s!=='новый').map(s=>`
              <option value="${s}" ${o.status===s?'selected':''}>${s}</option>
            `).join('')}
          </select>
          ${isDone?'<span class="muted mini">Заказ завершён</span>':''}
        </div>
      </div>
    `;
  }

  function openCreateModal(){
    const modal = document.getElementById('modal');
    const mb = document.getElementById('modalBody');
    const mt = document.getElementById('modalTitle');
    const ma = document.getElementById('modalActions');
    mt.textContent = 'Новый заказ';
    mb.innerHTML = `
      <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px">
        <label>Product ID<input id="fProd" class="search" placeholder="например 101"></label>
        <label>Размер<input id="fSize" class="search" placeholder="например M"></label>
        <label>Цвет<input id="fColor" class="search" placeholder="например Черный"></label>
        <label>Телефон<input id="fPhone" class="search" placeholder="+998 ..."></label>
        <label>Username<input id="fUser" class="search" placeholder="telegram_username"></label>
        <label>Адрес<input id="fAddr" class="search" placeholder="город, улица ..."></label>
        <label>ФИО плательщика<input id="fPayer" class="search" placeholder="Фамилия Имя"></label>
        <label>Ссылка на скрин оплаты<input id="fShot" class="search" placeholder="https://..."></label>
      </div>
    `;
    ma.innerHTML = `
      <button id="mCancel" class="pill">Отмена</button>
      <button id="mOk" class="pill primary">Создать</button>
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
      syncAndRerender();
      closeModal();
    };
    function value(sel){ return (document.querySelector(sel)?.value || '').trim(); }
    function closeModal(){ modal.classList.remove('show'); }
  }

  function badgeColor(o){
    if (o.status==='новый') return '#ff9f43';
    if (o.status==='принят') return '#34c759';
    if (o.status==='готов к отправке') return '#5856d6';
    return '#1e90ff';
  }

  function syncAndRerender(){
    state.orders = getOrders();
    const ev = new CustomEvent('force:rerender');
    window.dispatchEvent(ev);
    ui();
  }

  ui();
}

// утилита
function escapeHtml(s=''){
  return s.replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

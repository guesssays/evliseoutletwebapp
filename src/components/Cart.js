import { state, persistCart, updateCartBadge } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { addOrder } from '../core/orders.js';
import { getPayCardNumber } from '../core/payments.js';
import { persistProfile } from '../core/state.js';

export function renderCart(){
  const v = document.getElementById('view');
  const items = state.cart.items
    .map(it => ({ ...it, product: state.products.find(p => String(p.id) === String(it.productId)) }))
    .filter(x => x.product);

  window.setTabbarMenu?.('cart');

  if (!items.length){
    v.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="cartBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
        Корзина
      </div>
      <section class="checkout"><div class="cart-sub">Корзина пуста</div></section>`;
    window.lucide?.createIcons && lucide.createIcons();
    document.getElementById('cartBack')?.addEventListener('click', ()=>history.back());
    window.setTabbarMenu?.('cart');
    return;
  }

  const total = items.reduce((s,x)=> s + x.qty * x.product.price, 0);
  const ad = state.addresses.list.find(a=>a.id===state.addresses.defaultId) || null;

  v.innerHTML = `
  <div class="section-title" style="display:flex;align-items:center;gap:10px">
    <button class="square-btn" id="cartBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
    Оформление
  </div>
  <section class="checkout" id="cList">
    ${items.map(x=>`
      <div class="cart-row" data-id="${String(x.product.id)}" data-size="${x.size||''}" data-color="${x.color||''}">
        <div class="cart-img"><img src="${x.product.images?.[0]||''}" alt=""></div>
        <div>
          <div class="cart-title" style="overflow-wrap:anywhere">${x.product.title}</div>
          <div class="cart-sub">${x.size?`Размер ${x.size}`:''} ${x.color?`• ${x.color}`:''}</div>
          <div class="cart-price">${priceFmt(x.product.price)}</div>
        </div>
        <div class="qty-mini">
          <button class="ctrl dec" aria-label="Минус"><i data-lucide="minus"></i></button>
          <span>${x.qty}</span>
          <button class="ctrl inc" aria-label="Плюс"><i data-lucide="plus"></i></button>
        </div>
      </div>`).join('')}

    <div class="shipping">
      <div class="address-row">
        <div class="address-left">
          <div class="cart-title">Адрес доставки</div>
          ${ad ? `<div class="cart-sub">${ad.nickname} — ${ad.address}</div>` :
            `<div class="cart-sub">Адрес не указан</div>`}
        </div>
        <a class="pill" href="#/account/addresses">${ad ? 'Изменить адрес' : 'Добавить адрес'}</a>
      </div>
    </div>

    <div class="payline">
      <div class="payrow"><span>Итого (${items.reduce((s,i)=>s+i.qty,0)} шт.)</span><b>${priceFmt(total)}</b></div>
      <div class="payrow"><span>Доставка</span><b>${priceFmt(0)}</b></div>
      <div class="payrow"><span>Скидка</span><b>${priceFmt(0)}</b></div>
    </div>
  </section>`;
  window.lucide?.createIcons && lucide.createIcons();

  document.getElementById('cartBack')?.addEventListener('click', ()=>history.back());

  document.querySelectorAll('.cart-row').forEach(row=>{
    const id   = row.getAttribute('data-id');
    const size = row.getAttribute('data-size') || null;
    const color= row.getAttribute('data-color') || null;

    row.querySelector('.inc')?.addEventListener('click', ()=> changeQty(id,size,color, +1));
    row.querySelector('.dec')?.addEventListener('click', ()=> changeQty(id,size,color, -1));
  });

  window.setTabbarCTA?.({
    html: `<i data-lucide="credit-card"></i><span>Оформить заказ</span>`,
    onClick(){ checkoutFlow(items, ad, total); }
  });
}

function changeQty(productId,size,color,delta){
  const it = state.cart.items.find(a =>
    String(a.productId)===String(productId) &&
    (a.size||null)===(size||null) &&
    (a.color||null)===(color||null)
  );
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) return remove(productId,size,color);
  persistCart(); updateCartBadge(); renderCart();
}

function remove(productId,size,color){
  state.cart.items = state.cart.items.filter(a => !(
    String(a.productId)===String(productId) &&
    (a.size||null)===(size||null) &&
    (a.color||null)===(color||null)
  ));
  persistCart(); updateCartBadge(); toast('Удалено'); renderCart();
}

/* ======================
   Новый сценарий чекаута
   ====================== */
function checkoutFlow(items, addr, total){
  if (!items?.length){ toast('Корзина пуста'); return; }
  if (!addr){ toast('Укажите адрес доставки'); location.hash='#/account/addresses'; return; }

  // 1) Модалка подтверждения данных
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  const savedPhone = state.profile?.phone || '';
  const savedPayer = state.profile?.payerFullName || '';

  mt.textContent = 'Подтверждение данных';
  mb.innerHTML = `
    <div class="form-grid">
      <label class="field"><span>Номер телефона</span>
        <input id="cfPhone" class="input" placeholder="+998 ..." value="${escapeHtml(savedPhone)}">
      </label>
      <label class="field"><span>ФИО плательщика</span>
        <input id="cfPayer" class="input" placeholder="Фамилия Имя" value="${escapeHtml(savedPayer)}">
      </label>
      <label class="field"><span>Адрес доставки</span>
        <input id="cfAddr" class="input" value="${escapeHtml(addr.address)}">
        <div class="helper">Сохранённый адрес: <b>${escapeHtml(addr.nickname)}</b> — <a class="link" href="#/account/addresses">изменить</a></div>
      </label>
      <div class="field">
        <span>Товары в заказе</span>
        <ul style="margin:6px 0 0; padding-left:18px; color:#444">
          ${items.map(x=>`<li>${escapeHtml(x.product.title)} · ${x.size?`размер ${escapeHtml(x.size)} `:''}${x.color?`· ${escapeHtml(x.color)} `:''}×${x.qty}</li>`).join('')}
        </ul>
      </div>
      <label class="field" style="display:flex;align-items:center;gap:10px">
        <input id="cfSavePhone" type="checkbox" ${savedPhone?'checked':''}>
        <span>Запомнить телефон</span>
      </label>
      <label class="field" style="display:flex;align-items:center;gap:10px">
        <input id="cfSavePayer" type="checkbox" ${savedPayer?'checked':''}>
        <span>Запомнить ФИО плательщика</span>
      </label>
    </div>
  `;
  ma.innerHTML = `
    <button id="cfCancel" class="pill">Отмена</button>
    <button id="cfNext" class="pill primary">Далее к оплате</button>
  `;
  modal.classList.add('show');
  document.getElementById('modalClose').onclick = close;
  document.getElementById('cfCancel').onclick = close;
  document.getElementById('cfNext').onclick = ()=>{
    const phone = (document.getElementById('cfPhone')?.value||'').trim();
    const payer = (document.getElementById('cfPayer')?.value||'').trim();
    const address= (document.getElementById('cfAddr')?.value||'').trim();
    const savePhone = document.getElementById('cfSavePhone')?.checked;
    const savePayer = document.getElementById('cfSavePayer')?.checked;

    if (!phone){ toast('Укажите номер телефона'); return; }
    if (!address){ toast('Укажите адрес'); return; }

    if (!state.profile) state.profile = {};
    if (savePhone){ state.profile.phone = phone; }
    if (savePayer){ state.profile.payerFullName = payer; }
    persistProfile();

    close();
    openPayModal({ items, address, phone, payer, total });
  };

  function close(){ modal.classList.remove('show'); }
}

function openPayModal({ items, address, phone, payer, total }){
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  const card = getPayCardNumber();

  mt.textContent = 'Оплата заказа';
  mb.innerHTML = `
    <div class="form-grid">
      <div class="cart-title" style="font-size:18px">К оплате: ${priceFmt(total)}</div>
      <div class="note" style="grid-template-columns: auto 1fr">
        <i data-lucide="credit-card"></i>
        <div>
          <div class="note-title">Переведите на карту</div>
          <div class="note-sub" style="user-select:all">${escapeHtml(card)}</div>
        </div>
      </div>
      <label class="field"><span>Загрузить скриншот оплаты</span>
        <input id="payShot" type="file" accept="image/*" class="input">
        <div class="helper">или вставьте URL изображения чека</div>
        <input id="payShotUrl" class="input" placeholder="https://...">
      </label>
    </div>
  `;
  ma.innerHTML = `
    <button id="payBack" class="pill">Назад</button>
    <button id="payDone" class="pill primary">Подтвердить оплату</button>
  `;
  modal.classList.add('show');
  window.lucide?.createIcons && lucide.createIcons();

  document.getElementById('modalClose').onclick = close;
  document.getElementById('payBack').onclick = close;
  document.getElementById('payDone').onclick = async ()=>{
    const file = document.getElementById('payShot')?.files?.[0] || null;
    const urlInput = (document.getElementById('payShotUrl')?.value || '').trim();

    let shotUrl = '';
    if (file){
      try{ shotUrl = URL.createObjectURL(file); }catch{}
    }else if (urlInput){
      shotUrl = urlInput;
    }

    const first = items[0];
    const orderId = addOrder({
      cart: items.map(x=>({
        id: x.product.id,
        title: x.product.title,
        price: x.product.price,
        qty: x.qty,
        size: x.size || null,
        color: x.color || null,
        images: x.product.images || []
      })),
      productId: first?.product?.id || null,
      size: first?.size || null,
      color: first?.color || null,
      link: first?.product?.id ? `#/product/${first.product.id}` : '',
      total,
      currency: 'UZS',
      address,
      phone,
      username: state.user?.username || '',
      userId: state.user?.id || null,            // <== ВАЖНО: привязка заказа к пользователю
      payerFullName: payer || '',
      paymentScreenshot: shotUrl || '',
      status: 'новый',
      accepted: false
    });

    state.cart.items = [];
    persistCart(); updateCartBadge();

    close();
    toast('Заказ оформлен, ожидает подтверждения');
    location.hash = '#/orders';

    try{
      const ev = new CustomEvent('client:orderPlaced', { detail:{ id: orderId } });
      window.dispatchEvent(ev);
    }catch{}
  };

  function close(){ modal.classList.remove('show'); }
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

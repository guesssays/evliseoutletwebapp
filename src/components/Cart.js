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
          ${ad ? `<div class="cart-sub">${escapeHtml(ad.nickname)} — ${escapeHtml(ad.address)}</div>` :
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

/* checkout flow (коротко оставляю прежнюю логику UI) */
function checkoutFlow(items, addr, total){
  if (!items?.length){ toast('Корзина пуста'); return; }
  if (!addr){ toast('Укажите адрес доставки'); location.hash='#/account/addresses'; return; }

  // простая модалка для примера: сразу к оплате
  openPayModal({ items, address: addr.address, phone: state.profile?.phone||'', payer: state.profile?.payerFullName||'', total });
}

function openPayModal({ items, address, phone, payer, total }){
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  const card = getPayCardNumber();

  let shotDataUrl = '';
  let shotBusy = false;

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
      <label class="field"><span>Скриншот оплаты (файл или URL)</span></label>
      <input id="payShot" type="file" accept="image/*" class="input">
      <input id="payShotUrl" class="input" placeholder="https://...">
    </div>
  `;
  ma.innerHTML = `
    <button id="payBack" class="pill">Назад</button>
    <button id="payDone" class="pill primary">Подтвердить оплату</button>
  `;
  modal.classList.add('show');
  window.lucide?.createIcons && lucide.createIcons();

  const fileInput   = document.getElementById('payShot');
  const urlInput    = document.getElementById('payShotUrl');

  fileInput?.addEventListener('change', async ()=>{
    const file = fileInput.files?.[0];
    if (!file){ shotDataUrl=''; return; }
    if (!/^image\//i.test(file.type)){ toast('Загрузите изображение'); shotDataUrl=''; return; }
    try{
      shotBusy = true;
      const { dataUrl } = await compressImageToDataURL(file, 1600, 1600, 0.82);
      shotDataUrl = dataUrl;
      urlInput.value = '';
    }finally{ shotBusy = false; }
  });

  document.getElementById('modalClose').onclick = close;
  document.getElementById('payBack').onclick = close;
  document.getElementById('payDone').onclick = async ()=>{
    if (shotBusy){ toast('Подождите, изображение ещё обрабатывается'); return; }
    const urlRaw = (urlInput?.value || '').trim();
    let paymentScreenshot = '';
    if (shotDataUrl){ paymentScreenshot = shotDataUrl; }
    else if (urlRaw){
      if (!/^https?:\/\//i.test(urlRaw)){ toast('Некорректный URL чека'); return; }
      paymentScreenshot = urlRaw;
    }else{
      toast('Добавьте файл чека или укажите URL'); return;
    }

    const first = items[0];
    const orderId = await addOrder({
      cart: items.map(x=>({
        id: x.product.id, title: x.product.title, price: x.product.price,
        qty: x.qty, size: x.size || null, color: x.color || null,
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
      userId: state.user?.id || null,
      payerFullName: payer || '',
      paymentScreenshot,
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

/* utils */
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function compressImageToDataURL(file, maxW=1600, maxH=1600, quality=0.82){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      try{
        let { width:w, height:h } = img;
        const ratio = Math.min(1, maxW / w, maxH / h);
        const outW = Math.max(1, Math.round(w * ratio));
        const outH = Math.max(1, Math.round(h * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d', { alpha:false });
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, outW, outH });
      }catch(e){ URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = (e)=>{ URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

import { state, persistCart, updateCartBadge } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { toast } from '../core/toast.js';

export function renderCart(){
  const v=document.getElementById('view');
  const items = state.cart.items.map(it=>({...it, product: state.products.find(p=>String(p.id)===String(it.productId))})).filter(x=>x.product);
  if (!items.length){
    v.innerHTML = `<div class="section-title">Корзина</div>
      <section class="checkout"><div class="cart-sub">Корзина пуста</div></section>`;
    return;
  }
  const total = items.reduce((s,x)=> s + x.qty * x.product.price, 0);

  const ad = state.addresses.list.find(a=>a.id===state.addresses.defaultId) || null;

  v.innerHTML = `<div class="section-title">Оформление</div>
  <section class="checkout" id="cList">
    ${items.map(x=>`
      <div class="cart-row" data-id="${x.product.id}" data-size="${x.size||''}" data-color="${x.color||''}">
        <div class="cart-img"><img src="${x.product.images?.[0]||''}" alt=""></div>
        <div>
          <div class="cart-title">${x.product.title}</div>
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
        <div>
          <div class="cart-title">Адрес доставки</div>
          ${ad ? `<div class="cart-sub">${ad.nickname} — ${ad.address}</div>` :
            `<div class="cart-sub">Адрес не указан</div>`}
        </div>
        <a class="pill" href="#/account/addresses" style="white-space:nowrap">${ad ? 'Изменить адрес' : 'Добавить адрес'}</a>
      </div>
    </div>

    <div class="payline">
      <div class="payrow"><span>Итого (${items.reduce((s,i)=>s+i.qty,0)} шт.)</span><b>${priceFmt(total)}</b></div>
      <div class="payrow"><span>Доставка</span><b>${priceFmt(0)}</b></div>
      <div class="payrow"><span>Скидка</span><b>${priceFmt(0)}</b></div>
    </div>
  </section>
  <div class="paybtn"><button id="payBtn" class="btn">Оформить заказ</button></div>`;
  window.lucide?.createIcons && lucide.createIcons();

  document.querySelectorAll('.cart-row').forEach(row=>{
    const id=Number(row.getAttribute('data-id'));
    const size=row.getAttribute('data-size')||null; const color=row.getAttribute('data-color')||null;
    row.querySelector('.inc').onclick=()=> changeQty(id,size,color, +1);
    row.querySelector('.dec').onclick=()=> changeQty(id,size,color, -1);
  });
  document.getElementById('payBtn').onclick=()=> checkout(items, ad);
}

function changeQty(productId,size,color,delta){
  const it = state.cart.items.find(a=>a.productId===productId && a.size===size && a.color===color);
  if (!it) return; it.qty += delta; if (it.qty<=0) remove(productId,size,color);
  persistCart(); updateCartBadge(); renderCart();
}
function remove(productId,size,color){
  state.cart.items = state.cart.items.filter(a=>!(a.productId===productId && a.size===size && a.color===color));
  persistCart(); updateCartBadge(); toast('Удалено'); renderCart();
}

function checkout(items, addr){
  if (!addr){ toast('Укажите адрес доставки'); location.hash='#/account/addresses'; return; }
  const order = {
    cart: items.map(x=>({id:x.product.id,title:x.product.title,price:x.product.price,qty:x.qty,size:x.size||null,color:x.color||null})),
    total: items.reduce((s,x)=> s + x.qty * x.product.price, 0),
    currency:'UZS', comment:'', address: addr, ts: Date.now()
  };
  const tg=window.Telegram?.WebApp;
  const payload = JSON.stringify(order);
  if (tg?.sendData){ tg.sendData(payload); toast('Заказ отправлен менеджеру в Telegram'); }
  else { navigator.clipboard.writeText(payload); toast('WebApp вне Telegram: заказ (JSON) скопирован'); }
}

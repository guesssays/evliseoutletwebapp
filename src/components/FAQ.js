export function renderFAQ(){
  const view=document.querySelector('#view');
  view.innerHTML = `
    <section class="section">
      <div class="section-title">FAQ</div>
      <div class="checkout">
        <details class="item" open>
          <summary style="font-weight:800">Как оформить заказ?</summary>
          <div class="cart-sub">Добавьте товар в корзину, перейдите в «Корзина» и нажмите «Оформить заказ». Заказ уйдёт менеджеру в Telegram.</div>
        </details>
        <details class="item">
          <summary style="font-weight:800">Оплата и доставка</summary>
          <div class="cart-sub">Оплата по согласованию с менеджером. Доставка курьером или самовывоз.</div>
        </details>
        <details class="item">
          <summary style="font-weight:800">Возвраты и обмен</summary>
          <div class="cart-sub">В течение 14 дней при сохранении товарного вида.</div>
        </details>
        <details class="item">
          <summary style="font-weight:800">Как подобрать размер?</summary>
          <div class="cart-sub">Смотрите «Размерную сетку» в карточке товара.</div>
        </details>
      </div>
    </section>`;
}

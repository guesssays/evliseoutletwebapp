import { t } from '../core/i18n.js';
export function renderFAQ(){
  closeDrawerIfNeeded();
  const view=document.querySelector('#view');
  view.innerHTML = `
    <section class="section">
      <div class="h1">${t('faq')}</div>
      <div class="faq">
        <details class="item" open>
          <summary>Как оформить заказ? <span class="badge">шаг-за-шагом</span></summary>
          <div class="content"><p>Добавьте товар в корзину, перейдите в «${t('cart')}» и нажмите «${t('proceed')}». Заказ уйдёт менеджеру в Telegram.</p></div>
        </details>
        <details class="item"><summary>Оплата и доставка</summary><div class="content"><p>Оплата по согласованию с менеджером. Доставка курьером/самовывоз.</p></div></details>
        <details class="item"><summary>Возвраты и обмен</summary><div class="content"><p>В течение 14 дней при сохранении товарного вида. Уточняйте условия в поддержке.</p></div></details>
        <details class="item"><summary>Как подобрать размер?</summary><div class="content"><p>Смотрите раздел «${t('sizeChart')}» в карточке товара или напишите нам в поддержку.</p></div></details>
      </div>
    </section>`;
}
function closeDrawerIfNeeded(){ const d=document.querySelector('#drawer'); const o=document.querySelector('#overlay'); d.classList.remove('open'); o.classList.remove('show'); }

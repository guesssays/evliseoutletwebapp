// src/components/FAQ.js
import { el } from '../core/utils.js';

const OP_CHAT_URL = 'https://t.me/evliseorder';

export function renderFAQ(){
  const v = document.getElementById('view');

  v.innerHTML = `
    <section class="section">
      <div class="section-title">Помощь</div>

      <div class="notes" style="margin-top:8px">
        <div class="note">
          <i data-lucide="truck"></i>
          <div>
            <div class="note-title">Сроки доставки</div>
            <div class="note-sub">Обычно <b>14–16 дней</b> с момента подтверждения заказа. Если срок изменится — мы заранее уведомим.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="credit-card"></i>
          <div>
            <div class="note-title">Оплата</div>
            <div class="note-sub">Оплата переводом на карту, затем вы загружаете скриншот чека в приложении при оформлении заказа.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="package"></i>
          <div>
            <div class="note-title">Что происходит после оплаты?</div>
            <div class="note-sub">Мы проверяем платёж и берём заказ в работу. Как только посылка будет готова к отправке — оператор свяжется, чтобы уточнить детали.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="clock"></i>
          <div>
            <div class="note-title">Как отследить статус?</div>
            <div class="note-sub">Открывайте раздел <b>Мои заказы</b>. Там видно текущий статус и история изменений.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="shirt"></i>
          <div>
            <div class="note-title">Размеры и консультация</div>
            <div class="note-sub">Не уверены с размером? Напишите оператору — подскажем по меркам и посадке перед оплатой.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="undo-2"></i>
          <div>
            <div class="note-title">Обмен/возврат</div>
            <div class="note-sub">Если товар с заводским браком или пришла не та позиция — мы решим вопрос. Свяжитесь с оператором, приложите фото/видео распаковки.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="help-circle"></i>
          <div>
            <div class="note-title">Можно ли изменить заказ после оплаты?</div>
            <div class="note-sub">Иногда — да, если заказ ещё не ушёл в обработку/отправку. Напишите оператору, укажете номер заказа — мы проверим возможность.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="wallet"></i>
          <div>
            <div class="note-title">Стоимость доставки</div>
            <div class="note-sub">Сейчас доставка включена в цену (для отображения в корзине указана как 0). Если появятся платные опции — сообщим в оформлении.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="shield-check"></i>
          <div>
            <div class="note-title">Безопасность и гарантия</div>
            <div class="note-sub">Все заказы оформляются внутри приложения. Чеки, статусы и история — у вас под рукой. При спорных ситуациях — всё решается через оператора.</div>
          </div>
        </div>

        <div class="note">
          <i data-lucide="message-circle"></i>
          <div>
            <div class="note-title">Связаться с оператором</div>
            <div class="note-sub">Задайте вопрос в чате — отвечаем как можно быстрее. Если вопрос по оформленному заказу — укажите номер (например, #12345).</div>
          </div>
          <a class="pill" id="faqSupport"><i data-lucide="send"></i><span>Поддержка</span></a>
        </div>
      </div>
    </section>
  `;

  window.lucide?.createIcons && lucide.createIcons();

  document.getElementById('faqSupport')?.addEventListener('click', ()=>{
    openExternal(OP_CHAT_URL);
  });
}

/* helpers */
function openExternal(url){
  try{
    const tg = window?.Telegram?.WebApp;
    if (tg?.openTelegramLink){ tg.openTelegramLink(url); return; }
    if (tg?.openLink){ tg.openLink(url, { try_instant_view:false }); return; }
  }catch{}
  window.open(url, '_blank', 'noopener');
}

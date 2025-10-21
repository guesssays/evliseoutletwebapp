// src/components/FAQ.js
const OP_CHAT_URL = 'https://t.me/evliseorder';

export function renderFAQ(){
  const v = document.getElementById('view');

  // Фиксируем таббар на вкладке "account"
  try{
    window.setTabbarMenu?.('account');
  }catch{}

  // данные аккордеона
  const items = [
    {
      icon: 'truck',
      title: 'Сроки доставки',
      html: `Обычно <b>14–16 дней</b> с момента подтверждения заказа. Если срок изменится — мы заранее уведомим.`
    },
    {
      icon: 'credit-card',
      title: 'Оплата',
      html: `Оплата переводом на карту — номер покажем на шаге оплаты. После перевода загрузите <b>скриншот чека</b> прямо в оформлении.`
    },
    {
      icon: 'package',
      title: 'Что происходит после оплаты?',
      html: `Мы проверяем платёж и берём заказ в работу. Как только посылка будет готова к отправке — оператор свяжется и уточнит детали доставки.`
    },
    {
      icon: 'clock',
      title: 'Как отследить статус?',
      html: `Откройте раздел <b>Мои заказы</b> — там виден текущий этап и история изменений по каждому заказу.`
    },
    {
      icon: 'coins',
      title: 'Кэшбек: как это работает',
      html: `
        <p><b>Начисление.</b> За каждый оплаченный товар вы получаете кэшбек в баллах: обычно <b>5%</b> от цены.</p>
        <p><b>Дозревание.</b> Баллы становятся доступными через <b>24 часа</b> после оплаты.</p>
        <p><b>Использование.</b> На шаге оформления заказа можно оплатить часть суммы баллами. Ваш баланс и историю смотрите в разделе
        <a href="#/account/cashback">«Мой кэшбек»</a>.</p>
        <p class="muted">Подсказка: если вы пришли по реф-ссылке, на <b>первый заказ — x2</b> кэшбек.</p>
      `
    },
    {
      icon: 'users',
      title: 'Реферальная программа',
      html: `
        <p><b>Как это работает.</b> Делитесь вашей реф-ссылкой: заказы приглашённых приносят вам <b>5% бонусом</b> от их покупок.</p>
        <p><b>Бонус для друга.</b> По вашей ссылке первый заказ даёт другу <b>x2 кэшбек</b>.</p>
        <p><b>Где взять ссылку.</b> В разделе <a href="#/account/referrals">«Мои рефералы»</a> — там же статистика за месяц.</p>
        <p class="muted">Ограничение: не более 10 новых рефералов в месяц.</p>
      `
    },
    {
      icon: 'shirt',
      title: 'Размеры и консультация',
      html: `Не уверены с размером? Напишите оператору — подскажем по меркам и посадке перед оплатой.`
    },
    {
      icon: 'undo-2',
      title: 'Обмен / возврат',
      html: `Если товар с заводским браком или пришла неверная позиция — решим вопрос. Свяжитесь с оператором и приложите фото/видео распаковки.`
    },
    {
      icon: 'help-circle',
      title: 'Можно ли изменить заказ после оплаты?',
      html: `Иногда — да, если заказ ещё не ушёл в обработку/отправку. Напишите оператору, укажите номер заказа — проверим возможность.`
    },
    {
      icon: 'wallet',
      title: 'Стоимость доставки',
      html: `Доставка осуществляется за счёт заказчика, с помощью сервиса Яндекс.`
    },
    {
      icon: 'shield-check',
      title: 'Безопасность и гарантия',
      html: `Все действия — внутри приложения: чеки, статусы и история. При спорных ситуациях всё решается через оператора.`
    }
  ];

  v.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="faqBack"><i data-lucide="chevron-left"></i></button>
        Помощь
      </div>

      <style>
        /* ==== A C C O R D I O N  (адаптив) ==== */
        .faq{
          margin: 0 0 12px;
          display: grid;
          gap: 10px;
        }
        .faq details{
          border:1px solid var(--stroke);
          border-radius:14px;
          background:#fff;
          overflow:hidden;
        }
        .faq summary{
          list-style:none;
          cursor:pointer;
          padding:14px 14px;
          display:grid;
          grid-template-columns:auto 1fr auto;
          gap:12px;
          align-items:center;
          user-select:none;
          outline:none;
        }
        .faq summary::-webkit-details-marker{ display:none; }

        .faq .ico{ width:22px; height:22px; opacity:.9; color:inherit; }
        .faq .q{
          font-weight:800;
          line-height:1.2;
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .faq .chev{
          width:18px; height:18px;
          transform:rotate(0deg);
          transition: transform .18s ease;
          opacity:.7;
        }
        details[open] .chev{ transform:rotate(180deg); }

        .faq .a{
          padding: 0 14px 14px 54px; /* отступ под иконку */
          color: var(--muted);
          font-size: 14px;
          line-height: 1.45;
        }
        .faq .a b{ color: var(--text); }

        /* крупные тач-цели на компактных экранах */
        @media (max-width: 420px){
          .faq summary{ padding:13px 12px; gap:10px; }
          .faq .a{ padding: 0 12px 12px 50px; font-size: 14px; }
        }

        /* компактный блок поддержки */
        .support-strip{
          margin-top: 6px;
          border:1px solid var(--stroke);
          border-radius:14px;
          background:#fff;
          display:flex;
          align-items:center;
          gap:10px;
          padding:10px 12px;
        }
        .support-strip i{ width:20px; height:20px; opacity:.9; }
        .support-text{ min-width:0; flex:1; }
        .support-title{
          font-weight:800;
          line-height:1.1;
          font-size:14px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .support-sub{
          color:var(--muted);
          font-size:12px;
          line-height:1.2;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        /* на узких экранах показываем только одну короткую строку */
        @media (max-width: 420px){
          .support-sub{ display:none; }
        }
        .support-strip .pill{
          flex:0 0 auto;
          height:36px;
          padding:0 12px;
          border-radius:12px;
        }
        .support-strip .pill i{ width:18px; height:18px; }
      </style>

      <div class="faq" id="faqList">
        ${items.map((it, i) => `
          <details ${i===0 ? 'open' : ''}>
            <summary>
              <i data-lucide="${it.icon}" class="ico"></i>
              <div class="q">${escapeHtml(it.title)}</div>
              <i data-lucide="chevron-down" class="chev"></i>
            </summary>
            <div class="a">${it.html}</div>
          </details>
        `).join('')}

        <!-- Компактная поддержка: одна строка + кнопка -->
        <div class="support-strip">
          <i data-lucide="message-circle"></i>
          <div class="support-text">
            <div class="support-title">Нужна помощь?</div>
            <div class="support-sub">Напишите оператору — ответим быстро</div>
          </div>
          <button id="faqSupport" class="pill"><i data-lucide="send"></i><span>Поддержка</span></button>
        </div>
      </div>
    </section>
  `;

  window.lucide?.createIcons && lucide.createIcons();

  // Назад
  document.getElementById('faqBack')?.addEventListener('click', ()=> history.back());

  // Поддержка
  document.getElementById('faqSupport')?.addEventListener('click', ()=>{
    openExternal(OP_CHAT_URL);
  });

  // Делегирование кликов по summary: режим «один открыт»
  const faq = document.getElementById('faqList');
  faq?.addEventListener('click', (e)=>{
    const sm = e.target.closest('summary');
    if (!sm) return;
    const host = sm.parentElement;
    if (!host.open){
      faq.querySelectorAll('details[open]').forEach(d => { if (d!==host) d.removeAttribute('open'); });
    }
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

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

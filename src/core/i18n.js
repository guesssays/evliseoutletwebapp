import { DEFAULT_LANG } from './config.js';
export const i18n = {
  ru: { categories:'Категории', newItems:'Новинки', freshFromIg:'Свежие позиции из Instagram', filters:'Фильтры',
    items:'товаров', size:'Размер', color:'Цвет', material:'Материал', addToCart:'Добавить в корзину', description:'Описание',
    sku:'Артикул', category:'Категория', sizeChart:'Размерная сетка', cart:'Корзина', favorites:'Избранное',
    orderComment:'Комментарий к заказу', orderCommentPlaceholder:'Напишите пожелания: примерка, удобное время, адрес…',
    total:'Сумма', proceed:'Оформить заказ', back:'Вернуться', empty:'Корзина пуста.', notFound:'Ничего не найдено. Измените фильтры.',
    faq:'FAQ', home:'Главная', support:'Поддержка', inStockOnly:'Только в наличии', clear:'Сбросить', apply:'Применить',
    cancel:'Отмена', emptyFav:'Список избранного пуст.', cleared:'Корзина очищена',
    ob_welcome_t:'Добро пожаловать 👋', ob_welcome_d:'Коротко покажем, как пользоваться приложением.',
    ob_actions_t:'Кнопки на карточке товара', ob_actions_d:'♥ — добавить в избранное.\nДом — вернуться на главную.\n+ — добавить в корзину.',
    ob_filters_t:'Фильтры и категории', ob_filters_d:'Откройте «Фильтры», чтобы отобрать товары.\nКатегории — в боковом меню (≡).',
    ob_gallery_t:'Галерея и реальные фото', ob_gallery_d:'Листайте миниатюры, кликайте на «Реальные фото» — они откроются во весь экран.',
    ob_cart_t:'Оформление заказа', ob_cart_d:'Товары из корзины одним нажатием отправятся менеджеру в Telegram.',
    ob_next:'Далее', ob_skip:'Пропустить', ob_start:'Начнём' },
  uz: { categories:'Kategoriyalar', newItems:'Yangi tovarlar', freshFromIg:'Instagram’dan yangi pozitsiyalar', filters:'Filtrlar',
    items:'ta mahsulot', size:'O‘lcham', color:'Rang', material:'Material', addToCart:'Savatga qo‘shish', description:'Tavsif',
    sku:'Artikul', category:'Kategoriya', sizeChart:'O‘lcham jadvali', cart:'Savat', favorites:'Sevimlilar',
    orderComment:'Buyurtma uchun izoh', orderCommentPlaceholder:'Istaklaringizni yozing: kiyib ko‘rish, vaqt, manzil…',
    total:'Jami', proceed:'Buyurtmani rasmiylashtirish', back:'Qaytish', empty:'Savat bo‘sh.', notFound:'Hech narsa topilmadi. Filtrlarni o‘zgartiring.',
    faq:'Savol-javob', home:'Bosh sahifa', support:'Qo‘llab-quvvatlash', inStockOnly:'Faqat mavjud', clear:'Tozalash', apply:'Qo‘llash',
    cancel:'Bekor qilish', emptyFav:'Sevimlilar ro‘yxati bo‘sh.', cleared:'Savat tozalandi',
    ob_welcome_t:'Xush kelibsiz 👋', ob_welcome_d:'Ilova bilan qanday ishlashni qisqacha ko‘rsatamiz.',
    ob_actions_t:'Tovar kartasidagi tugmalar', ob_actions_d:'♥ — sevimlilarga qo‘shish.\nUy — bosh sahifa.\n+ — savatga qo‘shish.',
    ob_filters_t:'Filtrlar va kategoriyalar', ob_filters_d:'“Filtrlar” orqali saralang.\nKategoriyalar — yon menyuda (≡).',
    ob_gallery_t:'Galereya va real suratlar', ob_gallery_d:'Miniaturalarni aylantiring, “Real suratlar” ni bosing — to‘liq ekranda ochiladi.',
    ob_cart_t:'Buyurtma berish', ob_cart_d:'Savatdagi tovarlar Telegram menejeriga bitta bosishda yuboriladi.',
    ob_next:'Keyingi', ob_skip:'O‘tkazib yuborish', ob_start:'Boshlaymiz' }
};
export let lang = DEFAULT_LANG;
export const t = (k)=> i18n[lang][k] || k;
export function setLang(next){
  lang = next; localStorage.setItem('evlise_lang', next);
  const btn = document.querySelector('#langBtn'); if (btn) btn.textContent = next.toUpperCase();
}
export function toggleLanguage(){
  setLang(lang==='ru'?'uz':'ru');
}

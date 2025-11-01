// src/core/promo.js
// Универсальная промо-подсистема: единая конфигурация + хелперы.
// ЛЕГКО ВКЛ/ВЫКЛ: state.promo.enabled = true/false

import { state } from './state.js';

/** === Конфиг по умолчанию (можно переопределить из state.js при инициализации) === */
function defaults() {
  return {
    enabled: false,
    slug: 'newyear-2026',
    title: 'Новогодняя акция',
    // три баннера (разных видов), ведущих на одну страницу
    banners: [
      { id: 'bn1', img: 'assets/promo/newyear/banner-1.jpg', alt: 'Новогодняя акция — скидки и x2 кэшбек' },
      { id: 'bn2', img: 'assets/promo/newyear/banner-2.jpg', alt: 'Новогодняя коллекция — большие скидки' },
      { id: 'bn3', img: 'assets/promo/newyear/banner-3.jpg', alt: 'Хиты сезона — x2 кэшбек' },
    ],
    // Тема страницы акции (цвета/фон)
    theme: {
      gridBg: '#0b1220',         // фон сетки на странице акции
      gridBgImage: 'assets/promo/newyear/bg-snow.svg', // необязательный паттерн
      gridTint: 'rgba(255,255,255,.04)',
      badgeColor: '#ef4444',     // цвет бейджа скидки
      badgeX2Color: '#06b6d4',   // цвет бейджа x2
    },
    // Список товаров с большой скидкой (лимит)
    // По id: {oldPrice, price}
    discounts: {
      // "14091752084078242": { oldPrice: 1099000, price: 799000 },
      // ...
    },
    // Товары основного ассортимента с x2 кэшбеком
    x2CashbackIds: [
      // "14089026748679914", ...
    ],
  };
}

function promoConfig() {
  const cfg = state?.promo || {};
  return { ...defaults(), ...cfg };
}

/** === API === */
export function promoIsActive() {
  return !!promoConfig().enabled;
}

export function getPromoBanners() {
  return promoConfig().banners || [];
}

export function promoTheme() {
  return promoConfig().theme || {};
}

export function isDiscountedProduct(p) {
  const d = promoConfig().discounts || {};
  const info = d?.[String(p.id)];
  return !!info && isFinite(info.price) && info.price > 0;
}

export function discountInfo(p) {
  const d = promoConfig().discounts || {};
  const info = d?.[String(p.id)];
  if (!info) return null;
  const oldP = Number(info.oldPrice || p.price || 0);
  const newP = Number(info.price || p.price || 0);
  const pct = oldP > 0 ? Math.round((1 - newP / oldP) * 100) : 0;
  return { oldPrice: oldP, newPrice: newP, percent: Math.max(0, pct) };
}

export function isX2CashbackProduct(p) {
  const ids = promoConfig().x2CashbackIds || [];
  return ids.includes(String(p.id));
}

/** Итоговая цена (с учётом акции) */
export function effectivePrice(p) {
  const di = discountInfo(p);
  return di ? di.newPrice : Number(p.price || 0);
}

/** Собираем "бейджи" для карточки товара под акцию */
export function promoBadgesFor(p) {
  const badges = [];
  if (isDiscountedProduct(p)) {
    const di = discountInfo(p);
    badges.push({ type: 'discount', label: `-${di.percent}%` });
  }
  if (isX2CashbackProduct(p)) {
    badges.push({ type: 'x2', label: 'x2 кэшбек' });
  }
  return badges;
}

/** Универсальная проверка: входит ли товар в акцию (для страницы акции) */
export function productInPromo(p) {
  return isDiscountedProduct(p) || isX2CashbackProduct(p);
}

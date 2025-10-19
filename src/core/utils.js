// src/core/utils.js

// Безопасно получаем объект Telegram WebApp (если приложение открыто в Telegram)
export const tg = window?.Telegram?.WebApp || null;

/**
 * Лёгкая интеграция под Telegram-хром: вызываем ready/expand и
 * стараемся не падать, если что-то недоступно.
 */
export function initTelegramChrome() {
  if (!tg) return;
  try { tg.ready(); } catch (_) {}
  try { tg.expand(); } catch (_) {}
  try { tg.setHeaderColor('#0a0a0a'); } catch (_) {}
  try { tg.setBackgroundColor('#0a0a0a'); } catch (_) {}
}

/* ===== DOM helpers ===== */
export const el  = (sel) => document.querySelector(sel);
export const els = (sel) => Array.from(document.querySelectorAll(sel));
export const byId = (id) => document.getElementById(id);

/* ===== Форматы/преобразования ===== */
export const priceFmt = (n) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'UZS',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

/** Простейшее сопоставление "читаемых" цветов к hex */
export const colorToHex = (name) => {
  const m = { Black: '#121111', White: '#F2F2F2', Gray: '#A3A1A2' };
  return m[name] || name;
};

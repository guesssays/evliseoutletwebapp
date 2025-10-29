// src/core/utils.js

// ==============================
// Telegram WebApp helpers
// ==============================

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

// ==============================
// DOM helpers
// ==============================
export const el   = (sel) => document.querySelector(sel);
export const els  = (sel) => Array.from(document.querySelectorAll(sel));
export const byId = (id)  => document.getElementById(id);

// ==============================
// Форматы/преобразования
// ==============================

export const priceFmt = (n) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'UZS',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

/* =======================================================================
   Цвета
   - Нормализуем названия (регистр, ё/е, "цвет", лишние пробелы/дефисы)
   - Поддерживаем русские и английские варианты
   - Составные цвета ("черно-белый", "black/white") → градиент
   - Если передан уже валидный CSS-цвет/градиент — возвращаем как есть
   - Для неизвестного — нейтральный серый
   ======================================================================= */

/** Проверка: похоже ли значение на готовый CSS-цвет/градиент */
function looksLikeCssColor(s = '') {
  const v = String(s).trim().toLowerCase();
  return (
    v.startsWith('#') ||
    v.startsWith('rgb(') || v.startsWith('rgba(') ||
    v.startsWith('hsl(') || v.startsWith('hsla(') ||
    v.startsWith('var(') ||
    v.startsWith('linear-gradient(') ||
    v.startsWith('repeating-linear-gradient(') ||
    v.startsWith('radial-gradient(') ||
    v.startsWith('conic-gradient(')
  );
}

/** Нормализация строки цвета: трим, lower, ё→е, убираем слово "цвет" и пр. */
export function normalizeColorName(name = '') {
  let s = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s*цвет(а|ом|у|ы)?\b/g, '') // убираем "цвет", "цвета" и т.п.
    .replace(/\s*-\s*/g, '-')             // нормализуем дефисы
    .replace(/\s*\/\s*/g, '/')            // нормализуем слеши
    .replace(/[,|]/g, '/')                // запятая/вертикальная черта как разделитель
    .replace(/\s+/g, ' ')                 // схлопываем пробелы
    .trim();

  // Базовые алиасы на одиночные цвета
  const aliases = {
    // чёрный
    'черный': 'черный', 'черн': 'черный', 'black': 'черный',
    // белый
    'белый': 'белый', 'white': 'белый',
    // серый
    'серый': 'серый', 'сер': 'серый', 'gray': 'серый', 'grey': 'серый',
    // синий
    'синий': 'синий', 'blue': 'синий',
    // зелёный
    'зеленый': 'зеленый', 'зелёный': 'зеленый', 'green': 'зеленый',
    // жёлтый
    'желтый': 'желтый', 'жёлтый': 'желтый', 'yellow': 'желтый',
    // бежевый
    'бежевый': 'бежевый', 'beige': 'бежевый',
    // розовый
    'розовый': 'розовый', 'pink': 'розовый',
    // бордовый / марсала
    'бордовый': 'бордовый', 'maroon': 'бордовый', 'wine': 'бордовый',
    // фиолетовый
    'фиолетовый': 'фиолетовый', 'purple': 'фиолетовый', 'violet': 'фиолетовый',
    // коричневый
    'коричневый': 'коричневый', 'brown': 'коричневый',
    // с/без «цвет»
    'черный цвет': 'черный', 'белый цвет': 'белый', 'серый цвет': 'серый',
  };

  if (aliases[s]) return aliases[s];

  // Если это уже составное значение с дефисом/слешем — нормализуем части
  // Пример: "черный/белый", "black-white", "черно белый"
  const separators = /[-/ ]/;
  const parts = s.split(separators).filter(Boolean);
  if (parts.length >= 2) {
    const norm = parts
      .map(p => aliases[p] || p)
      .filter(Boolean)
      .slice(0, 3); // максимум 3 цвета учитываем
    if (norm.length >= 2) {
      return norm.join('-');
    }
  }

  return s;
}

/** Палитра базовых цветов */
export const COLOR_MAP = {
  'черный':     '#111111',
  'белый':      '#ffffff',
  'серый':      '#a3a1a2',
  'синий':      '#1d4ed8',
  'зеленый':    '#10b981',
  'желтый':     '#f59e0b',
  'бежевый':    '#d2b48c',
  'розовый':    '#ec4899',
  'бордовый':   '#7f1d1d',
  'фиолетовый': '#7c3aed',
  'коричневый': '#8b5a2b',

  // Частые составные варианты
  'черно-белый': 'linear-gradient(45deg, #000 0 50%, #fff 50% 100%)',
  'черный-белый': 'linear-gradient(45deg, #000 0 50%, #fff 50% 100%)',
  'черный-черный': '#111111',
};

/**
 * Возвращает CSS-цвет для свотча.
 * - Если передан валидный CSS (hex/rgb/hsl/gradient/var) — возвращаем как есть
 * - Если передано знакомое имя — возвращаем hex/градиент из COLOR_MAP
 * - Если распознаны 2–3 цвета через "-" или "/" — строим градиент 45deg
 * - Иначе — нейтральный серый
 */
export function colorToHex(name) {
  if (!name) return '#e5e7eb';

  const raw = String(name).trim();
  if (looksLikeCssColor(raw)) return raw;

  const key = normalizeColorName(raw);

  // 1) точное совпадение
  if (COLOR_MAP[key]) return COLOR_MAP[key];

  // 2) составной цвет вида "черный-белый-серый" → градиент
  const parts = key.split(/[-/]/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const colors = parts
      .map(p => COLOR_MAP[p])
      .filter(Boolean);

    if (colors.length >= 2) {
      // Строим равномерный градиент из 2–3 цветов
      const step = 100 / colors.length;
      const stops = colors.map((c, i) => `${c} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(', ');
      return `linear-gradient(45deg, ${stops})`;
    }
  }

  // 3) не распознали — отдаём нейтральный серый (чтобы свотч был виден)
  return '#e5e7eb';
}

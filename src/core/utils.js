import { PRICE_CURRENCY, RUB_TO_UZS } from './config.js';
import { state } from './state.js';

export function priceFmt(v){
  const uzs = Math.round(v * RUB_TO_UZS);
  return new Intl.NumberFormat('ru-RU',{style:'currency',currency:PRICE_CURRENCY,maximumFractionDigits:0}).format(uzs);
}
export function getCategoryName(slug){ return state.categories.find(c=>c.slug===slug)?.name || slug; }
export function renderSizeChartHTML(chart){
  const thead = `<tr>${chart.headers.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const body = chart.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="table">${thead}${body}</table></div>`;
}
export function colorToHex(name){
  const map = {white:'#ffffff', black:'#111111', gray:'#8a8a8a', red:'#ef4444', blue:'#3b82f6', green:'#22c55e', beige:'#d6c7b0', brown:'#6b4f4f'};
  if (!name) return '#cccccc';
  const key = String(name).toLowerCase();
  return map[key] || key;
}
export function userScopedKey(base){
  const uid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return uid ? `${base}_${uid}` : base;
}

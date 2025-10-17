export const priceFmt = (n)=> new Intl.NumberFormat('ru-RU',{style:'currency',currency:'UZS',maximumFractionDigits:0}).format(n);
export const colorToHex = (name)=>{ const m = { Black:'#121111', White:'#F2F2F2', Gray:'#A3A1A2' }; return m[name] || name; };
export const byId = (id)=> document.getElementById(id);
export const el = (sel)=> document.querySelector(sel);
export const els = (sel)=> Array.from(document.querySelectorAll(sel));
export const userScopedKey = (k)=> k; // простая заглушка (можно расширить при необходимости)

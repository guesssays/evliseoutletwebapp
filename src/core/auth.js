// Простая клиентская авторизация админки (Telegram whitelist + passcode с TTL)

const KEY_UNLOCK = 'nas_admin_unlock';

const ADMIN_IDS = [
5422089180
];

const ADMIN_USERNAMES = [
 dcoredanil
];

const PASSCODE = '234234123123'; // поменяй на свой секрет
const PASSCODE_TTL_DAYS = 7;

function now(){ return Date.now(); }
function days(n){ return n*24*60*60*1000; }

function getTgUser(){
  return window?.Telegram?.WebApp?.initDataUnsafe?.user || null;
}

export function isAdminByTelegram(){
  try{
    const u = getTgUser();
    if (!u) return false;
    if (ADMIN_IDS.includes(Number(u.id))) return true;
    if (u.username && ADMIN_USERNAMES.map(x=>String(x).toLowerCase()).includes(String(u.username).toLowerCase())) return true;
    return false;
  }catch{ return false; }
}

export function adminUnlocked(){
  try{
    const raw = localStorage.getItem(KEY_UNLOCK);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data?.ok || !data?.exp) return false;
    if (Number(data.exp) < now()) { localStorage.removeItem(KEY_UNLOCK); return false; }
    return true;
  }catch{ return false; }
}

export function canAccessAdmin(){
  return isAdminByTelegram() || adminUnlocked();
}

export function unlockAdminWithPasscode(code){
  if (!code) return false;
  if (String(code) !== String(PASSCODE)) return false;
  const exp = now() + days(PASSCODE_TTL_DAYS);
  localStorage.setItem(KEY_UNLOCK, JSON.stringify({ ok:true, exp }));
  return true;
}

export function logoutAdmin(){
  localStorage.removeItem(KEY_UNLOCK);
}

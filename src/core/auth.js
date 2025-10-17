// Простая клиентская авторизация админки (Telegram whitelist + passcode с TTL)

const KEY_UNLOCK = 'nas_admin_unlock';

// Telegram user.id админов (числа)
const ADMIN_IDS = [
  5422089180,
];

// Telegram username админов БЕЗ @ и В КАВЫЧКАХ
const ADMIN_USERNAMES = [
  'dcoredanil',
];

// Секретный код и срок его действия локальной разблокировки
const PASSCODE = '234234123123';
const PASSCODE_TTL_DAYS = 7;

function now(){ return Date.now(); }
function days(n){ return n*24*60*60*1000; }

function getTgUser(){
  try{
    return window?.Telegram?.WebApp?.initDataUnsafe?.user || null;
  }catch{ return null; }
}

export function isAdminByTelegram(){
  try{
    const u = getTgUser();
    if (!u) return false;
    if (ADMIN_IDS.includes(Number(u.id))) return true;
    if (u.username){
      const list = ADMIN_USERNAMES.map(x => String(x).toLowerCase());
      if (list.includes(String(u.username).toLowerCase())) return true;
    }
    return false;
  }catch{ return false; }
}

export function adminUnlocked(){
  try{
    const raw = localStorage.getItem(KEY_UNLOCK);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data?.ok || !data?.exp) return false;
    if (Number(data.exp) < now()){
      localStorage.removeItem(KEY_UNLOCK);
      return false;
    }
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

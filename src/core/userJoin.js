// src/core/userJoin.js
// Однократно сообщает на сервер о новом пользователе (на этом устройстве).
// Использует локальный флажок, чтобы не спамить функцию при каждом входе.

import { state } from './state.js';

export async function notifyUserJoin(user) {
  try {
    const uid = String(user?.id || user?.uid || state.user?.id || '').trim();
    const first_name = user?.first_name || state.user?.first_name || '';
    const last_name = user?.last_name || state.user?.last_name || '';
    const username = user?.username || state.user?.username || '';

    if (!uid || !first_name) return;

    const key = `uj_${uid}`;
    if (localStorage.getItem(key) === '1') return;

    const r = await fetch('/.netlify/functions/user-join', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ uid, first_name, last_name, username })
    });

    // даже при не-200 не хотим мешать UX
    if (r.ok) {
      const data = await r.json().catch(()=>null);
      // при успехе ставим флаг — «этот пользователь на этом устройстве уже отмечен»
      localStorage.setItem(key, '1');
      return data;
    }
  } catch (e) {
    // тихо гасим, чтобы не ломать приложение
    console.warn('notifyUserJoin error', e);
  }
}

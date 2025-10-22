// netlify/functions/auto-accrual.js
// Автоподтверждение pending-начислений кэшбека через 24 часа.
// Запускается по расписанию (каждые 15 минут).
//
// Условия подтверждения для заказа:
//   • есть userId
//   • НЕ отменён (status !== 'отменён' и !canceled)
//   • создан ≥ 24ч назад (createdAt <= now - 24h)
//   • ещё не подтверждён ранее (no accrualConfirmedAt)
// Действия:
//   • вызов /.netlify/functions/loyalty op=confirmaccrual
//   • проставить accrualConfirmedAt, добавить запись в history
//   • сохранить массив заказов обратно в Blobs
//
// ENV: URL/DEPLOY_URL (для вызова loyalty), ALLOW_MEMORY_FALLBACK не нужен

export const config = {
  // каждые 15 минут
  schedule: "*/15 * * * *",
};

const HOURS_24 = 24 * 60 * 60 * 1000;
const KEY_ALL = "orders_all";

function canonStatus(s = "") {
  const x = String(s || "").trim().toLowerCase();
  if (x === "отменен") return "отменён";
  return x || "новый";
}

async function callLoyalty(op, payload) {
  const base = (process.env.URL || process.env.DEPLOY_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("no base URL for loyalty");
  const url = `${base}/.netlify/functions/loyalty`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ op, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.reason || "loyalty error");
  return j;
}

function writeHistory(order, status, extra = {}) {
  const rec = { ts: Date.now(), status, ...extra };
  order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
}

export default async function handler() {
  // читаем все заказы напрямую из Blobs
  let store;
  try {
    const { getStore } = await import("@netlify/blobs");
    store = getStore("orders");
  } catch (e) {
    console.error("[auto-accrual] blobs unavailable:", e?.message || e);
    return new Response("ok", { status: 200 });
  }

  let list = [];
  try {
    const data = await store.get(KEY_ALL, { type: "json", consistency: "strong" });
    list = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[auto-accrual] read failed:", e?.message || e);
    return new Response("ok", { status: 200 });
  }

  if (!Array.isArray(list) || list.length === 0) {
    return new Response("ok", { status: 200 });
  }

  const now = Date.now();
  const cutoff = now - HOURS_24;
  let changed = false;
  let processed = 0;
  let confirmed = 0;

  // прогон по списку
  for (const o of list) {
    try {
      const status = canonStatus(o.status);
      const created = Number(o.createdAt || 0);
      const hasUid = !!o.userId;
      const isCanceled = status === "отменён" || o.canceled === true;
      const alreadyConfirmed = Number(o.accrualConfirmedAt || 0) > 0;

      // критерии отбора
      if (!hasUid || isCanceled || alreadyConfirmed) continue;
      if (!Number.isFinite(created) || created <= 0) continue;
      if (created > cutoff) continue;

      processed++;

      // подтверждаем начисление лояльности
      await callLoyalty("confirmaccrual", {
        uid: String(o.userId),
        orderId: String(o.id),
      });

      // помечаем, чтобы не делать повторно
      o.accrualConfirmedAt = Date.now();
      writeHistory(o, "auto_accrual_confirmed");
      changed = true;
      confirmed++;
    } catch (e) {
      // мягкий режим: продолжаем остальные
      console.warn(
        "[auto-accrual] confirm failed for order",
        o?.id,
        "-",
        e?.message || e
      );
    }
  }

  if (changed) {
    try {
      await store.setJSON(KEY_ALL, list);
    } catch (e) {
      console.error("[auto-accrual] write failed:", e?.message || e);
    }
  }

  console.log(
    `[auto-accrual] done: scanned=${list.length} eligible=${processed} confirmed=${confirmed} changed=${changed}`
  );
  return new Response("ok", { status: 200 });
}

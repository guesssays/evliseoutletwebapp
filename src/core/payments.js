// src/core/payments.js
// Единая точка для реквизитов оплаты.
// При необходимости можно переключать провайдера/карту по окружению/региону.

export function getPayRequisites() {
  return {
    cardNumber: '9860 3501 4075 6320',
    holder: 'Temur Khidayatkhanov',
    provider: 'Humo', // будет показан бейджем; можно оставить '' чтобы скрыть
  };
}

// Для обратной совместимости старых импортов (если где-то ещё используется)
export function getPayCardNumber() {
  return getPayRequisites().cardNumber;
}

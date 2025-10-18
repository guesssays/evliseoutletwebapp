// Укажете нужные реквизиты здесь
const CARD_NUMBER = '8600 1234 5678 9012';

export function getPayCardNumber(){
  // Можно расширить: разные провайдеры, валюты и т.п.
  return CARD_NUMBER;
}

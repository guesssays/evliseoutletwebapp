
# Evlise Outlet — Telegram WebApp каталог
Статический фронтенд (vanilla JS): категории, фильтры, карточка товара с выбором размера, корзина и оформление через `sendData`.

## Запуск локально
1) `python -m http.server 8080` (или любой другой http‑сервер)
2) Откройте http://localhost:8080 и проверьте работу

## Подключение к боту
В корзине используется `Telegram.WebApp.sendData(payload)`. Поднимите бота и обработайте `web_app_data`.

// src/core/navLoader.js
// Включает лоадер при переходах по hash и гасит его, когда экраны сообщают "я смонтирован".
import { Loader } from '../ui/loader.js';

(function(){
  const nav = Loader.pageTransition('Открываем…');

  // Показываем лоадер при навигации
  window.addEventListener('hashchange', () => {
    nav.start();
    // Авто-фейлсейф на случай, если экран не отправил событие монтирования
    setTimeout(() => nav.done(), 5000);
  });

  // Фич-хуки: когда конкретные экраны смонтированы — закрываем
  const done = () => nav.done();
  window.addEventListener('view:home-mounted', done);
  window.addEventListener('view:product-mounted', done);
  window.addEventListener('view:favorites-mounted', done);
  window.addEventListener('view:cart-mounted', done);
  window.addEventListener('view:orders-mounted', done);
  window.addEventListener('view:admin-mounted', done);
})();

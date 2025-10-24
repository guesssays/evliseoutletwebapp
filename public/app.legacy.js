(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/core/state.js
  var DEFAULT_LANG = localStorage.getItem("evlise_lang") || "ru";
  var DEFAULT_THEME = localStorage.getItem("evlise_theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  var state = {
    products: [],
    categories: [],
    cart: { items: [] },
    user: null,
    filters: { category: "all", query: "", size: [], colors: [], materials: [], minPrice: null, maxPrice: null, inStock: false },
    orders: [],
    addresses: { list: [], defaultId: null },
    profile: { phone: "", payerFullName: "" },
    favorites: /* @__PURE__ */ new Set()
  };
  var UID_KEY = "nas_uid";
  function readTgUserId() {
    var _a4, _b, _c, _d;
    try {
      const id = (_d = (_c = (_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initDataUnsafe) == null ? void 0 : _c.user) == null ? void 0 : _d.id;
      return id ? String(id) : null;
    } catch (e) {
      return null;
    }
  }
  function getUID() {
    try {
      let v2 = localStorage.getItem(UID_KEY);
      if (v2) return String(v2);
      const tg2 = readTgUserId();
      if (tg2) {
        localStorage.setItem(UID_KEY, tg2);
        return tg2;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  function k(base) {
    return `${base}__${getUID() || "nouid"}`;
  }
  function migrateOnce(base) {
    try {
      const old = localStorage.getItem(base);
      const scoped = localStorage.getItem(k(base));
      if (old && !scoped) {
        localStorage.setItem(k(base), old);
      }
    } catch (e) {
    }
  }
  function persistCart() {
    localStorage.setItem(k("nas_cart"), JSON.stringify(state.cart));
  }
  function loadCart() {
    try {
      localStorage.removeItem("nas_cart");
    } catch (e) {
    }
    try {
      const raw = localStorage.getItem(k("nas_cart"));
      const parsed = raw ? JSON.parse(raw) : { items: [] };
      const items = Array.isArray(parsed == null ? void 0 : parsed.items) ? parsed.items : [];
      state.cart = {
        items: items.map((it) => {
          var _a4, _b;
          return {
            productId: String(it.productId || ""),
            size: (_a4 = it.size) != null ? _a4 : null,
            color: (_b = it.color) != null ? _b : null,
            qty: Math.max(0, Number(it.qty) || 0)
          };
        }).filter((it) => it.productId && it.qty > 0)
      };
    } catch (e) {
      state.cart = { items: [] };
    }
  }
  function pruneCartAgainstProducts(products) {
    const ids = new Set(products.map((p) => String(p.id)));
    const before = state.cart.items.length;
    state.cart.items = state.cart.items.filter((it) => {
      const okId = ids.has(String(it.productId));
      const okQty = Number(it.qty) > 0;
      return okId && okQty;
    });
    if (state.cart.items.length !== before) persistCart();
  }
  function updateCartBadge() {
    const n = state.cart.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const badges = [...document.querySelectorAll("#cartBadge, [data-cart-badge], .cart-badge")];
    if (!badges.length) return;
    badges.forEach((b) => {
      if (n > 0) {
        b.textContent = String(n);
        b.style.display = "inline-block";
        b.hidden = false;
        b.setAttribute("aria-hidden", "false");
      } else {
        b.textContent = "";
        b.style.display = "none";
        b.hidden = true;
        b.setAttribute("aria-hidden", "true");
      }
    });
  }
  var ADDR_BASE = "nas_addresses";
  function loadAddresses() {
    migrateOnce(ADDR_BASE);
    try {
      const data = JSON.parse(localStorage.getItem(k(ADDR_BASE)) || "{}");
      state.addresses = { list: data.list || [], defaultId: data.defaultId || null };
    } catch (e) {
      state.addresses = { list: [], defaultId: null };
    }
  }
  function persistAddresses() {
    localStorage.setItem(k(ADDR_BASE), JSON.stringify(state.addresses));
  }
  var PROF_BASE = "nas_profile";
  function loadProfile() {
    migrateOnce(PROF_BASE);
    try {
      const data = JSON.parse(localStorage.getItem(k(PROF_BASE)) || "{}");
      state.profile = {
        phone: data.phone || "",
        payerFullName: data.payerFullName || ""
      };
    } catch (e) {
      state.profile = { phone: "", payerFullName: "" };
    }
  }
  function persistProfile() {
    var _a4, _b;
    localStorage.setItem(k(PROF_BASE), JSON.stringify({
      phone: ((_a4 = state.profile) == null ? void 0 : _a4.phone) || "",
      payerFullName: ((_b = state.profile) == null ? void 0 : _b.payerFullName) || ""
    }));
  }
  var FAV_BASE = "nas_favorites";
  function loadFavorites() {
    migrateOnce(FAV_BASE);
    try {
      const arr = JSON.parse(localStorage.getItem(k(FAV_BASE)) || "[]");
      state.favorites = new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (e) {
      state.favorites = /* @__PURE__ */ new Set();
    }
  }
  function persistFavorites() {
    try {
      localStorage.setItem(k(FAV_BASE), JSON.stringify([...state.favorites]));
    } catch (e) {
    }
  }
  function isFav(productId) {
    return state.favorites.has(String(productId));
  }
  function toggleFav(productId) {
    const id = String(productId);
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    persistFavorites();
    try {
      window.dispatchEvent(new CustomEvent("force:rerender"));
    } catch (e) {
    }
  }
  var NOTIF_BASE = "nas_notifications";
  function getNotifications() {
    try {
      return JSON.parse(localStorage.getItem(k(NOTIF_BASE)) || "[]");
    } catch (e) {
      return [];
    }
  }
  function setNotifications(list) {
    localStorage.setItem(k(NOTIF_BASE), JSON.stringify(Array.isArray(list) ? list : []));
  }
  function pushNotification(n) {
    const list = getNotifications();
    list.push(__spreadValues({ id: Date.now(), ts: Date.now(), read: false, icon: "bell", title: "", sub: "" }, n));
    setNotifications(list);
  }

  // src/core/toast.js
  var idx = 0;
  function toast(msg) {
    const w = document.getElementById("toastWrap");
    const id = "t" + ++idx;
    const n = document.createElement("div");
    n.className = "toast";
    n.id = id;
    n.textContent = msg;
    w.appendChild(n);
    setTimeout(() => {
      n.style.opacity = "0";
      setTimeout(() => n.remove(), 300);
    }, 2200);
  }

  // src/core/utils.js
  var _a;
  var tg = ((_a = window == null ? void 0 : window.Telegram) == null ? void 0 : _a.WebApp) || null;
  function initTelegramChrome() {
    if (!tg) return;
    try {
      tg.ready();
    } catch (_) {
    }
    try {
      tg.expand();
    } catch (_) {
    }
    try {
      tg.setHeaderColor("#0a0a0a");
    } catch (_) {
    }
    try {
      tg.setBackgroundColor("#0a0a0a");
    } catch (_) {
    }
  }
  var el = (sel) => document.querySelector(sel);
  var priceFmt = (n) => new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "UZS",
    maximumFractionDigits: 0
  }).format(Number(n) || 0);
  var colorToHex = (name) => {
    const m = { Black: "#121111", White: "#F2F2F2", Gray: "#A3A1A2" };
    return m[name] || name;
  };

  // src/components/Home.js
  function findCategoryBySlug(slug) {
    for (const g of state.categories) {
      if (g.slug === slug) return g;
      for (const ch of g.children || []) {
        if (ch.slug === slug) return ch;
      }
    }
    return null;
  }
  function expandSlugs(slug) {
    const c = findCategoryBySlug(slug);
    if (!c) return [slug];
    if (c.children && c.children.length) return c.children.map((x) => x.slug);
    return [c.slug];
  }
  function categoryNameBySlug(slug) {
    var _a4;
    return ((_a4 = findCategoryBySlug(slug)) == null ? void 0 : _a4.name) || "";
  }
  function renderHome(router2) {
    const v2 = document.getElementById("view");
    v2.innerHTML = `<div class="grid home-bottom-pad" id="productGrid"></div>`;
    drawCategoriesChips(router2);
    drawProducts(state.products);
    ensureBackToTop();
  }
  function drawCategoriesChips(router2) {
    const wrap = document.getElementById("catChips");
    if (!wrap) return;
    const mk = (slug, name, active) => `<button class="chip ${active ? "active" : ""}" data-slug="${slug}">${name}</button>`;
    wrap.innerHTML = "";
    wrap.insertAdjacentHTML("beforeend", mk("all", "\u0412\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B", state.filters.category === "all"));
    wrap.insertAdjacentHTML("beforeend", mk("new", "\u041D\u043E\u0432\u0438\u043D\u043A\u0438", state.filters.category === "new"));
    state.categories.forEach((c) => {
      if (c.slug === "new") return;
      wrap.insertAdjacentHTML("beforeend", mk(c.slug, c.name, state.filters.category === c.slug));
    });
    if (!wrap.dataset.bound) {
      wrap.addEventListener("click", (e) => {
        var _a4;
        const b = e.target.closest(".chip");
        if (!b) return;
        const slug = b.getAttribute("data-slug");
        if (slug === state.filters.category) return;
        (_a4 = wrap.querySelector(".chip.active")) == null ? void 0 : _a4.classList.remove("active");
        b.classList.add("active");
        state.filters.category = slug;
        let list;
        if (slug === "all") {
          list = state.products;
        } else if (slug === "new") {
          list = state.products.slice(0, 24);
        } else {
          const pool = new Set(expandSlugs(slug));
          list = state.products.filter((p) => pool.has(p.categoryId));
        }
        drawProducts(list);
      });
      wrap.dataset.bound = "1";
    }
  }
  function drawProducts(list) {
    var _a4, _b;
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const q = (state.filters.query || "").trim().toLowerCase();
    const filtered = list.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.subtitle || "").toLowerCase().includes(q)
    );
    const frag = document.createDocumentFragment();
    for (const p of filtered) {
      const t = document.getElementById("product-card");
      if (!t) continue;
      const node = t.content.firstElementChild.cloneNode(true);
      node.href = `#/product/${p.id}`;
      const im = node.querySelector("img");
      if (im) {
        im.src = ((_a4 = p.images) == null ? void 0 : _a4[0]) || "";
        im.alt = p.title;
      }
      const titleEl = node.querySelector(".title");
      if (titleEl) titleEl.textContent = p.title;
      const subEl = node.querySelector(".subtitle");
      if (subEl) {
        const labelById = categoryNameBySlug(p.categoryId) || "";
        subEl.textContent = p.categoryLabel || labelById;
      }
      const priceEl = node.querySelector(".price");
      if (priceEl) priceEl.textContent = priceFmt(p.price);
      const favBtn = node.querySelector(".fav");
      if (favBtn) {
        const active = isFav(p.id);
        favBtn.classList.toggle("active", active);
        favBtn.setAttribute("aria-pressed", String(active));
        favBtn.onclick = (ev) => {
          ev.preventDefault();
          toggleFav(p.id);
        };
      }
      frag.appendChild(node);
    }
    grid.appendChild(frag);
    ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
  }
  var BTN_ID = "backToTopBtn";
  function ensureBackToTop() {
    var _a4;
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.setAttribute("aria-label", "\u0412\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u043A \u043D\u0430\u0447\u0430\u043B\u0443");
      btn.innerHTML = `<i data-lucide="arrow-up"></i>`;
      Object.assign(btn.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        // пересчитывается ниже
        width: "44px",
        height: "44px",
        borderRadius: "999px",
        border: "1px solid var(--border, rgba(0,0,0,.12))",
        background: "var(--card, rgba(0,0,0,.04))",
        backdropFilter: "saturate(180%) blur(8px)",
        boxShadow: "0 6px 18px rgba(0,0,0,.12)",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1e3,
        cursor: "pointer",
        touchAction: "manipulation"
      });
      document.body.appendChild(btn);
      ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
      btn.addEventListener("click", () => {
        var _a5, _b;
        try {
          (_b = (_a5 = document.activeElement) == null ? void 0 : _a5.blur) == null ? void 0 : _b.call(_a5);
        } catch (e) {
        }
        window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      });
    }
    const TABBAR_SELECTORS = ["#tabbar", ".tabbar", "[data-tabbar]", '[role="tablist"]'];
    function findTabbar() {
      for (const sel of TABBAR_SELECTORS) {
        const el2 = document.querySelector(sel);
        if (el2) return el2;
      }
      return null;
    }
    function getSafeInsetBottom() {
      const tmp = document.createElement("div");
      tmp.style.cssText = "position:fixed;bottom:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom);";
      document.body.appendChild(tmp);
      const cs = getComputedStyle(tmp);
      const pb = parseFloat(cs.paddingBottom) || 0;
      document.body.removeChild(tmp);
      return pb;
    }
    function positionBackToTop() {
      const tab = findTabbar();
      const safe = getSafeInsetBottom();
      let bottom = 16 + safe;
      if (tab) {
        const r = tab.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        if (r.height > 0 && r.top < vh) {
          const overlap = Math.max(0, vh - r.top);
          bottom = Math.max(16 + safe, overlap + 12 + safe);
        }
      }
      btn.style.bottom = `${Math.round(bottom)}px`;
    }
    function toggleVisibility() {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      btn.style.display = y > 400 ? "inline-flex" : "none";
    }
    requestAnimationFrame(() => {
      positionBackToTop();
      toggleVisibility();
    });
    window.addEventListener("scroll", toggleVisibility, { passive: true });
    window.addEventListener("resize", positionBackToTop);
    window.addEventListener("hashchange", () => {
      setTimeout(positionBackToTop, 0);
    });
    const tabForObserver = findTabbar();
    if (window.ResizeObserver && tabForObserver) {
      const ro = new ResizeObserver(() => positionBackToTop());
      ro.observe(tabForObserver);
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", positionBackToTop);
    }
    window.addEventListener("tabbar:resize", positionBackToTop);
    setTimeout(positionBackToTop, 300);
  }

  // src/components/cartActions.js
  function addToCart(product, size, color, qty) {
    const key2 = (a) => String(a.productId) === String(product.id) && (a.size || null) === (size || null) && (a.color || null) === (color || null);
    const ex = state.cart.items.find(key2);
    if (ex) ex.qty += qty;
    else state.cart.items.push({
      productId: String(product.id),
      // всегда строкой → унифицировано
      size: size || null,
      color: color || null,
      qty
    });
    persistCart();
    updateCartBadge();
    toast("\u0422\u043E\u0432\u0430\u0440 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0443");
  }
  function removeLineFromCart(productId, size, color) {
    const before = state.cart.items.length;
    state.cart.items = state.cart.items.filter((a) => !(String(a.productId) === String(productId) && (a.size || null) === (size || null) && (a.color || null) === (color || null)));
    persistCart();
    updateCartBadge();
    if (state.cart.items.length < before) toast("\u0422\u043E\u0432\u0430\u0440 \u0443\u0431\u0440\u0430\u043D \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B");
  }
  function isInCart(productId, size, color) {
    return state.cart.items.some(
      (a) => String(a.productId) === String(productId) && (a.size || null) === (size || null) && (a.color || null) === (color || null)
    );
  }

  // src/components/Product.js
  var CASHBACK_RATE_BASE = 0.05;
  var CASHBACK_RATE_BOOST = 0.1;
  function k2(base) {
    var _a4;
    try {
      const uid = ((_a4 = getUID) == null ? void 0 : _a4()) || "guest";
      return `${base}__${uid}`;
    } catch (e) {
      return `${base}__guest`;
    }
  }
  function hasFirstOrderBoost() {
    try {
      const ref = JSON.parse(localStorage.getItem(k2("ref_profile")) || "{}");
      const firstDone = !!ref.firstOrderDone;
      const boost = !!ref.firstOrderBoost;
      return boost && !firstDone;
    } catch (e) {
      return false;
    }
  }
  function findCategoryBySlug2(slug) {
    for (const g of state.categories) {
      if (g.slug === slug) return g;
      for (const ch of g.children || []) {
        if (ch.slug === slug) return ch;
      }
    }
    return null;
  }
  function categoryNameBySlug2(slug) {
    var _a4;
    return ((_a4 = findCategoryBySlug2(slug)) == null ? void 0 : _a4.name) || "";
  }
  function renderProduct({ id }) {
    var _a4, _b, _c, _d, _e, _f;
    const p = state.products.find((x) => String(x.id) === String(id));
    if (!p) {
      location.hash = "#/";
      return;
    }
    const favActive = isFav(p.id);
    const images = Array.isArray(p.images) && p.images.length ? p.images : [((_a4 = p.images) == null ? void 0 : _a4[0]) || ""];
    const realPhotos = Array.isArray(p.realPhotos) ? p.realPhotos : [];
    const gallery = [
      ...images.map((src) => ({ src, isReal: false })),
      ...realPhotos.map((src) => ({ src, isReal: true }))
    ];
    const first = gallery[0] || { src: "", isReal: false };
    const related = state.products.filter((x) => x.categoryId === p.categoryId && String(x.id) !== String(p.id)).slice(0, 12);
    const v2 = document.getElementById("view");
    v2.innerHTML = `
    <style>
      /* ===== \u041A\u044D\u0448\u0431\u0435\u043A ===== */
      .p-cashback{display:flex;align-items:center;gap:10px;margin:8px 0;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,#f59e0b 0%,#ef4444 100%);color:#fff;max-width:100%;}
      .p-cashback i[data-lucide="coins"]{flex:0 0 auto;width:20px;height:20px;opacity:.95;}
      .p-cb-line{display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:visible;font-weight:800;font-size:clamp(12px,3.6vw,16px);line-height:1.2;}
      .p-cb-pts{font-variant-numeric:tabular-nums;}
      .p-cb-x2{flex:0 0 auto;font-size:.78em;line-height:1;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);font-weight:800;}
      .p-cb-help{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);transition:filter .15s ease;}
      .p-cb-help svg{width:16px;height:16px;stroke:#fff;}
      @media(hover:hover){.p-cb-help:hover{filter:brightness(1.05);} }

      /* ===== \u0421\u0440\u043E\u043A \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438 ===== */
      .p-delivery{display:flex;align-items:center;gap:10px;margin:6px 0 12px;padding:10px 12px;border-radius:12px;background:#ffffff;color:#0f172a;border:1px solid rgba(15,23,42,.12);}
      .p-delivery svg{width:18px;height:18px;stroke:currentColor;opacity:1;}
      .p-delivery__title{font-weight:800;margin-right:4px;color:#0b1220;}
      .p-delivery .muted{color:#0b1220;opacity:1;font-weight:800;}
      @media (prefers-color-scheme:dark){
        .p-delivery{background:#111827;border-color:rgba(255,255,255,.14);color:#ffffff;}
        .p-delivery__title{color:#ffffff;}
        .p-delivery .muted{color:#ffffff;opacity:1;}
      }

      /* ===== \u0411\u0435\u0439\u0434\u0436 \xAB\u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0444\u043E\u0442\u043E \u0442\u043E\u0432\u0430\u0440\u0430\xBB (main) ===== */
      .real-badge{
        position:absolute; right:10px; bottom:10px; z-index:2;
        display:inline-flex; align-items:center; gap:6px;
        padding:8px 10px; border-radius:999px;
        font-size:12px; font-weight:800; line-height:1;
        color:#0f172a;
        background:rgba(255,255,255,.72);
        backdrop-filter:saturate(1.4) blur(8px);
        -webkit-backdrop-filter:saturate(1.4) blur(8px);
        border:1px solid rgba(15,23,42,.12);
        box-shadow:0 8px 24px rgba(15,23,42,.12);
        letter-spacing:.2px;
      }
      .real-badge i{ width:14px; height:14px; opacity:.9; stroke-width:2.2; }
      @media (prefers-color-scheme:dark){
        .real-badge{
          color:#fff;
          background:rgba(11,18,32,.66);
          border-color:rgba(255,255,255,.18);
          box-shadow:0 8px 24px rgba(0,0,0,.35);
        }
      }
      /* \u041C\u0438\u043D\u0438-\u0431\u0435\u0439\u0434\u0436 \u043D\u0430 \u043C\u0438\u043D\u0438\u0430\u0442\u044E\u0440\u0430\u0445 */
      .thumb .real-dot{
        position:absolute; left:6px; top:6px; z-index:1;
        font-size:10px; font-weight:900; letter-spacing:.3px;
        padding:3px 7px; border-radius:999px;
        background:#ffffff; color:#0f172a; border:1px solid rgba(15,23,42,.12);
      }
      @media (prefers-color-scheme:dark){
        .thumb .real-dot{ background:#0b1220; color:#fff; border-color:rgba(255,255,255,.18); }
      }

      /* ===== \u0420\u0430\u0437\u0434\u0435\u043B \xAB\u041F\u043E\u0445\u043E\u0436\u0438\u0435\xBB ===== */
      .related-wrap{margin:18px -12px -8px;padding:14px 12px 10px;background:linear-gradient(0deg,rgba(15,23,42,.04),rgba(15,23,42,.04));border-top:1px solid rgba(15,23,42,.10);}
      .related-head{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:800;font-size:clamp(16px,4.2vw,18px);}
      .related-head i{width:18px;height:18px;opacity:.9;}
      @media (prefers-color-scheme:dark){
        .related-wrap{background:linear-gradient(0deg,rgba(255,255,255,.04),rgba(255,255,255,.04));border-top-color:rgba(255,255,255,.14);}
      }
      .grid.related-grid{margin-top:6px;}

      /* \u041A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440 \u043C\u0438\u043D\u0438\u0430\u0442\u044E\u0440: \u0443\u0431\u0440\u0430\u0442\u044C \u0441\u043A\u0440\u0443\u0433\u043B\u0435\u043D\u0438\u0435 \u043D\u0438\u0436\u043D\u0438\u0445 \u0443\u0433\u043B\u043E\u0432 */
      .p-hero .thumbs{
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
        overflow: hidden;
      }

      /* ====== \u0421\u0412\u041E\u0422\u0427\u0418 \u0418 \u0420\u0410\u0417\u041C\u0415\u0420\u042B ====== */
      .p-options{
        display:grid;
        grid-template-columns:1fr;
        gap:16px;
        margin:14px 0;
      }
      .opt-title{ font-weight:800; margin:6px 0 8px; }
      .sizes,.colors{ display:flex; flex-wrap:wrap; gap:10px; }

      /* \u2014 \u0426\u0432\u0435\u0442\u0430 \u2014 */
      .sw{
        position:relative;
        width:38px; height:38px;
        border-radius:999px;
        border:2px solid rgba(15,23,42,.18);
        box-shadow: inset 0 0 0 2px rgba(255,255,255,.7);
        outline:none; cursor:pointer;
        transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease, outline-color .12s ease;
      }
      @media (prefers-color-scheme:dark){
        .sw{
          border-color: rgba(255,255,255,.22);
          box-shadow: inset 0 0 0 2px rgba(0,0,0,.55);
        }
      }
      .sw:focus-visible{ outline:3px solid #0ea5e9; outline-offset:2px; }
      .sw:hover{ transform:translateY(-1px); }

      /* \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0446\u0432\u0435\u0442 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0441\u0438\u043B\u0435\u043D\u043D\u0430\u044F \u043E\u0431\u0432\u043E\u0434\u043A\u0430 + \u043B\u0451\u0433\u043A\u0430\u044F \u0430\u043D\u0438\u043C\u0430\u0446\u0438\u044F */
      @keyframes swPulse { from{ transform:scale(1.04); } to{ transform:scale(1); } }
      .sw.active{
        border-color:#0ea5e9 !important;
        box-shadow:
          inset 0 0 0 2px rgba(255,255,255,.85),
          0 0 0 3px rgba(14,165,233,.28);
        animation: swPulse .25s ease;
      }

      /* \u2014 \u0420\u0430\u0437\u043C\u0435\u0440\u044B \u2014 */
      .size{
        padding:10px 14px;
        border:1px solid var(--stroke);
        border-radius:999px;
        background:#fff;
        font-weight:700;
        cursor:pointer;
      }
      .size:focus-visible{ outline:2px solid #121111; outline-offset:3px; }
      .size.active{
        background:#121111;
        color:#fff;
        border-color:#121111;
      }

      /* ===== \u0420\u0430\u0437\u043C\u0435\u0440\u043D\u0430\u044F \u0441\u0435\u0442\u043A\u0430 (\u0446\u0435\u043D\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0439) ===== */
      .table-wrap{
        overflow:auto;
        -webkit-overflow-scrolling:touch;
        margin-top:10px;
        border:1px solid var(--stroke);
        border-radius:16px;
      }

      .size-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
      }

      .size-table th,
      .size-table td{
        padding:10px 12px;
        white-space:nowrap;
        font-size:14px;
        text-align:center;                 /* \u0446\u0435\u043D\u0442\u0440\u0438\u0440\u0443\u0435\u043C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F */
        font-variant-numeric: tabular-nums;/* \u0440\u043E\u0432\u043D\u044B\u0435 \u0446\u0438\u0444\u0440\u044B \u043F\u043E \u0441\u0435\u0442\u043A\u0435 */
      }

      .size-table thead th{
        background:#f8f8f8;
        font-weight:800;
        text-align:center;                 /* \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u0442\u043E\u0436\u0435 \u043F\u043E \u0446\u0435\u043D\u0442\u0440\u0443 */
      }

      /* \u0435\u0441\u043B\u0438 \u043F\u0435\u0440\u0432\u0430\u044F \u043A\u043E\u043B\u043E\u043D\u043A\u0430 \u2014 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F/\u0440\u0430\u0437\u043C\u0435\u0440 (\u0430 \u043D\u0435 \u0447\u0438\u0441\u043B\u043E), \u043E\u0441\u0442\u0430\u0432\u0438\u043C \u0435\u0451 \u0441\u043B\u0435\u0432\u0430 */
      .size-table th:first-child,
      .size-table td:first-child{
        text-align:left;
      }

      .size-table tbody tr:not(:last-child) td{
        border-bottom:1px solid var(--stroke);
      }
    </style>

    <!-- \u0424\u0438\u043A\u0441-\u0445\u0435\u0434\u0435\u0440 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 -->
    <div id="productFixHdr" class="product-fixhdr" aria-hidden="true">
      <button id="btnFixBack" class="fixbtn" aria-label="\u041D\u0430\u0437\u0430\u0434"><i data-lucide="arrow-left"></i></button>
      <div class="fix-title">
        <div class="fix-title__name">${escapeHtml(p.title)}</div>
        <div class="fix-title__price">${priceFmt(p.price)}</div>
      </div>
      <button id="btnFixFav" class="fixbtn ${favActive ? "active" : ""}" aria-pressed="${favActive ? "true" : "false"}" aria-label="\u0412 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435"><i data-lucide="heart"></i></button>
    </div>

    <div class="product">
      <!-- \u0413\u0410\u041B\u0415\u0420\u0415\u042F -->
      <div class="p-hero">
        <div class="gallery" role="region" aria-label="\u0413\u0430\u043B\u0435\u0440\u0435\u044F \u0442\u043E\u0432\u0430\u0440\u0430">
          <div class="gallery-main">
            ${first.isReal ? `<span class="real-badge"><i data-lucide="camera"></i><span>\u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0444\u043E\u0442\u043E \u0442\u043E\u0432\u0430\u0440\u0430</span></span>` : ``}
            <img id="mainImg" class="zoomable" src="${first.src || ""}" alt="${escapeHtml(p.title)}${first.isReal ? " (\u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0444\u043E\u0442\u043E)" : ""}">
            <button class="hero-btn hero-back" id="goBack" aria-label="\u041D\u0430\u0437\u0430\u0434"><i data-lucide="chevron-left"></i></button>
            <button class="hero-btn hero-fav ${favActive ? "active" : ""}" id="favBtn" aria-pressed="${favActive ? "true" : "false"}" aria-label="\u0412 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435"><i data-lucide="heart"></i></button>
          </div>

          ${gallery.length > 1 ? `
          <div class="thumbs" id="thumbs" role="tablist" aria-label="\u041C\u0438\u043D\u0438\u0430\u0442\u044E\u0440\u044B">
            ${gallery.map((it, i) => `
              <button class="thumb ${i === 0 ? "active" : ""}" role="tab" aria-selected="${i === 0 ? "true" : "false"}" data-index="${i}" aria-controls="mainImg" style="position:relative">
                ${it.isReal ? `<span class="real-dot">LIVE</span>` : ``}
                <img loading="lazy" src="${it.src}" alt="\u0424\u043E\u0442\u043E ${i + 1}${it.isReal ? " (\u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0435)" : ""}">
              </button>
            `).join("")}
          </div>` : ""}
        </div>
      </div>

      <div class="p-body home-bottom-pad">
        <div class="p-title">${escapeHtml(p.title)}</div>

        <!-- \u041A\u044D\u0448\u0431\u0435\u043A -->
        <div class="p-cashback" role="note" aria-label="\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u043E \u043A\u044D\u0448\u0431\u0435\u043A\u0435">
          <i data-lucide="coins" aria-hidden="true"></i>
          ${cashbackSnippetHTML(p.price)}
          <button id="cbHelpBtn" class="p-cb-help" type="button" aria-label="\u041A\u0430\u043A \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043A\u044D\u0448\u0431\u0435\u043A?">
            <i data-lucide="help-circle"></i>
          </button>
        </div>

        <!-- \u0421\u0440\u043E\u043A \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438 -->
        <div class="p-delivery" role="note" aria-label="\u0421\u0440\u043E\u043A \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438">
          <i data-lucide="clock"></i>
          <span class="p-delivery__title">\u0421\u0440\u043E\u043A \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438:</span>
          <span class="muted"><b>14\u201316 \u0434\u043D\u0435\u0439</b></span>
        </div>

        <!-- \u0425\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043A\u0438 -->
        <div class="specs"><b>\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F:</b> ${escapeHtml(((_b = findCategoryBySlug2(p.categoryId)) == null ? void 0 : _b.name) || "\u2014")}</div>
        <div class="specs"><b>\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B:</b> ${p.material ? escapeHtml(p.material) : "\u2014"}</div>

        <!-- \u041E\u043F\u0446\u0438\u0438 -->
        <div class="p-options">
          ${((_c = p.sizes) == null ? void 0 : _c.length) || 0 ? `
          <div>
            <div class="opt-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span>\u0420\u0430\u0437\u043C\u0435\u0440</span>
              ${p.sizeChart ? `<button id="btnSizeCalc" class="pill small" type="button"><i data-lucide="ruler"></i><span>\u041F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0440</span></button>` : ``}
            </div>
            <div class="sizes" id="sizes">${p.sizes.map((s) => `<button class="size" data-v="${s}">${s}</button>`).join("")}</div>
            ${!p.sizeChart ? `<div class="muted" style="font-size:12px;margin-top:6px">\u0422\u0430\u0431\u043B\u0438\u0446\u0430 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430.</div>` : ``}
          </div>` : ""}
          <div>
            <div class="opt-title">\u0426\u0432\u0435\u0442</div>
            <div class="colors" id="colors">
              ${(p.colors || []).map((c, i) => `
                <button
                  class="sw${i === 0 ? " active" : ""}"
                  title="${c}${i === 0 ? " \u2014 \u0432\u044B\u0431\u0440\u0430\u043D" : ""}"
                  aria-label="\u0426\u0432\u0435\u0442 ${c}${i === 0 ? " \u2014 \u0432\u044B\u0431\u0440\u0430\u043D" : ""}"
                  aria-pressed="${i === 0 ? "true" : "false"}"
                  data-v="${c}"
                  style="background:${colorToHex(c)}"
                ></button>
              `).join("")}
            </div>
          </div>
        </div>

        ${p.sizeChart ? `
        <div class="opt-title" style="margin-top:8px">\u0420\u0430\u0437\u043C\u0435\u0440\u043D\u0430\u044F \u0441\u0435\u0442\u043A\u0430</div>
        <div class="table-wrap">
          <table class="size-table">
            <thead><tr>${p.sizeChart.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
            <tbody>
              ${p.sizeChart.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </div>` : ""}

        <!-- \u0411\u041B\u041E\u041A \xAB\u041F\u043E\u0445\u043E\u0436\u0438\u0435\xBB -->
        ${related.length ? `
        <section class="related-wrap" aria-label="\u041F\u043E\u0445\u043E\u0436\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u044B">
          <div class="related-head">
            <i data-lucide="sparkles" aria-hidden="true"></i>
            <span>\u041F\u043E\u0445\u043E\u0436\u0438\u0435</span>
          </div>
          <div class="grid related-grid" id="relatedGrid"></div>
        </section>` : ""}

      </div>
    </div>`;
    ((_d = window.lucide) == null ? void 0 : _d.createIcons) && lucide.createIcons();
    (_e = document.getElementById("cbHelpBtn")) == null ? void 0 : _e.addEventListener("click", showCashbackHelpModal);
    (_f = document.getElementById("btnSizeCalc")) == null ? void 0 : _f.addEventListener("click", () => openSizeCalculator(p));
    const needSize = Array.isArray(p.sizes) && p.sizes.length > 0;
    let size = null, color = (p.colors || [])[0] || null;
    const sizes = document.getElementById("sizes");
    if (sizes) {
      sizes.addEventListener("click", (e) => {
        const b = e.target.closest(".size");
        if (!b) return;
        sizes.querySelectorAll(".size").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        size = b.getAttribute("data-v");
        refreshCTAByState();
      });
    }
    const colors = document.getElementById("colors");
    if (colors) {
      colors.addEventListener("click", (e) => {
        const b = e.target.closest(".sw");
        if (!b) return;
        colors.querySelectorAll(".sw").forEach((x) => {
          x.classList.remove("active");
          x.setAttribute("aria-pressed", "false");
          const t = x.getAttribute("title") || "";
          x.setAttribute("title", t.replace(" \u2014 \u0432\u044B\u0431\u0440\u0430\u043D", ""));
          const al = x.getAttribute("aria-label") || "";
          x.setAttribute("aria-label", al.replace(" \u2014 \u0432\u044B\u0431\u0440\u0430\u043D", ""));
        });
        b.classList.add("active");
        b.setAttribute("aria-pressed", "true");
        b.setAttribute("title", (b.getAttribute("title") || "") + " \u2014 \u0432\u044B\u0431\u0440\u0430\u043D");
        b.setAttribute("aria-label", (b.getAttribute("aria-label") || "") + " \u2014 \u0432\u044B\u0431\u0440\u0430\u043D");
        color = b.getAttribute("data-v");
        refreshCTAByState();
      });
    }
    document.getElementById("goBack").onclick = () => history.back();
    const favBtn = document.getElementById("favBtn");
    favBtn.onclick = () => {
      toggleFav(p.id);
      const active = isFav(p.id);
      favBtn.classList.toggle("active", active);
      favBtn.setAttribute("aria-pressed", String(active));
      setFixFavActive(active);
    };
    const thumbs = document.getElementById("thumbs");
    const mainImg = document.getElementById("mainImg");
    const galleryMain = document.querySelector(".gallery-main");
    if (thumbs && mainImg && gallery.length) {
      thumbs.addEventListener("click", (e) => {
        var _a5;
        const t = e.target.closest("button.thumb");
        if (!t) return;
        const idx2 = Number(t.getAttribute("data-index")) || 0;
        const it = gallery[idx2] || gallery[0];
        mainImg.src = it.src || "";
        mainImg.alt = `${p.title}${it.isReal ? " (\u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0444\u043E\u0442\u043E)" : ""}`;
        const old = galleryMain.querySelector(".real-badge");
        if (old) old.remove();
        if (it.isReal) {
          const b = document.createElement("span");
          b.className = "real-badge";
          b.innerHTML = '<i data-lucide="camera"></i><span>\u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0444\u043E\u0442\u043E \u0442\u043E\u0432\u0430\u0440\u0430</span>';
          galleryMain.appendChild(b);
          ((_a5 = window.lucide) == null ? void 0 : _a5.createIcons) && lucide.createIcons();
        }
        thumbs.querySelectorAll(".thumb").forEach((x) => {
          x.classList.toggle("active", x === t);
          x.setAttribute("aria-selected", x === t ? "true" : "false");
        });
        resetZoom();
      });
    }
    function showAddCTA() {
      var _a5;
      const needPick = needSize && !size;
      (_a5 = window.setTabbarCTA) == null ? void 0 : _a5.call(window, {
        id: "ctaAdd",
        html: `<i data-lucide="shopping-bag"></i><span>${needPick ? "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0430\u0437\u043C\u0435\u0440" : "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0443&nbsp;|&nbsp;" + priceFmt(p.price)}</span>`,
        onClick() {
          var _a6;
          if (needSize && !size) {
            (_a6 = document.getElementById("sizes")) == null ? void 0 : _a6.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          addToCart(p, size, color, 1);
          showInCartCTAs();
        }
      });
      const btn = document.getElementById("ctaAdd");
      if (btn) btn.disabled = needPick;
    }
    function showInCartCTAs() {
      var _a5;
      (_a5 = window.setTabbarCTAs) == null ? void 0 : _a5.call(
        window,
        {
          html: `<i data-lucide="x"></i><span>\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B</span>`,
          onClick() {
            removeLineFromCart(p.id, size || null, color || null);
            showAddCTA();
          }
        },
        {
          html: `<i data-lucide="shopping-bag"></i><span>\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0443</span>`,
          onClick() {
            location.hash = "#/cart";
          }
        }
      );
    }
    function refreshCTAByState() {
      if (needSize && !size) {
        showAddCTA();
        return;
      }
      if (isInCart(p.id, size || null, color || null)) showInCartCTAs();
      else showAddCTA();
    }
    refreshCTAByState();
    ensureZoomOverlay();
    initZoomableInPlace(mainImg);
    document.querySelectorAll("img.zoomable").forEach((img) => {
      img.addEventListener("click", () => openZoomOverlay(img.src));
    });
    function resetZoom() {
      if (!mainImg) return;
      mainImg.style.transform = "";
      mainImg.dataset.zoom = "1";
    }
    setupTwoHeaders({ isFav: favActive });
    function setupTwoHeaders({ isFav: favAtStart }) {
      const stat = document.querySelector(".app-header");
      const fix = document.getElementById("productFixHdr");
      const btnBack = document.getElementById("btnFixBack");
      const btnFav = document.getElementById("btnFixFav");
      if (!stat || !fix || !btnBack || !btnFav) return;
      if (window._productHdrAbort) {
        try {
          window._productHdrAbort.abort();
        } catch (e) {
        }
      }
      const ctrl = new AbortController();
      window._productHdrAbort = ctrl;
      stat.classList.remove("hidden");
      fix.classList.remove("show");
      fix.setAttribute("aria-hidden", "true");
      btnBack.addEventListener("click", () => history.back(), { signal: ctrl.signal });
      setFixFavActive(favAtStart);
      btnFav.addEventListener("click", () => {
        toggleFav(p.id);
        const active = isFav(p.id);
        setFixFavActive(active);
        const heroActive = favBtn.classList.contains("active");
        if (heroActive !== active) {
          favBtn.classList.toggle("active", active);
          favBtn.setAttribute("aria-pressed", String(active));
        }
      }, { signal: ctrl.signal });
      const THRESHOLD = 24;
      const onScroll = () => {
        const sc = window.scrollY || document.documentElement.scrollTop || 0;
        const showFix = sc > THRESHOLD;
        stat.classList.toggle("hidden", showFix);
        fix.classList.toggle("show", showFix);
        fix.setAttribute("aria-hidden", String(!showFix));
      };
      window.addEventListener("scroll", onScroll, { passive: true, signal: ctrl.signal });
      onScroll();
      const cleanup = () => {
        fix.classList.remove("show");
        fix.setAttribute("aria-hidden", "true");
        stat.classList.remove("hidden");
        try {
          ctrl.abort();
        } catch (e) {
        }
        if (window._productHdrAbort === ctrl) window._productHdrAbort = null;
      };
      window.addEventListener("hashchange", cleanup, { signal: ctrl.signal });
      window.addEventListener("popstate", cleanup, { signal: ctrl.signal });
      window.addEventListener("beforeunload", cleanup, { signal: ctrl.signal });
    }
    function setFixFavActive(active) {
      const btnFav = document.getElementById("btnFixFav");
      if (!btnFav) return;
      btnFav.classList.toggle("active", !!active);
      btnFav.setAttribute("aria-pressed", String(!!active));
    }
    if (related.length) {
      drawRelatedCards(related);
    }
  }
  function drawRelatedCards(list) {
    var _a4, _b, _c, _d;
    const grid = document.getElementById("relatedGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const p of list) {
      const t = document.getElementById("product-card");
      if (t && ((_a4 = t.content) == null ? void 0 : _a4.firstElementChild)) {
        const node = t.content.firstElementChild.cloneNode(true);
        node.href = `#/product/${p.id}`;
        const im = node.querySelector("img");
        if (im) {
          im.src = ((_b = p.images) == null ? void 0 : _b[0]) || "";
          im.alt = p.title;
        }
        const titleEl = node.querySelector(".title");
        if (titleEl) titleEl.textContent = p.title;
        const subEl = node.querySelector(".subtitle");
        if (subEl) {
          const labelById = categoryNameBySlug2(p.categoryId) || "";
          subEl.textContent = p.categoryLabel || labelById;
        }
        const priceEl = node.querySelector(".price");
        if (priceEl) priceEl.textContent = priceFmt(p.price);
        const favBtn = node.querySelector(".fav");
        if (favBtn) {
          const active = isFav(p.id);
          favBtn.classList.toggle("active", active);
          favBtn.setAttribute("aria-pressed", String(active));
          favBtn.onclick = (ev) => {
            ev.preventDefault();
            toggleFav(p.id);
          };
        }
        frag.appendChild(node);
      } else {
        const a = document.createElement("a");
        a.href = `#/product/${p.id}`;
        a.className = "card";
        a.innerHTML = `
        <img src="${((_c = p.images) == null ? void 0 : _c[0]) || ""}" alt="${escapeHtml(p.title)}">
        <div class="title">${escapeHtml(p.title)}</div>
        <div class="price">${priceFmt(p.price)}</div>
      `;
        frag.appendChild(a);
      }
    }
    grid.appendChild(frag);
    ((_d = window.lucide) == null ? void 0 : _d.createIcons) && lucide.createIcons();
  }
  function cashbackSnippetHTML(price) {
    const boost = hasFirstOrderBoost();
    const rate = boost ? CASHBACK_RATE_BOOST : CASHBACK_RATE_BASE;
    const pts = Math.floor((Number(price) || 0) * rate);
    return `
    <div class="p-cb-line">
      <span>\u041A\u044D\u0448\u0431\u0435\u043A</span>
      +<span class="p-cb-pts">${pts}</span>&nbsp;\u0431\u0430\u043B\u043B\u043E\u0432
      ${boost ? `<span class="p-cb-x2" title="x2 \u043D\u0430 \u043F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437">x2</span>` : ``}
    </div>`;
  }
  function showCashbackHelpModal() {
    var _a4, _b, _c;
    const modal = document.getElementById("modal");
    const mb = document.getElementById("modalBody");
    const mt = document.getElementById("modalTitle");
    const ma = document.getElementById("modalActions");
    if (!modal || !mb || !mt || !ma) return;
    mt.textContent = "\u041A\u0430\u043A \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043A\u044D\u0448\u0431\u0435\u043A";
    mb.innerHTML = `
    <style>
      .cb-how{ display:grid; gap:10px; }
      .cb-row{ display:grid; grid-template-columns:24px 1fr; gap:10px; align-items:start; }
      .cb-row i{ width:20px; height:20px; }
      .muted{ color:var(--muted,#6b7280); }
    </style>
    <div class="cb-how">
      <div class="cb-row">
        <i data-lucide="percent"></i>
        <div><b>\u041D\u0430\u0447\u0438\u0441\u043B\u044F\u0435\u043C \u0437\u0430 \u043F\u043E\u043A\u0443\u043F\u043A\u0443.</b> \u0421\u0443\u043C\u043C\u0430 \u043A\u044D\u0448\u0431\u0435\u043A\u0430 \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u0446\u0435\u043D\u044B \u0442\u043E\u0432\u0430\u0440\u0430.</div>
      </div>
      <div class="cb-row">
        <i data-lucide="clock"></i>
        <div><b>\u0417\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 24 \u0447\u0430\u0441\u0430.</b> \u041F\u043E\u0441\u043B\u0435 \u044D\u0442\u043E\u0433\u043E \u0431\u0430\u043B\u043B\u044B \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u043A \u043E\u043F\u043B\u0430\u0442\u0435.</div>
      </div>
      <div class="cb-row">
        <i data-lucide="badge-check"></i>
        <div><b>\u041A\u0430\u043A \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C.</b> \u041D\u0430 \u044D\u0442\u0430\u043F\u0435 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F \u043C\u043E\u0436\u043D\u043E \u043E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0447\u0430\u0441\u0442\u044C \u0437\u0430\u043A\u0430\u0437\u0430 \u0431\u0430\u043B\u043B\u0430\u043C\u0438. \u0412\u0430\u0448 \u0431\u0430\u043B\u0430\u043D\u0441 \u043C\u043E\u0436\u043D\u043E \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0435.</div>
      </div>
      <div class="cb-row">
        <i data-lucide="zap"></i>
        <div class="muted">\u0415\u0441\u043B\u0438 \u0432\u044B \u043F\u0440\u0438\u0448\u043B\u0438 \u043F\u043E \u0440\u0435\u0444-\u0441\u0441\u044B\u043B\u043A\u0435, \u043D\u0430 <b>\u043F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u2014 x2 \u043A\u044D\u0448\u0431\u0435\u043A</b>.</div>
      </div>
    </div>
  `;
    ma.innerHTML = `<button id="cbHelpOk" class="pill primary">\u041F\u043E\u043D\u044F\u0442\u043D\u043E</button>`;
    modal.classList.add("show");
    ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
    (_b = document.getElementById("modalClose")) == null ? void 0 : _b.addEventListener("click", close, { once: true });
    (_c = document.getElementById("cbHelpOk")) == null ? void 0 : _c.addEventListener("click", close, { once: true });
    function close() {
      modal.classList.remove("show");
    }
  }
  function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
  function initZoomableInPlace(img) {
    if (!img) return;
    let scale = 1, startDist = 0, startScale = 1, dragging = false, lastX = 0, lastY = 0, tx = 0, ty = 0, lastTap = 0;
    img.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = img.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = -Math.sign(e.deltaY) * 0.2;
      zoomAt(mx, my, delta);
    }, { passive: false });
    img.addEventListener("click", (e) => {
      const now2 = Date.now();
      if (now2 - lastTap < 300) {
        const rect = img.getBoundingClientRect();
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, scale > 1 ? -999 : 1.5);
        e.preventDefault();
      }
      lastTap = now2;
    });
    img.addEventListener("mousedown", (e) => {
      if (scale <= 1) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      tx += dx;
      ty += dy;
      apply();
    });
    window.addEventListener("mouseup", () => dragging = false);
    img.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches[0], e.touches[1]);
        startScale = scale;
      } else if (e.touches.length === 1 && scale > 1) {
        dragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    }, { passive: true });
    img.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const deltaScale = d / startDist - 1;
        scale = clamp(startScale * (1 + deltaScale), 1, 5);
        apply();
      } else if (e.touches.length === 1 && dragging) {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        tx += dx;
        ty += dy;
        apply();
      }
    }, { passive: false });
    img.addEventListener("touchend", () => {
      dragging = false;
    });
    function zoomAt(x, y, delta) {
      const old = scale;
      scale = clamp(scale + delta, 1, 5);
      tx -= (x - (x - tx)) * (scale / old - 1);
      ty -= (y - (y - ty)) * (scale / old - 1);
      apply();
    }
    function apply() {
      if (scale <= 1) {
        scale = 1;
        tx = 0;
        ty = 0;
      }
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    function clamp(v2, min, max) {
      return Math.max(min, Math.min(max, v2));
    }
    function dist(a, b) {
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    }
  }
  function ensureZoomOverlay() {
    var _a4;
    if (document.getElementById("zoomOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "zoomOverlay";
    wrap.className = "zoom-overlay";
    wrap.innerHTML = `
    <div class="zoom-stage">
      <img id="zoomImg" alt="">
      <button class="zoom-close" id="zoomClose" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C"><i data-lucide="x"></i></button>
    </div>
  `;
    document.body.appendChild(wrap);
    ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
  }
  function openZoomOverlay(src) {
    const ov = document.getElementById("zoomOverlay");
    const img = document.getElementById("zoomImg");
    const close = document.getElementById("zoomClose");
    if (!ov || !img) return;
    img.src = src;
    ov.classList.add("show");
    let scale = 1, startScale = 1, startDist = 0, tx = 0, ty = 0, dragging = false, lastX = 0, lastY = 0, lastTap = 0;
    function apply() {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    function clamp(v2, min, max) {
      return Math.max(min, Math.min(max, v2));
    }
    function dist(a, b) {
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    }
    img.onwheel = (e) => {
      e.preventDefault();
      const delta = -Math.sign(e.deltaY) * 0.2;
      scale = clamp(scale + delta, 1, 6);
      apply();
    };
    img.onmousedown = (e) => {
      if (scale <= 1) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
    };
    window.onmousemove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      tx += dx;
      ty += dy;
      apply();
    };
    window.onmouseup = () => dragging = false;
    img.ontouchstart = (e) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches[0], e.touches[1]);
        startScale = scale;
      } else if (e.touches.length === 1 && scale > 1) {
        dragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };
    img.ontouchmove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const ds = d / startDist - 1;
        scale = clamp(startScale * (1 + ds), 1, 6);
        apply();
      } else if (e.touches.length === 1 && dragging) {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        tx += dx;
        ty += dy;
        apply();
      }
    };
    img.ontouchend = () => {
      dragging = false;
    };
    img.onclick = (e) => {
      const now2 = Date.now();
      if (now2 - lastTap < 300) {
        scale = scale > 1 ? 1 : 2;
        tx = 0;
        ty = 0;
        apply();
      }
      lastTap = now2;
    };
    function closeOv() {
      ov.classList.remove("show");
      img.onwheel = img.onmousedown = window.onmousemove = window.onmouseup = null;
      img.ontouchstart = img.ontouchmove = img.ontouchend = null;
      img.onclick = null;
      close.onclick = null;
    }
    close.onclick = closeOv;
    ov.onclick = (e) => {
      if (e.target === ov) closeOv();
    };
  }
  function inferSizeChartType(headers = []) {
    const hs = headers.map((h) => String(h).toLowerCase());
    const shoeHints = ["\u0441\u0442\u043E\u043F\u0430", "\u0434\u043B\u0438\u043D\u0430 \u0441\u0442\u043E\u043F\u044B", "foot", "cm", "mm", "eu", "us", "uk", "\u0434\u043B\u0438\u043D\u0430, \u0441\u043C", "eu size", "eur"];
    const clothHints = ["\u0433\u0440\u0443\u0434", "\u043F\u043B\u0435\u0447", "\u0442\u0430\u043B", "\u0431\u0435\u0434\u0440", "waist", "hip", "hips", "bust", "chest", "shoulder", "sleeve", "\u0434\u043B\u0438\u043D\u0430 \u043F\u043E \u0441\u043F\u0438\u043D\u0435", "\u0440\u043E\u0441\u0442", "height"];
    const hasShoe = hs.some((h) => shoeHints.some((k6) => h.includes(k6)));
    const hasCloth = hs.some((h) => clothHints.some((k6) => h.includes(k6)));
    if (hasShoe && !hasCloth) return "shoes";
    if (hasCloth) return "clothes";
    return "clothes";
  }
  function openSizeCalculator(p) {
    var _a4, _b, _c, _d, _e;
    const modal = document.getElementById("modal");
    const mb = document.getElementById("modalBody");
    const mt = document.getElementById("modalTitle");
    const ma = document.getElementById("modalActions");
    if (!modal || !mb || !mt || !ma) return;
    const chart = p.sizeChart;
    if (!chart) {
      (_a4 = window.toast) == null ? void 0 : _a4.call(window, "\u0414\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430 \u0442\u0430\u0431\u043B\u0438\u0446\u0430 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
      return;
    }
    const type = inferSizeChartType(chart.headers || []);
    mt.textContent = "\u041F\u043E\u0434\u0431\u043E\u0440 \u0440\u0430\u0437\u043C\u0435\u0440\u0430";
    mb.innerHTML = `
    <style>
      .sz-form{ display:grid; gap:10px; }
      .sz-row{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .sz-row-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
      @media (max-width:520px){ .sz-row, .sz-row-3{ grid-template-columns:1fr; } }
      .sz-note{ color:var(--muted,#6b7280); font-size:12px; }
      .sz-res{ display:none; border:1px solid var(--stroke); border-radius:12px; padding:12px; }
      .sz-res.show{ display:block; }
      .sz-chip{ display:inline-flex; gap:6px; align-items:center; padding:6px 10px; border-radius:999px; border:1px solid var(--stroke); }
    </style>

    <div class="sz-form">
      ${type === "shoes" ? `
        <div class="field">
          <span>\u0414\u043B\u0438\u043D\u0430 \u0441\u0442\u043E\u043F\u044B (\u0441\u043C)</span>
          <input id="inFoot" class="input" type="number" step="0.1" min="10" max="35" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 25.2">
          <div class="sz-note">\u041F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043D\u043E\u0433\u0443 \u043D\u0430 \u043B\u0438\u0441\u0442 \u0431\u0443\u043C\u0430\u0433\u0438, \u043E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u0441\u0430\u043C\u0443\u044E \u0434\u043B\u0438\u043D\u043D\u0443\u044E \u0442\u043E\u0447\u043A\u0443, \u0438\u0437\u043C\u0435\u0440\u044C\u0442\u0435 \u043B\u0438\u043D\u0435\u0439\u043A\u043E\u0439.</div>
        </div>
      ` : `
        <div class="sz-row">
          <div class="field">
            <span>\u0413\u0440\u0443\u0434\u044C (\u0441\u043C)</span>
            <input id="inBust" class="input" type="number" step="0.5" min="60" max="150" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 92">
          </div>
          <div class="field">
            <span>\u0422\u0430\u043B\u0438\u044F (\u0441\u043C)</span>
            <input id="inWaist" class="input" type="number" step="0.5" min="50" max="140" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 74">
          </div>
        </div>
        <div class="sz-row">
          <div class="field">
            <span>\u0411\u0451\u0434\u0440\u0430 (\u0441\u043C)</span>
            <input id="inHips" class="input" type="number" step="0.5" min="70" max="160" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 98">
          </div>
          <div class="field">
            <span>\u0420\u043E\u0441\u0442 (\u0441\u043C)</span>
            <input id="inHeight" class="input" type="number" step="1" min="140" max="210" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 175">
          </div>
        </div>
        <div class="field">
          <span>\u0412\u0435\u0441 (\u043A\u0433)</span>
          <input id="inWeight" class="input" type="number" step="0.5" min="35" max="160" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 72.5">
          <div class="sz-note">\u0420\u043E\u0441\u0442 \u0438 \u0432\u0435\u0441 \u043F\u043E\u043C\u043E\u0433\u0430\u044E\u0442 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0440 \u043F\u0440\u0438 \u0433\u0440\u0430\u043D\u0438\u0447\u043D\u044B\u0445 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F\u0445.</div>
        </div>
      `}
      <div id="szResult" class="sz-res" role="status" aria-live="polite"></div>
    </div>
  `;
    ma.innerHTML = `
    <button id="szCancel" class="pill">\u041E\u0442\u043C\u0435\u043D\u0430</button>
    <button id="szCalc" class="pill primary">\u0420\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0442\u044C</button>
  `;
    modal.classList.add("show");
    ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
    (_c = document.getElementById("szCancel")) == null ? void 0 : _c.addEventListener("click", () => modal.classList.remove("show"), { once: true });
    (_d = document.getElementById("modalClose")) == null ? void 0 : _d.addEventListener("click", () => modal.classList.remove("show"), { once: true });
    (_e = document.getElementById("szCalc")) == null ? void 0 : _e.addEventListener("click", () => {
      var _a5, _b2, _c2, _d2, _e2, _f, _g;
      const resBox = document.getElementById("szResult");
      const rec = type === "shoes" ? computeShoeSize(chart, Number((_a5 = document.getElementById("inFoot")) == null ? void 0 : _a5.value)) : computeClothSize(
        chart,
        Number((_b2 = document.getElementById("inBust")) == null ? void 0 : _b2.value),
        Number((_c2 = document.getElementById("inWaist")) == null ? void 0 : _c2.value),
        Number((_d2 = document.getElementById("inHips")) == null ? void 0 : _d2.value),
        Number((_e2 = document.getElementById("inHeight")) == null ? void 0 : _e2.value),
        Number((_f = document.getElementById("inWeight")) == null ? void 0 : _f.value),
        Array.isArray(p.sizes) ? p.sizes.slice() : []
      );
      if (!resBox) return;
      if (!rec) {
        resBox.classList.add("show");
        resBox.innerHTML = `<div>\u041D\u0443\u0436\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043C\u0435\u0440\u043A\u0438 \u0438\u043B\u0438 \u043E\u0440\u0438\u0435\u043D\u0442\u0438\u0440\u0443\u0439\u0442\u0435\u0441\u044C \u043D\u0430 \u0442\u0430\u0431\u043B\u0438\u0446\u0443 \u0432\u044B\u0448\u0435.</div>`;
        return;
      }
      resBox.classList.add("show");
      resBox.innerHTML = `
      <div style="display:grid; gap:8px">
        <div><b>\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u043C\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440:</b> <span class="sz-chip">${rec.size}</span></div>
        ${rec.reason ? `<div class="sz-note">${escapeHtml(rec.reason)}</div>` : ``}
        <div><button id="szApply" class="pill primary">\u0412\u044B\u0431\u0440\u0430\u0442\u044C ${rec.size}</button></div>
      </div>
    `;
      (_g = document.getElementById("szApply")) == null ? void 0 : _g.addEventListener("click", () => {
        const sizesEl = document.getElementById("sizes");
        const btn = sizesEl == null ? void 0 : sizesEl.querySelector(`.size[data-v="${CSS.escape(rec.size)}"]`);
        if (btn) {
          btn.click();
          btn.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        modal.classList.remove("show");
      }, { once: true });
    });
  }
  function computeShoeSize(chart, footCm) {
    var _a4, _b;
    if (!footCm || !isFinite(footCm)) return null;
    const h = chart.headers || [];
    const idxLen = getColumnIndex(h, ["\u0434\u043B\u0438\u043D\u0430 \u0441\u0442\u043E\u043F\u044B", "foot length", "\u0434\u043B\u0438\u043D\u0430, \u0441\u043C", "\u0441\u043C", "cm", "mm"]);
    if (idxLen === -1) return null;
    const idxSize = guessSizeColIndex(h);
    let best = null, bestDiff = Infinity;
    for (const row of chart.rows || []) {
      const lenRaw = row[idxLen];
      const len = takeNumber(lenRaw);
      if (!len) continue;
      const isMM = String(h[idxLen]).toLowerCase().includes("mm") || String(lenRaw).toLowerCase().includes("\u043C\u043C");
      const cm = isMM ? len / 10 : len;
      const diff = Math.abs(cm - footCm);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = { size: String((_b = (_a4 = row[idxSize]) != null ? _a4 : row[0]) != null ? _b : "").trim(), reason: `\u0411\u043B\u0438\u0436\u0430\u0439\u0448\u0430\u044F \u0434\u043B\u0438\u043D\u0430 \u0441\u0442\u043E\u043F\u044B: ${cm.toFixed(1)} \u0441\u043C` };
      }
    }
    return best;
  }
  function computeClothSize(chart, bust, waist, hips, height, weight, sizesOrder = []) {
    var _a4, _b;
    const h = chart.headers || [];
    const idxSize = guessSizeColIndex(h);
    if (idxSize === -1) return null;
    const idxBust = getColumnIndex(h, ["\u0433\u0440\u0443\u0434\u044C", "\u043E\u0431\u0445\u0432\u0430\u0442 \u0433\u0440\u0443\u0434\u0438", "bust", "chest"]);
    const idxWaist = getColumnIndex(h, ["\u0442\u0430\u043B\u0438\u044F", "\u043E\u0431\u0445\u0432\u0430\u0442 \u0442\u0430\u043B\u0438\u0438", "waist"]);
    const idxHips = getColumnIndex(h, ["\u0431\u0435\u0434\u0440\u0430", "\u043E\u0431\u0445\u0432\u0430\u0442 \u0431\u0435\u0434\u0435\u0440", "hips", "hip"]);
    const idxHeight = getColumnIndex(h, ["\u0440\u043E\u0441\u0442", "height"]);
    if (idxBust === -1 && idxWaist === -1 && idxHips === -1 && (idxHeight === -1 || !height)) {
      return null;
    }
    let best = null, bestScore = Infinity, bestRow = null;
    let second = null, secondScore = Infinity, secondRow = null;
    let bestReasons = "";
    for (const row of chart.rows || []) {
      let score = 0, weightSum = 0;
      const rs = [];
      if (idxBust > -1 && bust) {
        const v2 = closestOfCell(row[idxBust], bust);
        score += Math.abs(v2 - bust);
        weightSum += 1;
        rs.push(`\u0433\u0440\u0443\u0434\u044C: ${isFinite(v2) ? v2.toFixed(0) : "\u2014"} \u0441\u043C`);
      }
      if (idxWaist > -1 && waist) {
        const v2 = closestOfCell(row[idxWaist], waist);
        score += Math.abs(v2 - waist);
        weightSum += 1;
        rs.push(`\u0442\u0430\u043B\u0438\u044F: ${isFinite(v2) ? v2.toFixed(0) : "\u2014"} \u0441\u043C`);
      }
      if (idxHips > -1 && hips) {
        const v2 = closestOfCell(row[idxHips], hips);
        score += Math.abs(v2 - hips);
        weightSum += 1;
        rs.push(`\u0431\u0451\u0434\u0440\u0430: ${isFinite(v2) ? v2.toFixed(0) : "\u2014"} \u0441\u043C`);
      }
      if (idxHeight > -1 && height) {
        const v2 = closestOfCell(row[idxHeight], height);
        score += 0.5 * Math.abs(v2 - height);
        weightSum += 0.5;
        rs.push(`\u0440\u043E\u0441\u0442: ${isFinite(v2) ? v2.toFixed(0) : "\u2014"} \u0441\u043C`);
      }
      if (!weightSum) continue;
      const norm = score / weightSum;
      const sizeLabel = String((_b = (_a4 = row[idxSize]) != null ? _a4 : row[0]) != null ? _b : "").trim();
      if (norm < bestScore) {
        second = best;
        secondScore = bestScore;
        secondRow = bestRow;
        best = sizeLabel;
        bestScore = norm;
        bestRow = row;
        bestReasons = rs.join(", ");
      } else if (norm < secondScore) {
        second = sizeLabel;
        secondScore = norm;
        secondRow = row;
      }
    }
    if (!best) return null;
    let finalSize = best;
    let adj = "";
    const close = isFinite(secondScore) && Math.abs(secondScore - bestScore) <= 1.8;
    const tallOrHeavy = height && height >= 188 || weight && weight >= 95;
    const shortOrLight = height && height <= 160 || weight && weight <= 50;
    if (close && sizesOrder && sizesOrder.length) {
      const iBest = sizesOrder.indexOf(best);
      const iSecond = sizesOrder.indexOf(second);
      if (tallOrHeavy && iBest > -1 && iBest < sizesOrder.length - 1) {
        finalSize = sizesOrder[iBest + 1];
        adj = " (\u0443\u0447\u043B\u0438 \u0440\u043E\u0441\u0442/\u0432\u0435\u0441 \u2014 \u0432\u0437\u044F\u043B\u0438 \u043D\u0430 \u043F\u043E\u043B\u0440\u0430\u0437\u043C\u0435\u0440\u0430 \u0431\u043E\u043B\u044C\u0448\u0435)";
      } else if (shortOrLight && iBest > -1 && iBest > 0) {
        finalSize = sizesOrder[iBest - 1];
        adj = " (\u0443\u0447\u043B\u0438 \u0440\u043E\u0441\u0442/\u0432\u0435\u0441 \u2014 \u0432\u0437\u044F\u043B\u0438 \u043D\u0430 \u043F\u043E\u043B\u0440\u0430\u0437\u043C\u0435\u0440\u0430 \u043C\u0435\u043D\u044C\u0448\u0435)";
      }
    }
    if (!adj && idxHeight > -1 && height) {
      if (height >= 190) adj = " (\u0440\u043E\u0441\u0442 \u0432\u044B\u0441\u043E\u043A\u0438\u0439, \u043E\u0440\u0438\u0435\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u043B\u0438\u0441\u044C \u043D\u0430 \u0434\u043B\u0438\u043D\u0443/\u0440\u043E\u0441\u0442 \u0438\u0437 \u0442\u0430\u0431\u043B\u0438\u0446\u044B)";
      else if (height <= 160) adj = " (\u0440\u043E\u0441\u0442 \u043D\u0435\u0432\u044B\u0441\u043E\u043A\u0438\u0439, \u043E\u0440\u0438\u0435\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u043B\u0438\u0441\u044C \u043D\u0430 \u0434\u043B\u0438\u043D\u0443/\u0440\u043E\u0441\u0442 \u0438\u0437 \u0442\u0430\u0431\u043B\u0438\u0446\u044B)";
    }
    const reason = `\u0411\u043B\u0438\u0436\u0435 \u0432\u0441\u0435\u0433\u043E \u043F\u043E \u043C\u0435\u0440\u043A\u0430\u043C: ${bestReasons}${adj}`;
    return { size: finalSize, reason };
  }
  function getColumnIndex(headers = [], keys = []) {
    const hs = headers.map((h) => String(h || "").toLowerCase());
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (keys.some((k6) => h.includes(k6))) return i;
    }
    return -1;
  }
  function guessSizeColIndex(headers = []) {
    const hs = headers.map((h) => String(h || "").toLowerCase());
    const keys = ["\u0440\u0430\u0437\u043C\u0435\u0440", "size", "eu", "us", "ru", "cn", "intl"];
    for (let i = 0; i < hs.length; i++) {
      if (keys.some((k6) => hs[i].includes(k6))) return i;
    }
    return 0;
  }
  function takeNumber(cell) {
    if (cell == null) return null;
    const s = String(cell).replace(",", ".").trim();
    const m = s.match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  }
  function closestOfCell(cell, target) {
    var _a4;
    if (!cell) return NaN;
    const s = String(cell).replace(",", ".");
    const nums = ((_a4 = s.match(/\d+(?:\.\d+)?/g)) == null ? void 0 : _a4.map(Number)) || [];
    if (!nums.length) return NaN;
    if (nums.length === 1) return nums[0];
    const lo = Math.min(nums[0], nums[1]);
    const hi = Math.max(nums[0], nums[1]);
    if (target < lo) return lo;
    if (target > hi) return hi;
    return target;
  }

  // src/core/botNotify.js
  var ENDPOINT = "/.netlify/functions/notify";
  function getTelegramChatId() {
    var _a4, _b, _c;
    const tg2 = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp;
    const id = (_c = (_b = tg2 == null ? void 0 : tg2.initDataUnsafe) == null ? void 0 : _b.user) == null ? void 0 : _c.id;
    return id ? String(id) : null;
  }
  function isValidChatId(v2) {
    return typeof v2 === "string" && /^\d+$/.test(v2);
  }
  var ORDER_ONLY_TYPES = /* @__PURE__ */ new Set([
    "orderPlaced",
    "orderAccepted",
    "statusChanged",
    "orderCanceled"
  ]);
  function resolveTargetChatIdFor(type, preferredChatId) {
    const pref = String(preferredChatId || "");
    if (isValidChatId(pref)) return pref;
    if (ORDER_ONLY_TYPES.has(type)) return null;
    const fromWebApp = getTelegramChatId();
    return isValidChatId(fromWebApp || "") ? fromWebApp : null;
  }
  async function sendToBot(type, { orderId, shortId, chatId, title, text } = {}, { requireUserChat = false } = {}) {
    const chat_id = resolveTargetChatIdFor(type, chatId);
    if (requireUserChat && !chat_id) return;
    if (ORDER_ONLY_TYPES.has(type) && !chat_id) return;
    const payload = { type };
    if (orderId) payload.orderId = String(orderId);
    if (shortId) payload.shortId = String(shortId);
    if (chat_id) payload.chat_id = chat_id;
    if (title) payload.title = String(title).slice(0, 140);
    if (text) payload.text = String(text).slice(0, 400);
    try {
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
    }
  }
  var notifyStatusChanged = (chatId, { orderId, shortId, title } = {}) => sendToBot("statusChanged", { orderId, shortId, chatId, title });

  // src/core/orders.js
  var KEY = "nas_orders";
  var API_BASE = "/.netlify/functions/orders";
  var FETCH_TIMEOUT_MS = 1e4;
  var ADMIN_OPS = /* @__PURE__ */ new Set(["accept", "cancel", "status"]);
  function getAdminToken() {
    try {
      return typeof window !== "undefined" && (window.__ADMIN_API_TOKEN__ || window.ADMIN_API_TOKEN) || localStorage.getItem("admin_api_token") || "";
    } catch (e) {
      return "";
    }
  }
  function getTgInitData() {
    try {
      const raw = typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData || "";
      return String((window == null ? void 0 : window.__TG_INIT_DATA__) || raw || "").trim();
    } catch (e) {
      return "";
    }
  }
  function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(
        (v2) => {
          clearTimeout(t);
          resolve(v2);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }
  function canonStatus(s = "") {
    const x = String(s || "").trim().toLowerCase();
    if (x === "\u043E\u0442\u043C\u0435\u043D\u0435\u043D") return "\u043E\u0442\u043C\u0435\u043D\u0451\u043D";
    return x || "\u043D\u043E\u0432\u044B\u0439";
  }
  function normalizeOrder(o = {}) {
    o.status = canonStatus(o.status || "\u043D\u043E\u0432\u044B\u0439");
    if (o.canceled) {
      o.status = "\u043E\u0442\u043C\u0435\u043D\u0451\u043D";
      o.accepted = false;
    }
    return o;
  }
  var __lastStoreKind = "unknown";
  function baseHeaders() {
    const headers = { "Content-Type": "application/json" };
    const initData = getTgInitData();
    if (initData) headers["X-Tg-Init-Data"] = initData;
    return headers;
  }
  async function apiGetList() {
    var _a4;
    try {
      const res = await withTimeout(fetch(`${API_BASE}?op=list&ts=${Date.now()}`, {
        method: "GET",
        headers: __spreadProps(__spreadValues({}, baseHeaders()), { "Cache-Control": "no-store" })
      }));
      const data = await res.json();
      if (res.ok && (data == null ? void 0 : data.ok) && Array.isArray(data.orders)) {
        __lastStoreKind = ((_a4 = data == null ? void 0 : data.meta) == null ? void 0 : _a4.store) || "unknown";
        return data.orders.map(normalizeOrder);
      }
      throw new Error("bad response");
    } catch (e) {
      return getOrdersLocal().map(normalizeOrder);
    }
  }
  async function apiGetOne(id) {
    try {
      const res = await withTimeout(fetch(`${API_BASE}?op=get&id=${encodeURIComponent(id)}&ts=${Date.now()}`, {
        method: "GET",
        headers: __spreadProps(__spreadValues({}, baseHeaders()), { "Cache-Control": "no-store" })
      }));
      const data = await res.json();
      if (res.ok && (data == null ? void 0 : data.ok)) return data.order ? normalizeOrder(data.order) : null;
      return null;
    } catch (e) {
      return null;
    }
  }
  async function apiPost(op, body) {
    const headers = baseHeaders();
    if (ADMIN_OPS.has(op)) {
      const token = getAdminToken();
      if (token) headers["X-Internal-Auth"] = token;
    }
    const res = await withTimeout(fetch(API_BASE, {
      method: "POST",
      headers,
      body: JSON.stringify(__spreadValues({ op }, body))
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !(data == null ? void 0 : data.ok)) throw new Error((data == null ? void 0 : data.error) || "api error");
    return data;
  }
  function getOrdersLocal() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function setOrdersLocal(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }
  function saveOrders(list) {
    setOrdersLocal((list || []).map(normalizeOrder));
    try {
      window.dispatchEvent(new CustomEvent("orders:updated"));
    } catch (e) {
    }
  }
  function replaceOrdersCacheSilently(list) {
    setOrdersLocal((list || []).map(normalizeOrder));
  }
  function writeHistory(order, status, extra = {}) {
    const rec = __spreadValues({ ts: Date.now(), status: canonStatus(status) }, extra);
    order.history = Array.isArray(order.history) ? [...order.history, rec] : [rec];
  }
  function mergeById(oldList = [], fresh = []) {
    const map = new Map(oldList.map((o) => [String(o.id), o]));
    for (const o of fresh) map.set(String(o.id), o);
    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  var ORDER_STATUSES = [
    "\u043D\u043E\u0432\u044B\u0439",
    "\u043F\u0440\u0438\u043D\u044F\u0442",
    "\u0441\u043E\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u0432 \u043A\u0438\u0442\u0430\u0435",
    "\u0432\u044B\u043B\u0435\u0442\u0435\u043B \u0432 \u0443\u0437\u0431",
    "\u043D\u0430 \u0442\u0430\u043C\u043E\u0436\u043D\u0435",
    "\u043D\u0430 \u043F\u043E\u0447\u0442\u0435",
    "\u0437\u0430\u0431\u0440\u0430\u043D \u0441 \u043F\u043E\u0447\u0442\u044B",
    "\u0432\u044B\u0434\u0430\u043D",
    "\u043E\u0442\u043C\u0435\u043D\u0451\u043D"
  ];
  var STATUS_LABELS = {
    "\u043D\u043E\u0432\u044B\u0439": "\u0412 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435",
    "\u043F\u0440\u0438\u043D\u044F\u0442": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D",
    "\u0441\u043E\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u0432 \u043A\u0438\u0442\u0430\u0435": "\u0421\u043E\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u043C",
    "\u0432\u044B\u043B\u0435\u0442\u0435\u043B \u0432 \u0443\u0437\u0431": "\u0412\u044B\u043B\u0435\u0442\u0435\u043B \u0438\u0437 \u041A\u0438\u0442\u0430\u044F",
    "\u043D\u0430 \u0442\u0430\u043C\u043E\u0436\u043D\u0435": "\u041D\u0430 \u0442\u0430\u043C\u043E\u0436\u043D\u0435 \u0432 \u0423\u0437\u0431\u0435\u043A\u0438\u0441\u0442\u0430\u043D\u0435",
    "\u043D\u0430 \u043F\u043E\u0447\u0442\u0435": "\u0412 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u043F\u043E\u0447\u0442\u044B",
    "\u0437\u0430\u0431\u0440\u0430\u043D \u0441 \u043F\u043E\u0447\u0442\u044B": "\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0441 \u043F\u043E\u0447\u0442\u044B",
    "\u0432\u044B\u0434\u0430\u043D": "\u0412\u044B\u0434\u0430\u043D",
    "\u043E\u0442\u043C\u0435\u043D\u0451\u043D": "\u041E\u0442\u043C\u0435\u043D\u0451\u043D",
    "\u043E\u0442\u043C\u0435\u043D\u0435\u043D": "\u041E\u0442\u043C\u0435\u043D\u0451\u043D"
  };
  function getStatusLabel(statusKey) {
    const key2 = canonStatus(statusKey);
    return STATUS_LABELS[key2] || String(key2 || "");
  }
  async function getOrders() {
    const list = await apiGetList();
    const local = getOrdersLocal();
    if (Array.isArray(list) && list.length === 0 && Array.isArray(local) && local.length > 0) {
      return local.map(normalizeOrder);
    }
    replaceOrdersCacheSilently(list);
    return list.map(normalizeOrder);
  }
  async function addOrder(order) {
    var _a4, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
    const idLocal = (_a4 = order.id) != null ? _a4 : String(Date.now());
    const now2 = Date.now();
    const initialStatus = canonStatus((_b = order.status) != null ? _b : "\u043D\u043E\u0432\u044B\u0439");
    const safeUserId = (_d = (_c = order.userId) != null ? _c : getUID()) != null ? _d : null;
    if (!safeUserId) {
      const err = new Error("\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u0447\u0435\u0440\u0435\u0437 Telegram. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0432\u043D\u0443\u0442\u0440\u0438 Telegram.");
      throw err;
    }
    const next = normalizeOrder({
      id: idLocal,
      shortId: (_f = (_e = order.shortId) != null ? _e : order.code) != null ? _f : null,
      userId: safeUserId,
      username: (_g = order.username) != null ? _g : "",
      productId: (_h = order.productId) != null ? _h : null,
      size: (_i = order.size) != null ? _i : null,
      color: (_j = order.color) != null ? _j : null,
      link: (_k = order.link) != null ? _k : order.productId ? `#/product/${order.productId}` : "",
      cart: Array.isArray(order.cart) ? order.cart : [],
      total: Number(order.total || 0),
      address: typeof order.address === "string" ? order.address : ((_l = order.address) == null ? void 0 : _l.address) || "",
      phone: (_m = order.phone) != null ? _m : "",
      payerFullName: (_n = order.payerFullName) != null ? _n : "",
      paymentScreenshot: (_o = order.paymentScreenshot) != null ? _o : "",
      status: initialStatus,
      accepted: !!order.accepted,
      canceled: !!order.canceled,
      cancelReason: order.cancelReason || "",
      canceledAt: order.canceledAt || null,
      completedAt: order.completedAt || null,
      createdAt: (_p = order.createdAt) != null ? _p : now2,
      currency: order.currency || "UZS",
      history: (_q = order.history) != null ? _q : [{ ts: now2, status: initialStatus }]
    });
    let createdId = next.id;
    try {
      const { id } = await apiPost("add", { order: next });
      createdId = id || next.id;
      try {
        const fresh = await apiGetList();
        const localBefore = getOrdersLocal();
        const nextList = __lastStoreKind === "memory" || fresh.length < localBefore.length ? mergeById(localBefore, fresh) : fresh;
        replaceOrdersCacheSilently(nextList);
      } catch (e) {
        const list = getOrdersLocal();
        saveOrders([next, ...list]);
      }
    } catch (e) {
      const list = getOrdersLocal();
      saveOrders([next, ...list]);
    }
    return createdId;
  }
  async function getOrdersForUser(userId) {
    const list = await getOrders();
    if (!userId) return [];
    return list.filter((o) => String(o.userId || "") === String(userId));
  }
  async function acceptOrder(orderId) {
    let updated = null;
    try {
      const { order } = await apiPost("accept", { id: String(orderId) });
      updated = order || null;
      const one = updated || await apiGetOne(orderId);
      if (one) {
        const list = getOrdersLocal();
        const i = list.findIndex((o) => String(o.id) === String(orderId));
        if (i > -1) list[i] = one;
        else list.unshift(one);
        replaceOrdersCacheSilently(list);
      } else {
        const fresh = await apiGetList();
        const localBefore = getOrdersLocal();
        const nextList = __lastStoreKind === "memory" || fresh.length < localBefore.length ? mergeById(localBefore, fresh) : fresh;
        replaceOrdersCacheSilently(nextList);
      }
    } catch (e) {
      const list = getOrdersLocal();
      const i = list.findIndex((o) => String(o.id) === String(orderId));
      if (i !== -1) {
        const o = list[i];
        if (canonStatus(o.status) === "\u043D\u043E\u0432\u044B\u0439" && !o.canceled) {
          o.accepted = true;
          o.status = "\u043F\u0440\u0438\u043D\u044F\u0442";
          writeHistory(o, "\u043F\u0440\u0438\u043D\u044F\u0442");
          updated = o;
          saveOrders(list);
        }
      }
    }
    saveOrders(getOrdersLocal());
    return updated;
  }
  async function cancelOrder(orderId, reason = "") {
    let updated = null;
    try {
      const { order } = await apiPost("cancel", { id: String(orderId), reason: String(reason || "") });
      updated = order || null;
      const one = updated || await apiGetOne(orderId);
      if (one) {
        const list = getOrdersLocal();
        const i = list.findIndex((o) => String(o.id) === String(orderId));
        if (i > -1) list[i] = one;
        else list.unshift(one);
        replaceOrdersCacheSilently(list);
      } else {
        const fresh = await apiGetList();
        const localBefore = getOrdersLocal();
        const nextList = __lastStoreKind === "memory" || fresh.length < localBefore.length ? mergeById(localBefore, fresh) : fresh;
        replaceOrdersCacheSilently(nextList);
      }
    } catch (e) {
      const list = getOrdersLocal();
      const i = list.findIndex((o) => String(o.id) === String(orderId));
      if (i !== -1) {
        const o = list[i];
        if (canonStatus(o.status) === "\u043D\u043E\u0432\u044B\u0439") {
          o.canceled = true;
          o.cancelReason = String(reason || "").trim();
          o.canceledAt = Date.now();
          o.accepted = false;
          o.status = "\u043E\u0442\u043C\u0435\u043D\u0451\u043D";
          writeHistory(o, "\u043E\u0442\u043C\u0435\u043D\u0451\u043D", { comment: o.cancelReason });
          updated = o;
          saveOrders(list);
        }
      }
    }
    saveOrders(getOrdersLocal());
    return updated;
  }
  async function updateOrderStatus(orderId, status) {
    var _a4, _b, _c;
    const stCanon = canonStatus(status);
    if (!ORDER_STATUSES.includes(stCanon)) return null;
    let updatedOrder = null;
    try {
      const { order } = await apiPost("status", { id: String(orderId), status: String(stCanon) });
      updatedOrder = order || null;
      const one = updatedOrder || await apiGetOne(orderId);
      if (one) {
        updatedOrder = one;
        const list = getOrdersLocal();
        const i = list.findIndex((o) => String(o.id) === String(orderId));
        if (i > -1) list[i] = one;
        else list.unshift(one);
        replaceOrdersCacheSilently(list);
      } else {
        const fresh = await apiGetList();
        const localBefore = getOrdersLocal();
        const nextList = __lastStoreKind === "memory" || fresh.length < localBefore.length ? mergeById(localBefore, fresh) : fresh;
        replaceOrdersCacheSilently(nextList);
        updatedOrder = nextList.find((o) => String(o.id) === String(orderId)) || null;
      }
    } catch (e) {
      const list = getOrdersLocal();
      const i = list.findIndex((o) => String(o.id) === String(orderId));
      if (i !== -1) {
        const o = list[i];
        const cur = canonStatus(o.status);
        if (cur !== "\u043D\u043E\u0432\u044B\u0439" && cur !== "\u043E\u0442\u043C\u0435\u043D\u0451\u043D" && !o.canceled) {
          o.status = stCanon;
          if (!o.accepted && stCanon !== "\u043E\u0442\u043C\u0435\u043D\u0451\u043D") o.accepted = true;
          if (stCanon === "\u0432\u044B\u0434\u0430\u043D") {
            o.completedAt = Date.now();
          }
          writeHistory(o, stCanon);
          updatedOrder = o;
          saveOrders(list);
        }
      }
    }
    try {
      if (typeof window !== "undefined" && window.__ALLOW_CLIENT_NOTIFY__ === true && updatedOrder) {
        notifyStatusChanged(null, {
          orderId: updatedOrder == null ? void 0 : updatedOrder.id,
          shortId: (_a4 = updatedOrder == null ? void 0 : updatedOrder.shortId) != null ? _a4 : null,
          title: ((_c = (_b = updatedOrder == null ? void 0 : updatedOrder.cart) == null ? void 0 : _b[0]) == null ? void 0 : _c.title) || (updatedOrder == null ? void 0 : updatedOrder.title) || ""
        });
      }
    } catch (e) {
    }
    saveOrders(getOrdersLocal());
    return updatedOrder;
  }
  function seedOrdersOnce() {
  }

  // src/core/payments.js
  function getPayRequisites() {
    return {
      cardNumber: "9860 3501 4075 6320",
      holder: "Temur Khidayatkhanov",
      provider: "Humo"
      // будет показан бейджем; можно оставить '' чтобы скрыть
    };
  }

  // src/core/loyalty.js
  var CASHBACK_CFG = {
    POINT_IS_SUM: 1,
    BASE_RATE: 0.05,
    REF_FIRST_MULTIPLIER: 2,
    REFERRER_EARN_RATE: 0.05,
    MAX_CART_DISCOUNT_FRAC: 0.3,
    MIN_REDEEM: 3e4,
    MAX_REDEEM: 15e4,
    PENDING_DELAY_MS: 24 * 60 * 60 * 1e3,
    MONTHLY_REF_LIMIT: 10
  };
  var FETCH_TIMEOUT_MS2 = 1e4;
  function withTimeout2(promise, ms = FETCH_TIMEOUT_MS2) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(
        (v2) => {
          clearTimeout(t);
          resolve(v2);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }
  var BOT_USERNAME = "evliseoutletbot";
  var LKEY_BALANCE = "loyalty_balance";
  var LKEY_REF = "loyalty_ref";
  var LKEY_INVITER = "pending_inviter_uid";
  function getTgInitDataRaw() {
    var _a4, _b;
    try {
      return typeof ((_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initData) === "string" ? window.Telegram.WebApp.initData : "";
    } catch (e) {
      return "";
    }
  }
  var ADMIN_OPS2 = /* @__PURE__ */ new Set([
    "admincalc",
    // админский расчёт по заказу
    "voidaccrual",
    // аннулировать ожидаемое начисление
    "accrue",
    // начислить pending на заказ (вызов из orders.js/админки)
    "confirmaccrual"
    // ручное подтверждение начисления (админ)
  ]);
  function getAdminToken2() {
    try {
      return typeof window !== "undefined" && (window.__ADMIN_API_TOKEN__ || window.ADMIN_API_TOKEN) || localStorage.getItem("admin_api_token") || "";
    } catch (e) {
      return "";
    }
  }
  function getLocalLoyalty() {
    try {
      const raw = localStorage.getItem(k(LKEY_BALANCE));
      const v2 = raw ? JSON.parse(raw) : {};
      return {
        available: Number(v2.available || 0),
        pending: Number(v2.pending || 0),
        history: Array.isArray(v2.history) ? v2.history : []
      };
    } catch (e) {
      return { available: 0, pending: 0, history: [] };
    }
  }
  function setLocalLoyalty(obj) {
    localStorage.setItem(
      k(LKEY_BALANCE),
      JSON.stringify({
        available: Number((obj == null ? void 0 : obj.available) || 0),
        pending: Number((obj == null ? void 0 : obj.pending) || 0),
        history: Array.isArray(obj == null ? void 0 : obj.history) ? obj.history : []
      })
    );
  }
  function setLocalRef(obj) {
    localStorage.setItem(k(LKEY_REF), JSON.stringify(obj || {}));
  }
  var API = "/.netlify/functions/loyalty";
  var OP_ALIAS = /* @__PURE__ */ new Map([
    // чтение
    ["getbalance", "getbalance"],
    ["getBalance", "getbalance"],
    // рефералы
    ["bindReferral", "bindreferral"],
    ["bindreferral", "bindreferral"],
    ["getReferrals", "getreferrals"],
    ["getreferrals", "getreferrals"],
    // списание
    ["reserveRedeem", "reserveredeem"],
    ["reserveredeem", "reserveredeem"],
    ["finalizeRedeem", "finalizeredeem"],
    ["finalizeredeem", "finalizeredeem"],
    // начисления
    ["accrue", "accrue"],
    ["confirmAccrual", "confirmaccrual"],
    ["confirmaccrual", "confirmaccrual"],
    ["voidAccrual", "voidaccrual"],
    ["voidaccrual", "voidaccrual"],
    // админский расчёт
    ["adminCalc", "admincalc"],
    ["admincalc", "admincalc"]
  ]);
  function normalizeOp(op) {
    const raw = String(op || "").trim();
    if (!raw) return "";
    if (OP_ALIAS.has(raw)) return OP_ALIAS.get(raw);
    const low = raw.toLowerCase();
    return OP_ALIAS.get(low) || low;
  }
  async function api(op, body = {}) {
    const norm = normalizeOp(op);
    const headers = {
      "Content-Type": "application/json",
      "X-Tg-Init-Data": getTgInitDataRaw()
    };
    if (ADMIN_OPS2.has(norm)) {
      const t = getAdminToken2();
      if (t) headers["X-Internal-Auth"] = t;
    }
    const r = await withTimeout2(fetch(API, {
      method: "POST",
      headers,
      body: JSON.stringify(__spreadValues({ op: norm }, body))
    }), FETCH_TIMEOUT_MS2);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || (data == null ? void 0 : data.ok) === false) {
      throw new Error((data == null ? void 0 : data.error) || "loyalty api error");
    }
    return data;
  }
  function setPendingInviter(uid) {
    try {
      if (uid) localStorage.setItem(k(LKEY_INVITER), String(uid));
    } catch (e) {
    }
  }
  function getPendingInviter() {
    try {
      return localStorage.getItem(k(LKEY_INVITER));
    } catch (e) {
      return null;
    }
  }
  function clearPendingInviter() {
    try {
      localStorage.removeItem(k(LKEY_INVITER));
    } catch (e) {
    }
  }
  async function fetchMyLoyalty() {
    try {
      const uid = getUID();
      const { balance } = await api("getBalance", { uid });
      setLocalLoyalty(balance || {});
      return balance || getLocalLoyalty();
    } catch (e) {
      return getLocalLoyalty();
    }
  }
  function makeReferralLink() {
    const uid = getUID();
    const start = `ref_${uid}`;
    return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(start)}`;
  }
  function captureInviterFromContext() {
    var _a4, _b, _c;
    try {
      const sp = ((_c = (_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initDataUnsafe) == null ? void 0 : _c.start_param) || "";
      if (sp && String(sp).startsWith("ref_")) {
        const inviter = String(sp).slice(4);
        if (inviter) setPendingInviter(inviter);
      }
      const parse = (searchOrHash = "") => {
        const p = new URLSearchParams(searchOrHash);
        const qpStart = p.get("start") || "";
        const qpRef = p.get("ref") || "";
        if (qpStart && qpStart.startsWith("ref_")) return qpStart.slice(4);
        if (qpRef) return qpRef;
        return "";
      };
      const qInv = parse((location.search || "").slice(1)) || parse(location.hash.split("?")[1] || "");
      if (qInv) setPendingInviter(qInv);
    } catch (e) {
    }
  }
  async function tryBindPendingInviter() {
    const me = getUID();
    const inviter = getPendingInviter();
    if (!inviter || !me || String(inviter) === String(me)) return;
    try {
      const { ok, reason } = await ensureReferralBound(inviter);
      if (ok || reason) clearPendingInviter();
    } catch (e) {
    }
  }
  async function ensureReferralBound(inviterUid) {
    const me = getUID();
    if (!inviterUid || String(inviterUid) === String(me)) return { ok: false, reason: "self" };
    const { ok, reason } = await api("bindReferral", { inviter: String(inviterUid), invitee: String(me) });
    if (ok) {
      setLocalRef({ inviter: String(inviterUid) });
    }
    return { ok, reason };
  }

  // src/components/Cart.js
  var MAX_DISCOUNT_SHARE = 0.3;
  var MIN_REDEEM_POINTS = 3e4;
  var MAX_REDEEM_POINTS = 15e4;
  var POINTS_MATURITY_MS = 24 * 60 * 60 * 1e3;
  var __checkoutFlowBusy = false;
  var __orderSubmitBusy = false;
  function k3(base) {
    var _a4;
    try {
      const uid = ((_a4 = getUID) == null ? void 0 : _a4()) || "guest";
      return `${base}__${uid}`;
    } catch (e) {
      return `${base}__guest`;
    }
  }
  var KEY_DRAFT_ORDER_ID = () => k3("order_draft_id");
  var KEY_REDEEM_DRAFT = () => k3("redeem_draft");
  var KEY_DRAFT_PUBLIC_ID = () => k3("order_draft_public");
  function ensureDraftOrderId() {
    var _a4;
    let id = sessionStorage.getItem(KEY_DRAFT_ORDER_ID());
    if (!id) {
      const uid = String(((_a4 = getUID) == null ? void 0 : _a4()) || "guest");
      id = `${uid}_${Date.now()}`;
      sessionStorage.setItem(KEY_DRAFT_ORDER_ID(), id);
    }
    return id;
  }
  function clearDraftOrderId() {
    sessionStorage.removeItem(KEY_DRAFT_ORDER_ID());
  }
  function ensureDraftPublicId() {
    var _a4;
    let v2 = sessionStorage.getItem(KEY_DRAFT_PUBLIC_ID());
    if (!v2) {
      v2 = makePublicId((_a4 = getUID) == null ? void 0 : _a4());
      sessionStorage.setItem(KEY_DRAFT_PUBLIC_ID(), v2);
    }
    return v2;
  }
  function clearDraftPublicId() {
    sessionStorage.removeItem(KEY_DRAFT_PUBLIC_ID());
  }
  function makePublicId(uid = "") {
    const ts = Date.now().toString(36).toUpperCase();
    const salt = String(uid || "").slice(-3);
    const raw = ts + salt;
    const sum = [...raw].reduce((a, c) => a + c.charCodeAt(0), 0) & 255;
    const chk = sum.toString(36).toUpperCase().padStart(2, "0");
    return ts + chk;
  }
  var OP_CHAT_URL = "https://t.me/evliseorder";
  function forceTop() {
    var _a4, _b;
    try {
      (_b = (_a4 = document.activeElement) == null ? void 0 : _a4.blur) == null ? void 0 : _b.call(_a4);
    } catch (e) {
    }
    const se = document.scrollingElement || document.documentElement;
    window.scrollTo(0, 0);
    se.scrollTop = 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      se.scrollTop = 0;
    });
  }
  function keepCartOnTopWhileLoading(root) {
    const stillCart = () => location.hash.startsWith("#/cart");
    if (!root) return;
    const imgs = root.querySelectorAll("img");
    imgs.forEach((img) => {
      if (img.complete && img.naturalWidth > 0) {
        if (stillCart()) forceTop();
        return;
      }
      const onLoad = () => {
        if (stillCart()) forceTop();
        img.removeEventListener("load", onLoad);
      };
      img.addEventListener("load", onLoad, { once: true });
    });
    setTimeout(() => {
      if (stillCart()) forceTop();
    }, 250);
  }
  async function renderCart() {
    var _a4, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    forceTop();
    try {
      await fetchMyLoyalty();
    } catch (e) {
    }
    const walletLike = getLocalLoyalty() || { available: 0, pending: 0 };
    const v2 = document.getElementById("view");
    const items = state.cart.items.map((it) => __spreadProps(__spreadValues({}, it), { product: state.products.find((p) => String(p.id) === String(it.productId)) })).filter((x) => x.product);
    (_a4 = window.setTabbarMenu) == null ? void 0 : _a4.call(window, "cart");
    if (!items.length) {
      v2.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="cartBack" aria-label="\u041D\u0430\u0437\u0430\u0434"><i data-lucide="chevron-left"></i></button>
        \u041A\u043E\u0440\u0437\u0438\u043D\u0430
      </div>
      <section class="checkout"><div class="cart-sub">\u041A\u043E\u0440\u0437\u0438\u043D\u0430 \u043F\u0443\u0441\u0442\u0430</div></section>`;
      ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
      (_c = document.getElementById("cartBack")) == null ? void 0 : _c.addEventListener("click", () => history.back());
      resetScrollTop();
      keepCartOnTopWhileLoading(v2);
      return;
    }
    const totalRaw = items.reduce((s, x) => s + x.qty * x.product.price, 0);
    const canRedeemMaxByShare = Math.floor(totalRaw * MAX_DISCOUNT_SHARE);
    let availablePoints = Number(walletLike.available || 0);
    let redeemMax = Math.max(0, Math.min(canRedeemMaxByShare, availablePoints, MAX_REDEEM_POINTS));
    const redeemMin = MIN_REDEEM_POINTS;
    const draft = Number(sessionStorage.getItem(KEY_REDEEM_DRAFT()) || 0) | 0;
    const redeemInit = Math.max(0, Math.min(redeemMax, draft));
    const addressesList = ((_d = state.addresses) == null ? void 0 : _d.list) || [];
    const defaultAddrId = (_e = state.addresses) == null ? void 0 : _e.defaultId;
    const ad = addressesList.find((a) => a.id === defaultAddrId) || null;
    v2.innerHTML = `
  <style>
    /* --- \u0413\u041B\u041E\u0411\u0410\u041B\u042C\u041D\u041E \u0414\u041B\u042F \u041A\u041E\u041C\u041F\u041E\u041D\u0415\u041D\u0422\u0410: \u043F\u0440\u0435\u0434\u043E\u0442\u0432\u0440\u0430\u0449\u0430\u0435\u043C \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u043A\u0440\u043E\u043B\u043B \u0438 \xAB\u0441\u044A\u0435\u0437\u0434\xBB \u0432\u043F\u0440\u0430\u0432\u043E --- */
    .section, .checkout { width:100%; max-width:100vw; overflow-x:hidden; }
    .checkout, .checkout * { box-sizing: border-box; }
    .checkout img { max-width:100%; height:auto; display:block; }

    /* \u0421\u0442\u0440\u043E\u043A\u0430 \u0442\u043E\u0432\u0430\u0440\u0430 \u2014 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u0430\u044F \u0441\u0435\u0442\u043A\u0430 */
    .cart-row{
      display:grid;
      grid-template-columns: 72px 1fr auto;
      gap:10px;
      align-items:center;
      cursor:pointer;
    }
    .cart-row .qty-mini, .cart-row .ctrl{ cursor:auto; }

    .cart-img{ width:72px; height:72px; border-radius:10px; overflow:hidden; }
    .cart-img img{ width:100%; height:100%; object-fit:cover; }

    /* \u0426\u0435\u043D\u0442\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u043A\u043E\u043B\u043E\u043D\u043A\u0430 \u043D\u0435 \u0434\u043E\u043B\u0436\u043D\u0430 \u0440\u0430\u0441\u043F\u0438\u0440\u0430\u0442\u044C \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440 */
    .cart-row > div:nth-child(2){ min-width:0; }
    .cart-title{ overflow-wrap:anywhere; word-break:break-word; }
    .cart-sub{ white-space:normal; color:var(--muted,#6b7280); }

    .qty-mini{ display:flex; align-items:center; gap:6px; }
    .qty-mini span{ min-width:1.6em; text-align:center; }
    .qty-mini .ctrl{ width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; }

    /* \u0410\u0434\u0440\u0435\u0441 */
    .address-row{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .address-left{ min-width:0; }
    .address-left .cart-sub{ overflow:hidden; text-overflow:ellipsis; }

    /* \u041B\u0438\u043D\u0438\u044F \u043E\u043F\u043B\u0430\u0442\u044B \u2014 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u044B */
    .payline{ display:grid; gap:6px; }
    .payrow{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
    .payrow span{ min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .payrow b{ flex:0 0 auto; }

    /* \u0411\u043B\u043E\u043A \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F */
    .cashback-box input.input{ width:100%; }

    /* FAQ \u043A\u0430\u0440\u0442\u0430 */
    .faq-card{ max-width:100%; overflow:hidden; }

    /* \u041C\u043E\u0431\u0438\u043B\u044C\u043D\u0430\u044F \u0430\u0434\u0430\u043F\u0442\u0430\u0446\u0438\u044F: \u043E\u0447\u0435\u043D\u044C \u0443\u0437\u043A\u0438\u0435 \u044D\u043A\u0440\u0430\u043D\u044B */
    @media (max-width: 380px){
      .cart-row{ grid-template-columns: 64px 1fr; }
      .qty-mini{ grid-column: 1 / -1; justify-content:flex-end; }
      .cart-img{ width:64px; height:64px; }
    }
  </style

  <div class="section-title" style="display:flex;align-items:center;gap:10px">
    <button class="square-btn" id="cartBack" aria-label="\u041D\u0430\u0437\u0430\u0434"><i data-lucide="chevron-left"></i></button>
    \u041E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435
  </div>

  <section class="checkout" id="cList">
    ${items.map((x) => {
      var _a5;
      return `
      <div class="cart-row" data-id="${String(x.product.id)}" data-size="${x.size || ""}" data-color="${x.color || ""}" role="link" aria-label="\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0442\u043E\u0432\u0430\u0440\u0430">
        <div class="cart-img"><img src="${((_a5 = x.product.images) == null ? void 0 : _a5[0]) || ""}" alt=""></div>
        <div>
          <div class="cart-title">${escapeHtml2(x.product.title)}</div>
          <div class="cart-sub">
            ${x.size ? `\u0420\u0430\u0437\u043C\u0435\u0440 ${escapeHtml2(x.size)}` : ""}
            ${x.size && x.color ? " \u2022 " : ""}
            ${x.color ? `${escapeHtml2(colorName(x.color))}` : ""}
          </div>
          <div class="cart-price">${priceFmt(x.product.price)}</div>
        </div>
        <div class="qty-mini">
          <button class="ctrl dec" aria-label="\u041C\u0438\u043D\u0443\u0441"><i data-lucide="minus"></i></button>
          <span>${x.qty}</span>
          <button class="ctrl inc" aria-label="\u041F\u043B\u044E\u0441"><i data-lucide="plus"></i></button>
        </div>
      </div>`;
    }).join("")}

    <div class="shipping">
      <div class="address-row">
        <div class="address-left">
          <div class="cart-title">\u0410\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438</div>
          ${ad ? `<div class="cart-sub">${escapeHtml2(ad.nickname)} \u2014 ${escapeHtml2(ad.address)}</div>` : `<div class="cart-sub">\u0410\u0434\u0440\u0435\u0441 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D</div>`}
        </div>
        <a class="pill" href="#/account/addresses">${ad ? "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441" : "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441"}</a>
      </div>
    </div>
    
<!-- \u0411\u043B\u043E\u043A \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u0431\u0430\u043B\u043B\u043E\u0432 -->
<div class="cashback-box" style="margin-top:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px;padding:10px;background:var(--card,rgba(0,0,0,.03))">
  <div class="cart-title" style="display:flex;align-items:center;gap:8px">
    <i data-lucide="coins"></i>
    <span>\u0421\u043F\u0438\u0441\u0430\u0442\u044C \u0431\u0430\u043B\u043B\u044B</span>
    <span class="muted" style="margin-left:auto">\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E: <b id="cbAvail">${(availablePoints | 0).toLocaleString("ru-RU")}</b></span>
  </div>

  <div class="muted mini" style="margin:6px 0 8px">
    \u041C\u0438\u043D\u0438\u043C\u0443\u043C \u043A \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044E: ${MIN_REDEEM_POINTS.toLocaleString("ru-RU")} \xB7 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C:
    <b id="redeemMaxVal">${Math.max(0, redeemMax).toLocaleString("ru-RU")}</b>
    (\u043D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 30% \u043E\u0442 \u0441\u0443\u043C\u043C\u044B \u0438 \u043D\u0435 \u0431\u043E\u043B\u0435\u0435 150&nbsp;000)
  </div>

  <div class="row">
    <input
      id="redeemInput"
      class="input"
      inputmode="numeric"
      pattern="[0-9]*"
      value="${redeemInit || ""}"
      placeholder="0"
    >
    <div class="btns">
      <button class="pill" id="redeemMaxBtn">\u041C\u0430\u043A\u0441</button>
      <button class="pill" id="redeemClearBtn">\u0421\u0431\u0440\u043E\u0441</button>
    </div>
  </div>

  <div id="redeemHint" class="muted mini" style="margin-top:6px"></div>
</div>


    <div class="payline">
      <div class="payrow"><span>\u0422\u043E\u0432\u0430\u0440\u044B (${items.reduce((s, i) => s + i.qty, 0)} \u0448\u0442.)</span><b id="sumRaw">${priceFmt(totalRaw)}</b></div>
      <div class="payrow"><span>\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430</span><b>${priceFmt(0)}</b></div>
      <div class="payrow"><span>\u0421\u043A\u0438\u0434\u043A\u0430 \u0431\u0430\u043B\u043B\u0430\u043C\u0438</span><b id="sumDisc">${priceFmt(0)}</b></div>
      <div class="payrow" style="border-top:1px dashed var(--border,rgba(0,0,0,.12));padding-top:6px"><span><b>\u041A \u043E\u043F\u043B\u0430\u0442\u0435</b></span><b id="sumPay">${priceFmt(totalRaw)}</b></div>
    </div>

    <!-- FAQ \u043F\u0435\u0440\u0435\u0434 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435\u043C -->
    <div class="cart-faq" style="margin-top:14px">
      <style>
        .faq-card{border:1px solid var(--border,rgba(0,0,0,.12));border-radius:14px;padding:12px;background:var(--card,#f9f9f9);display:grid;gap:12px;max-width:100%}
        .faq-row{display:grid;grid-template-columns:24px 1fr;column-gap:10px;align-items:start}
        .faq-q{font-weight:600}
        .faq-a{color:var(--muted,#6b7280);margin-top:4px;line-height:1.35}
        .faq-cta{display:flex;justify-content:center;margin-top:10px}
        .faq-cta .pill{display:inline-flex;align-items:center;gap:8px}
        .faq-cta .pill i{width:16px;height:16px}
      </style>

      <div class="faq-card" role="region" aria-label="\u0427\u0430\u0441\u0442\u044B\u0435 \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u043F\u0435\u0440\u0435\u0434 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435\u043C">
        <div class="faq-row">
          <i data-lucide="clock"></i>
          <div>
            <div class="faq-q">\u0421\u0440\u043E\u043A\u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438</div>
            <div class="faq-a">\u041E\u0431\u044B\u0447\u043D\u043E <b>14\u201316 \u0434\u043D\u0435\u0439</b> \u0441 \u043C\u043E\u043C\u0435\u043D\u0442\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F. \u0415\u0441\u043B\u0438 \u0441\u0440\u043E\u043A \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0441\u044F \u2014 \u043C\u044B \u0443\u0432\u0435\u0434\u043E\u043C\u0438\u043C.</div>
          </div>
        </div>
        <div class="faq-row">
          <i data-lucide="credit-card"></i>
          <div>
            <div class="faq-q">\u041A\u0430\u043A \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442 \u043E\u043F\u043B\u0430\u0442\u0430?</div>
            <div class="faq-a">\u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0432\u044B \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0438\u0442\u0435 \u0441\u0443\u043C\u043C\u0443 \u043D\u0430 \u043A\u0430\u0440\u0442\u0443 \u0438 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0435 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442 \u043E\u043F\u043B\u0430\u0442\u044B. \u0415\u0441\u043B\u0438 \u043F\u043B\u0430\u0442\u0451\u0436 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u2014 \u043C\u044B \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u043C \u0437\u0430\u043A\u0430\u0437.</div>
          </div>
        </div>
        <div class="faq-row">
          <i data-lucide="message-circle"></i>
          <div>
            <div class="faq-q">\u0415\u0441\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441\u044B?</div>
            <div class="faq-a">\u041E\u0442\u0432\u0435\u0442\u0438\u043C \u043F\u043E \u0440\u0430\u0437\u043C\u0435\u0440\u0443, \u043E\u043F\u043B\u0430\u0442\u0435 \u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u0443 \u2014 \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043D\u0430\u043C.</div>
          </div>
        </div>
      </div>

      <div class="faq-cta">
        <button id="faqOperator" class="pill outline" type="button" aria-label="\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0443 \u0432 Telegram">
          <i data-lucide="send"></i><span>\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0443</span>
        </button>
      </div>
    </div>
    <!-- /FAQ -->
  </section>`;
    ((_f = window.lucide) == null ? void 0 : _f.createIcons) && lucide.createIcons();
    resetScrollTop();
    keepCartOnTopWhileLoading(v2);
    (_g = document.getElementById("cartBack")) == null ? void 0 : _g.addEventListener("click", () => history.back());
    document.querySelectorAll(".cart-row").forEach((row) => {
      var _a5, _b2;
      const id = row.getAttribute("data-id");
      const size = row.getAttribute("data-size") || null;
      const color = row.getAttribute("data-color") || null;
      (_a5 = row.querySelector(".inc")) == null ? void 0 : _a5.addEventListener("click", (ev) => {
        ev.stopPropagation();
        changeQty(id, size, color, 1);
      });
      (_b2 = row.querySelector(".dec")) == null ? void 0 : _b2.addEventListener("click", (ev) => {
        ev.stopPropagation();
        changeQty(id, size, color, -1);
      });
      row.addEventListener("click", (e) => {
        if (e.target.closest(".qty-mini") || e.target.closest(".ctrl")) return;
        if (e.target.closest("a")) return;
        location.hash = `#/product/${id}`;
      });
    });
    (_h = document.getElementById("faqOperator")) == null ? void 0 : _h.addEventListener("click", () => openExternal(OP_CHAT_URL));
    const inEl = document.getElementById("redeemInput");
    const hintEl = document.getElementById("redeemHint");
    const discEl = document.getElementById("sumDisc");
    const payEl = document.getElementById("sumPay");
    function clampRedeem(x) {
      let v3 = Math.max(0, Number(x) || 0);
      v3 = Math.min(v3, redeemMax);
      return v3 | 0;
    }
    function validateRedeem(v3) {
      if (v3 === 0) return "";
      if (v3 < redeemMin) return `\u041C\u0438\u043D\u0438\u043C\u0443\u043C \u0434\u043B\u044F \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F: ${MIN_REDEEM_POINTS.toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432`;
      if (v3 > availablePoints) return "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0431\u0430\u043B\u043B\u043E\u0432";
      if (v3 > redeemMax) return "\u041F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043B\u0438\u043C\u0438\u0442 (30% \u043E\u0442 \u0441\u0443\u043C\u043C\u044B, \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 150 000)";
      return "";
    }
    function recalc() {
      const v3 = clampRedeem(inEl.value);
      sessionStorage.setItem(KEY_REDEEM_DRAFT(), String(v3));
      const err = validateRedeem(v3);
      hintEl.textContent = err;
      hintEl.style.color = err ? "#b91c1c" : "var(--muted,#666)";
      const disc = err || v3 === 0 ? 0 : v3;
      const pay = Math.max(0, totalRaw - disc);
      discEl.textContent = priceFmt(disc);
      payEl.textContent = priceFmt(pay);
      return { disc, pay, err };
    }
    inEl == null ? void 0 : inEl.addEventListener("input", recalc);
    (_i = document.getElementById("redeemMaxBtn")) == null ? void 0 : _i.addEventListener("click", () => {
      inEl.value = String(redeemMax);
      recalc();
    });
    (_j = document.getElementById("redeemClearBtn")) == null ? void 0 : _j.addEventListener("click", () => {
      inEl.value = "";
      recalc();
    });
    recalc();
    (async () => {
      try {
        await fetchMyLoyalty();
        const b = getLocalLoyalty();
        availablePoints = Math.max(0, Number(b.available || 0));
        const availEl = document.getElementById("cbAvail");
        if (availEl) availEl.textContent = availablePoints.toLocaleString("ru-RU");
        redeemMax = Math.max(
          0,
          Math.min(Math.floor(totalRaw * MAX_DISCOUNT_SHARE), availablePoints, MAX_REDEEM_POINTS)
        );
        const maxEl = document.getElementById("redeemMaxVal");
        if (maxEl) maxEl.textContent = Math.max(0, redeemMax).toLocaleString("ru-RU");
        const vNow = Number((inEl == null ? void 0 : inEl.value) || 0) | 0;
        if (vNow > redeemMax) {
          inEl.value = String(redeemMax || "");
        }
        recalc();
      } catch (e) {
      }
    })();
    (_k = window.setTabbarCTA) == null ? void 0 : _k.call(window, {
      html: `<i data-lucide="credit-card"></i><span>\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u0437\u0430\u043A\u0430\u0437</span>`,
      onClick() {
        if (__checkoutFlowBusy) return;
        __checkoutFlowBusy = true;
        setTimeout(() => {
          __checkoutFlowBusy = false;
        }, 1200);
        if (document.body.dataset.checkoutModalOpen === "1") return;
        const { disc, pay, err } = recalc();
        if (err) {
          toast(err);
          return;
        }
        checkoutFlow(items, ad, totalRaw, { redeem: disc, toPay: pay });
      }
    });
  }
  function resetScrollTop() {
    forceTop();
    requestAnimationFrame(forceTop);
  }
  function changeQty(productId, size, color, delta) {
    const it = state.cart.items.find(
      (a) => String(a.productId) === String(productId) && (a.size || null) === (size || null) && (a.color || null) === (color || null)
    );
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) return remove(productId, size, color);
    persistCart();
    updateCartBadge();
    renderCart();
  }
  function remove(productId, size, color) {
    state.cart.items = state.cart.items.filter((a) => !(String(a.productId) === String(productId) && (a.size || null) === (size || null) && (a.color || null) === (color || null)));
    persistCart();
    updateCartBadge();
    toast("\u0423\u0434\u0430\u043B\u0435\u043D\u043E");
    renderCart();
  }
  async function callLoyalty(op, data) {
    const tgInit = (() => {
      var _a4, _b;
      try {
        return ((_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initData) || "";
      } catch (e) {
        return "";
      }
    })();
    const r = await fetch("/.netlify/functions/loyalty", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // ✅ подпись Telegram для валидации на бэке
        "X-Tg-Init-Data": tgInit
      },
      body: JSON.stringify(__spreadValues({ op }, data))
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j == null ? void 0 : j.ok) === false) throw new Error((j == null ? void 0 : j.error) || (j == null ? void 0 : j.reason) || "loyalty error");
    return j;
  }
  function checkoutFlow(items, addr, totalRaw, bill) {
    var _a4, _b, _c, _d, _e, _f, _g;
    if (!(items == null ? void 0 : items.length)) {
      toast("\u041A\u043E\u0440\u0437\u0438\u043D\u0430 \u043F\u0443\u0441\u0442\u0430");
      return;
    }
    if (!addr) {
      toast("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438");
      location.hash = "#/account/addresses";
      return;
    }
    if (document.body.dataset.checkoutModalOpen === "1") return;
    document.body.dataset.checkoutModalOpen = "1";
    const modal = document.getElementById("modal");
    const mb = document.getElementById("modalBody");
    const mt = document.getElementById("modalTitle");
    const ma = document.getElementById("modalActions");
    const savedPhone = ((_a4 = state.profile) == null ? void 0 : _a4.phone) || "";
    const savedPayer = ((_b = state.profile) == null ? void 0 : _b.payerFullName) || "";
    mt.textContent = "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0445";
    const list = (((_c = state.addresses) == null ? void 0 : _c.list) || []).slice();
    const def = (_d = state.addresses) == null ? void 0 : _d.defaultId;
    const defItem = list.find((a) => a.id === def) || addr;
    mb.innerHTML = `
    <style>
      .addr-picker{ margin-top:6px; border:1px solid var(--border, rgba(0,0,0,.12)); border-radius:10px; padding:6px; background:var(--card,#f6f6f6); }
      .addr-p-row{ display:flex; align-items:flex-start; gap:10px; padding:8px; border-radius:8px; cursor:pointer; }
      .addr-p-row:hover{ background: rgba(0,0,0,.05); }
      .addr-p-title{ font-weight:700; }
      .addr-p-sub{ color:var(--muted,#666); font-size:.92rem; line-height:1.25; }
      .link-like{ color:var(--link,#0a84ff); cursor:pointer; text-decoration:underline; }
    </style>
    <div class="form-grid">
      <label class="field"><span>\u041D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430</span>
        <input id="cfPhone" class="input" placeholder="+998 ..." value="${escapeHtml2(savedPhone)}">
      </label>
      <label class="field"><span>\u0424\u0418\u041E \u043F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A\u0430</span>
        <input id="cfPayer" class="input" placeholder="\u0424\u0430\u043C\u0438\u043B\u0438\u044F \u0418\u043C\u044F" value="${escapeHtml2(savedPayer)}">
      </label>
      <label class="field"><span>\u0410\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438</span>
        <input id="cfAddr" class="input" value="${escapeHtml2(addr.address)}">
        <div class="helper">\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441: <b id="cfSavedName">${escapeHtml2((defItem == null ? void 0 : defItem.nickname) || "")}</b> \u2014 <span id="cfChangeSaved" class="link-like">\u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C</span></div>
        <div id="addrPicker" class="addr-picker" style="display:none">
          ${list.length ? list.map((a) => `
            <div class="addr-p-row" data-id="${a.id}">
              <i data-lucide="map-pin" style="min-width:18px"></i>
              <div>
                <div class="addr-p-title">${escapeHtml2(a.nickname || "\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F")}</div>
                <div class="addr-p-sub">${escapeHtml2(a.address || "")}</div>
              </div>
            </div>
          `).join("") : `<div class="addr-p-sub">\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0445 \u0430\u0434\u0440\u0435\u0441\u043E\u0432 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0432 \u043F\u0440\u043E\u0444\u0438\u043B\u0435.</div>`}
        </div>
      </label>
      <div class="field">
        <span>\u0422\u043E\u0432\u0430\u0440\u044B \u0432 \u0437\u0430\u043A\u0430\u0437\u0435</span>
        <ul style="margin:6px 0 0; padding-left:18px; color:#444">
          ${items.map((x) => `<li>
            ${escapeHtml2(x.product.title)}
            ${x.size ? ` \xB7 \u0440\u0430\u0437\u043C\u0435\u0440 ${escapeHtml2(x.size)}` : ""}
            ${x.color ? ` \xB7 ${escapeHtml2(colorName(x.color))}` : ""}
            \xD7${x.qty}
          </li>`).join("")}
        </ul>
      </div>
      <label class="field" style="display:flex;align-items:center;gap:10px">
        <input id="cfSavePhone" type="checkbox" ${savedPhone ? "checked" : ""}>
        <span>\u0417\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C \u0442\u0435\u043B\u0435\u0444\u043E\u043D</span>
      </label>
      <label class="field" style="display:flex;align-items:center;gap:10px">
        <input id="cfSavePayer" type="checkbox" ${savedPayer ? "checked" : ""}>
        <span>\u0417\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C \u0424\u0418\u041E \u043F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A\u0430</span>
      </label>
    </div>
  `;
    ma.innerHTML = `
    <button id="cfCancel" class="pill">\u041E\u0442\u043C\u0435\u043D\u0430</button>
    <button id="cfNext" class="pill primary">\u0414\u0430\u043B\u0435\u0435 \u043A \u043E\u043F\u043B\u0430\u0442\u0435</button>
  `;
    modal.classList.add("show");
    ((_e = window.lucide) == null ? void 0 : _e.createIcons) && lucide.createIcons();
    const changeLink = document.getElementById("cfChangeSaved");
    const picker = document.getElementById("addrPicker");
    const addrInput = document.getElementById("cfAddr");
    const savedName = document.getElementById("cfSavedName");
    if (changeLink) {
      changeLink.addEventListener("click", (e) => {
        e.preventDefault();
        if (!picker) return;
        const show = picker.style.display === "none";
        picker.style.display = show ? "" : "none";
      });
    }
    if (picker) {
      picker.addEventListener("click", (e) => {
        var _a5;
        const row = e.target.closest(".addr-p-row");
        if (!row) return;
        const id = Number(row.getAttribute("data-id"));
        const sel = (((_a5 = state.addresses) == null ? void 0 : _a5.list) || []).find((x) => Number(x.id) === id);
        if (!sel) return;
        addrInput.value = sel.address || "";
        if (savedName) savedName.textContent = sel.nickname || "\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F";
        picker.style.display = "none";
      });
    }
    const mc1 = document.getElementById("modalClose");
    if (mc1) mc1.onclick = close;
    (_f = document.getElementById("cfCancel")) == null ? void 0 : _f.addEventListener("click", close);
    (_g = document.getElementById("cfNext")) == null ? void 0 : _g.addEventListener("click", () => {
      var _a5, _b2, _c2, _d2, _e2;
      const phone = (((_a5 = document.getElementById("cfPhone")) == null ? void 0 : _a5.value) || "").trim();
      const payer = (((_b2 = document.getElementById("cfPayer")) == null ? void 0 : _b2.value) || "").trim();
      const address = (((_c2 = document.getElementById("cfAddr")) == null ? void 0 : _c2.value) || "").trim();
      const savePhone = (_d2 = document.getElementById("cfSavePhone")) == null ? void 0 : _d2.checked;
      const savePayer = (_e2 = document.getElementById("cfSavePayer")) == null ? void 0 : _e2.checked;
      if (!phone) {
        toast("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430");
        return;
      }
      if (!address) {
        toast("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441");
        return;
      }
      if (!state.profile) state.profile = {};
      if (savePhone) {
        state.profile.phone = phone;
      }
      if (savePayer) {
        state.profile.payerFullName = payer;
      }
      persistProfile();
      close();
      openPayModal({ items, address, phone, payer, totalRaw, bill });
    });
    function close() {
      modal.classList.remove("show");
      delete document.body.dataset.checkoutModalOpen;
    }
  }
  function openPayModal({ items, address, phone, payer, totalRaw, bill }) {
    var _a4, _b, _c;
    const redeem = Number((bill == null ? void 0 : bill.redeem) || 0) | 0;
    const toPay = Math.max(0, Number((bill == null ? void 0 : bill.toPay) || 0));
    const modal = document.getElementById("modal");
    const mb = document.getElementById("modalBody");
    const mt = document.getElementById("modalTitle");
    const ma = document.getElementById("modalActions");
    document.body.dataset.checkoutModalOpen = "1";
    const pay = getPayRequisites();
    let shotDataUrl = "";
    let shotBusy = false;
    const orderId = ensureDraftOrderId();
    const publicId = ensureDraftPublicId();
    mt.textContent = "\u041E\u043F\u043B\u0430\u0442\u0430 \u0437\u0430\u043A\u0430\u0437\u0430";
    mb.innerHTML = `
    <style>
      .note{ display:grid; grid-template-columns: 24px 1fr; gap:10px; align-items:center; }
      .shot-wrap{ display:grid; gap:8px; }
      .shot-preview{ display:flex; align-items:center; gap:10px; }
      .shot-preview img{ width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid var(--border, rgba(0,0,0,.1)); }
      .pay-badge{ display:inline-block; font-size:.8rem; line-height:1.2; padding:2px 6px; border-radius:999px; background:rgba(0,0,0,.06); vertical-align:middle; }
      .note-sub.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
      .copy-line{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .spin{ width:16px; height:16px; border:2px solid rgba(0,0,0,.2); border-top-color:rgba(0,0,0,.6); border-radius:50%; animation:spin .8s linear infinite; }
      @keyframes spin{to{transform:rotate(360deg)}}
      .muted-mini{ color:var(--muted,#6b7280); font-size:.88rem; }
    </style>
    <div class="form-grid">
      <div class="cart-title" style="font-size:18px">\u041A \u043E\u043F\u043B\u0430\u0442\u0435: ${priceFmt(toPay)} ${redeem > 0 ? `<span class="muted-mini">(${priceFmt(totalRaw)} \u2212 ${priceFmt(redeem)} \u0431\u0430\u043B\u043B\u043E\u0432)</span>` : ""}</div>
      <div class="note">
        <i data-lucide="credit-card"></i>
        <div>
          <div class="note-title">\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0430 \u043A\u0430\u0440\u0442\u0443</div>

          <!-- \u041D\u043E\u043C\u0435\u0440 \u043A\u0430\u0440\u0442\u044B + \u0418\u041A\u041E\u041D\u041A\u0410 \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0432 \u043E\u0434\u043D\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u0435 -->
          <div class="copy-line" style="margin-top:4px">
            <div id="cardNumber" class="note-sub mono" style="user-select:all">${escapeHtml2(pay.cardNumber)}</div>
            <button id="copyCardBtn" class="square-btn" type="button" aria-label="\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043D\u043E\u043C\u0435\u0440" title="\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043D\u043E\u043C\u0435\u0440" style="width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center">
              <i data-lucide="copy" style="width:16px;height:16px"></i>
            </button>
            <span id="copyCardHint" class="muted-mini" style="display:none">\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E!</span>
          </div>

          <div class="note-sub muted" style="margin-top:4px">
            ${escapeHtml2(pay.holder || "")}
            ${pay.provider ? ` \xB7 <span class="pay-badge">${escapeHtml2(pay.provider)}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="field shot-wrap">
        <label><span>\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442 \u043E\u043F\u043B\u0430\u0442\u044B</span></label>
        <input id="payShot" type="file" accept="image/*" class="input">
        <div class="helper">\u0438\u043B\u0438 \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 URL \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0447\u0435\u043A\u0430</div>
        <input id="payShotUrl" class="input" placeholder="https://...">
        <div id="shotPreview" class="shot-preview" style="display:none">
          <div id="shotThumbWrap"></div>
          <div id="shotMeta" class="muted"></div>
          <button id="shotClear" class="pill" style="margin-left:auto">\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C</button>
        </div>
        <div id="shotBusy" style="display:none;display:flex;align-items:center;gap:8px">
          <div class="spin" aria-hidden="true"></div>
          <span class="muted">\u041E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u043C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u2026</span>
        </div>
      </div>
    </div>
  `;
    ma.innerHTML = `
    <button id="payBack" class="pill">\u041D\u0430\u0437\u0430\u0434</button>
    <button id="payDone" class="pill primary">\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043E\u043F\u043B\u0430\u0442\u0443</button>
  `;
    modal.classList.add("show");
    ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
    const copyBtn = document.getElementById("copyCardBtn");
    const copyHint = document.getElementById("copyCardHint");
    const cardEl = document.getElementById("cardNumber");
    copyBtn == null ? void 0 : copyBtn.addEventListener("click", async () => {
      var _a5;
      const text = ((cardEl == null ? void 0 : cardEl.textContent) || String(pay.cardNumber || "")).trim();
      if (!text) return;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          ok = true;
        } catch (e2) {
        }
      }
      if (ok) {
        const icon = copyBtn.querySelector("i[data-lucide]");
        const prevIcon = (icon == null ? void 0 : icon.getAttribute("data-lucide")) || "copy";
        if (icon) {
          icon.setAttribute("data-lucide", "check");
          ((_a5 = window.lucide) == null ? void 0 : _a5.createIcons) && lucide.createIcons();
        }
        if (copyHint) copyHint.style.display = "";
        setTimeout(() => {
          var _a6;
          if (icon) {
            icon.setAttribute("data-lucide", prevIcon);
            ((_a6 = window.lucide) == null ? void 0 : _a6.createIcons) && lucide.createIcons();
          }
          if (copyHint) copyHint.style.display = "none";
        }, 1400);
      }
    });
    const fileInput = document.getElementById("payShot");
    const urlInput = document.getElementById("payShotUrl");
    const pv = document.getElementById("shotPreview");
    const thumbWrap = document.getElementById("shotThumbWrap");
    const meta = document.getElementById("shotMeta");
    const clearBtn = document.getElementById("shotClear");
    const busyBar = document.getElementById("shotBusy");
    fileInput == null ? void 0 : fileInput.addEventListener("change", async () => {
      var _a5;
      const file = (_a5 = fileInput.files) == null ? void 0 : _a5[0];
      if (!file) {
        clearShot();
        return;
      }
      if (!/^image\//i.test(file.type)) {
        toast("\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435");
        clearShot();
        return;
      }
      try {
        setSubmitDisabled(true);
        shotBusy = true;
        busyBar.style.display = "flex";
        const { dataUrl, outW, outH } = await compressImageToDataURL(file, 1600, 1600, 0.82);
        shotDataUrl = dataUrl;
        pv.style.display = "";
        thumbWrap.innerHTML = `<img alt="\u0427\u0435\u043A" src="${shotDataUrl}">`;
        const kb = Math.round(dataUrl.length * 3 / 4 / 1024);
        meta.textContent = `\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 ${outW}\xD7${outH} \xB7 ~${kb} KB`;
        urlInput.value = "";
      } catch (err) {
        console.error(err);
        toast("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435");
        clearShot();
      } finally {
        shotBusy = false;
        busyBar.style.display = "none";
        setSubmitDisabled(false);
      }
    });
    clearBtn == null ? void 0 : clearBtn.addEventListener("click", () => {
      clearShot();
      fileInput.value = "";
    });
    function clearShot() {
      shotDataUrl = "";
      pv.style.display = "none";
      thumbWrap.innerHTML = "";
      meta.textContent = "";
    }
    const payDoneBtn = document.getElementById("payDone");
    function setSubmitDisabled(dis) {
      if (!payDoneBtn) return;
      payDoneBtn.disabled = !!dis;
      payDoneBtn.setAttribute("aria-busy", dis ? "true" : "false");
    }
    const mc2 = document.getElementById("modalClose");
    if (mc2) mc2.onclick = close;
    (_b = document.getElementById("payBack")) == null ? void 0 : _b.addEventListener("click", close);
    (_c = document.getElementById("payDone")) == null ? void 0 : _c.addEventListener("click", async () => {
      var _a5, _b2, _c2;
      if (__orderSubmitBusy) return;
      if (shotBusy) {
        toast("\u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435, \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F");
        return;
      }
      __orderSubmitBusy = true;
      setSubmitDisabled(true);
      try {
        const urlRaw = ((urlInput == null ? void 0 : urlInput.value) || "").trim();
        let paymentScreenshot = "";
        if (shotDataUrl) {
          paymentScreenshot = shotDataUrl;
        } else if (urlRaw) {
          if (!/^https?:\/\//i.test(urlRaw)) {
            toast("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 URL \u0447\u0435\u043A\u0430");
            setSubmitDisabled(false);
            __orderSubmitBusy = false;
            return;
          }
          paymentScreenshot = urlRaw;
        } else {
          toast("\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0444\u0430\u0439\u043B \u0447\u0435\u043A\u0430 \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 URL");
          setSubmitDisabled(false);
          __orderSubmitBusy = false;
          return;
        }
        const toSpend = Number((bill == null ? void 0 : bill.redeem) || 0) | 0;
        let reserved = false;
        try {
          if (toSpend > 0) {
            await callLoyalty("reserveRedeem", {
              uid: getUID(),
              pts: toSpend,
              orderId,
              total: totalRaw,
              shortId: publicId
              // ← пробрасываем короткий ID (для логов/уведомлений)
            });
            reserved = true;
          }
        } catch (e) {
          toast("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0431\u0430\u043B\u043B\u043E\u0432");
          setSubmitDisabled(false);
          __orderSubmitBusy = false;
          return;
        }
        let createdId = null;
        try {
          const first = items[0];
          createdId = await addOrder({
            id: orderId,
            shortId: publicId,
            // ← короткий публичный ID
            cart: items.map((x) => ({
              id: x.product.id,
              title: x.product.title,
              price: x.product.price,
              qty: x.qty,
              size: x.size || null,
              color: x.color || null,
              images: x.product.images || []
            })),
            productId: ((_a5 = first == null ? void 0 : first.product) == null ? void 0 : _a5.id) || null,
            size: (first == null ? void 0 : first.size) || null,
            color: (first == null ? void 0 : first.color) || null,
            link: ((_b2 = first == null ? void 0 : first.product) == null ? void 0 : _b2.id) ? `#/product/${first.product.id}` : "",
            total: toPay,
            // к оплате с учётом списания
            currency: "UZS",
            address,
            phone,
            username: ((_c2 = state.user) == null ? void 0 : _c2.username) || "",
            userId: getUID(),
            payerFullName: payer || "",
            paymentScreenshot,
            status: "\u043D\u043E\u0432\u044B\u0439",
            accepted: false
          });
        } catch (e) {
          if (reserved) {
            try {
              await callLoyalty("finalizeRedeem", { uid: getUID(), orderId, action: "cancel" });
            } catch (e2) {
            }
          }
          toast("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043A\u0430\u0437. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.");
          setSubmitDisabled(false);
          __orderSubmitBusy = false;
          return;
        }
        try {
          if (toSpend > 0 && reserved) {
            await callLoyalty("finalizeRedeem", { uid: getUID(), orderId, action: "commit" });
          }
        } catch (e) {
          if (reserved) {
            try {
              await callLoyalty("finalizeRedeem", { uid: getUID(), orderId, action: "cancel" });
            } catch (e2) {
            }
          }
          toast("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0431\u0430\u043B\u043B\u044B \u2014 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437");
          setSubmitDisabled(false);
          __orderSubmitBusy = false;
          return;
        }
        state.cart.items = [];
        persistCart();
        updateCartBadge();
        close();
        showOrderConfirmationModal(publicId);
        clearDraftOrderId();
        clearDraftPublicId();
        try {
          sessionStorage.removeItem(KEY_REDEEM_DRAFT());
        } catch (e) {
        }
        try {
          const ev = new CustomEvent("client:orderPlaced", { detail: { id: orderId, shortId: publicId } });
          window.dispatchEvent(ev);
        } catch (e) {
        }
      } finally {
        setSubmitDisabled(false);
        __orderSubmitBusy = false;
      }
    });
    function close() {
      modal.classList.remove("show");
      delete document.body.dataset.checkoutModalOpen;
    }
  }
  function showOrderConfirmationModal(displayId) {
    var _a4, _b, _c;
    const modal = document.getElementById("modal");
    const mb = document.getElementById("modalBody");
    const mt = document.getElementById("modalTitle");
    const ma = document.getElementById("modalActions");
    mt.textContent = "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442";
    mb.innerHTML = `
    <style>
      .ok-hero{
        display:flex; align-items:center; gap:12px; padding:12px;
        border:1px solid var(--border, rgba(0,0,0,.12)); border-radius:14px;
        background:var(--card, #f8f8f8);
      }
      .ok-hero i{ width:28px; height:28px; }
      .ok-steps{ display:grid; gap:10px; margin-top:12px; }
      .ok-step{ display:grid; grid-template-columns: 28px 1fr; gap:10px; align-items:start; }
      .muted{ color:var(--muted,#6b7280); }
    </style>
    <div class="ok-hero">
      <i data-lucide="shield-check"></i>
      <div>
        <div class="cart-title">#${escapeHtml2(displayId)}</div>
        <div class="muted">\u0417\u0430\u043A\u0430\u0437 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u0440\u0438\u043D\u044F\u0442, \u0441\u043A\u043E\u0440\u043E \u0435\u0433\u043E \u0432\u043E\u0437\u044C\u043C\u0443\u0442 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443.</div>
      </div>
    </div>

    <div class="ok-steps">
      <div class="ok-step">
        <i data-lucide="clock"></i>
        <div>
          <div class="cart-title" style="font-size:15px">\u0421\u0440\u043E\u043A\u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438</div>
          <div class="muted">\u041E\u0440\u0438\u0435\u043D\u0442\u0438\u0440\u043E\u0432\u043E\u0447\u043D\u043E <b>14\u201316 \u0434\u043D\u0435\u0439</b>. \u0415\u0441\u043B\u0438 \u0441\u0440\u043E\u043A \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0441\u044F \u2014 \u043C\u044B \u0443\u0432\u0435\u0434\u043E\u043C\u0438\u043C.</div>
        </div>
      </div>
      <div class="ok-step">
        <i data-lucide="message-circle"></i>
        <div>
          <div class="cart-title" style="font-size:15px">\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043F\u043E \u0437\u0430\u043A\u0430\u0437\u0443</div>
          <div class="muted">\u0415\u0441\u043B\u0438 \u043F\u043E\u044F\u0432\u0438\u043B\u0438\u0441\u044C \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u2014 \u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0443. \u041C\u044B \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u043C \u043A\u0430\u043A \u043C\u043E\u0436\u043D\u043E \u0431\u044B\u0441\u0442\u0440\u0435\u0435.</div>
        </div>
      </div>
      <div class="ok-step">
        <i data-lucide="package"></i>
        <div>
          <div class="cart-title" style="font-size:15px">\u041A\u043E\u0433\u0434\u0430 \u0441\u0432\u044F\u0436\u0435\u043C\u0441\u044F</div>
          <div class="muted">\u041A\u0430\u043A \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043A\u0430\u0437 \u0431\u0443\u0434\u0435\u0442 \u0433\u043E\u0442\u043E\u0432 \u043A \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435, \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0441\u0432\u044F\u0436\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u044F \u0434\u0435\u0442\u0430\u043B\u0435\u0439.</div>
        </div>
      </div>
    </div>
  `;
    ma.innerHTML = `
    <button id="okOperator" class="pill">\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0443</button>
    <button id="okOrders" class="pill primary">\u041A \u043C\u043E\u0438\u043C \u0437\u0430\u043A\u0430\u0437\u0430\u043C</button>
  `;
    modal.classList.add("show");
    ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
    const mc3 = document.getElementById("modalClose");
    if (mc3) mc3.onclick = close;
    (_b = document.getElementById("okOrders")) == null ? void 0 : _b.addEventListener("click", () => {
      close();
      location.hash = "#/orders";
    });
    (_c = document.getElementById("okOperator")) == null ? void 0 : _c.addEventListener("click", () => {
      openExternal(OP_CHAT_URL);
    });
    function close() {
      modal.classList.remove("show");
    }
  }
  function openExternal(url) {
    var _a4;
    try {
      const tg2 = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp;
      if (tg2 == null ? void 0 : tg2.openTelegramLink) {
        tg2.openTelegramLink(url);
        return;
      }
      if (tg2 == null ? void 0 : tg2.openLink) {
        tg2.openLink(url, { try_instant_view: false });
        return;
      }
    } catch (e) {
    }
    window.open(url, "_blank", "noopener");
  }
  function compressImageToDataURL(file, maxW = 1600, maxH = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width: w, height: h } = img;
          const ratio = Math.min(1, maxW / w, maxH / h);
          const outW = Math.max(1, Math.round(w * ratio));
          const outH = Math.max(1, Math.round(h * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext("2d", { alpha: false });
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, outW, outH);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          URL.revokeObjectURL(url);
          resolve({ dataUrl, outW, outH });
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }
  function escapeHtml2(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
  function colorName(c = "") {
    const key2 = String(c).toLowerCase();
    const map = {
      "#000000": "\u0447\u0451\u0440\u043D\u044B\u0439",
      "black": "\u0447\u0451\u0440\u043D\u044B\u0439",
      "#ffffff": "\u0431\u0435\u043B\u044B\u0439",
      "white": "\u0431\u0435\u043B\u044B\u0439",
      // Синие/голубые
      "#1e3a8a": "\u0442\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439",
      "#3b82f6": "\u0441\u0438\u043D\u0438\u0439",
      "#60a5fa": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
      "#93c5fd": "\u0441\u0432\u0435\u0442\u043B\u043E-\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
      "#0ea5e9": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
      // Серые/графит
      "#6b7280": "\u0441\u0435\u0440\u044B\u0439",
      "#808080": "\u0441\u0435\u0440\u044B\u0439",
      "#111827": "\u0433\u0440\u0430\u0444\u0438\u0442",
      "#616161": "\u0441\u0435\u0440\u044B\u0439",
      // Красные/розовые/фиолетовые
      "#b91c1c": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
      "#ef4444": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
      "#f472b6": "\u0440\u043E\u0437\u043E\u0432\u044B\u0439",
      "#a855f7": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
      // Зелёные/хаки/олива
      "#16a34a": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      "#166534": "\u0442\u0451\u043C\u043D\u043E-\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      "#556b2f": "\u0445\u0430\u043A\u0438",
      "#4b5320": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439",
      "#1f5132": "\u0442\u0451\u043C\u043D\u043E-\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      // Коричневые/бежевые/песочные
      "#7b3f00": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "#8b5a2b": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "#6b4226": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "#b0a36f": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
      "#c8b796": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
      "#d1b892": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
      "#c19a6b": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
      "#a3a380": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439"
    };
    return map[key2] || (key2.startsWith("#") ? key2 : c);
  }

  // src/components/Favorites.js
  function renderFavorites() {
    var _a4, _b, _c, _d;
    const v2 = document.getElementById("view");
    const favIds = state.favorites;
    const list = state.products.filter((p) => favIds.has(String(p.id)));
    const header = `
    <div class="section-title" style="display:flex;align-items:center;gap:10px">
      <button class="square-btn" id="favBack"><i data-lucide="chevron-left"></i></button>
      \u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435
    </div>
  `;
    if (!list.length) {
      v2.innerHTML = `
      ${header}
      <section class="checkout">
        <div class="cart-sub">\u0421\u043F\u0438\u0441\u043E\u043A \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u043F\u0443\u0441\u0442</div>
      </section>
    `;
      ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
      (_b = document.getElementById("favBack")) == null ? void 0 : _b.addEventListener("click", () => history.back());
      return;
    }
    v2.innerHTML = `
    ${header}
    <div class="grid" id="productGrid"></div>
  `;
    drawProducts(list);
    ((_c = window.lucide) == null ? void 0 : _c.createIcons) && lucide.createIcons();
    (_d = document.getElementById("favBack")) == null ? void 0 : _d.addEventListener("click", () => history.back());
  }

  // src/components/Category.js
  function findCategoryBySlug3(slug) {
    for (const g of state.categories) {
      if (g.slug === slug) return g;
      for (const ch of g.children || []) {
        if (ch.slug === slug) return ch;
      }
    }
    return null;
  }
  function expandSlugs2(slug) {
    const c = findCategoryBySlug3(slug);
    if (!c) return [slug];
    if (c.children && c.children.length) return c.children.map((x) => x.slug);
    return [c.slug];
  }
  function categoryNameBySlug3(slug) {
    const c = findCategoryBySlug3(slug);
    return (c == null ? void 0 : c.name) || "";
  }
  function drawProducts2(list) {
    var _a4, _b, _c;
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const q = (state.filters.query || "").trim().toLowerCase();
    const filtered = list.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.subtitle || "").toLowerCase().includes(q)
    );
    const frag = document.createDocumentFragment();
    for (const p of filtered) {
      const t = document.getElementById("product-card");
      if (!t) continue;
      const node = t.content.firstElementChild.cloneNode(true);
      node.href = `#/product/${p.id}`;
      const im = node.querySelector("img");
      if (im) {
        im.src = ((_a4 = p.images) == null ? void 0 : _a4[0]) || "";
        im.alt = p.title;
      }
      (_b = node.querySelector(".title")) == null ? void 0 : _b.append(p.title);
      const subEl = node.querySelector(".subtitle");
      if (subEl) {
        const labelById = categoryNameBySlug3(p.categoryId) || "";
        subEl.textContent = p.categoryLabel || labelById;
      }
      const priceEl = node.querySelector(".price");
      if (priceEl) priceEl.textContent = priceFmt(p.price);
      const favBtn = node.querySelector(".fav");
      if (favBtn) {
        const active = isFav(p.id);
        favBtn.classList.toggle("active", active);
        favBtn.setAttribute("aria-pressed", String(active));
        favBtn.onclick = (ev) => {
          ev.preventDefault();
          toggleFav(p.id);
        };
      }
      frag.appendChild(node);
    }
    grid.appendChild(frag);
    ((_c = window.lucide) == null ? void 0 : _c.createIcons) && lucide.createIcons();
  }
  function renderCategory(params) {
    const slug = (params == null ? void 0 : params.slug) || "all";
    state.filters.category = slug;
    v.innerHTML = `
  <div class="section">
    <h2 style="margin:8px 12px">${categoryNameBySlug3(slug) || "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F"}</h2>
  </div>
  <div class="grid home-bottom-pad" id="productGrid"></div>
`;
    let list;
    if (slug === "all") {
      list = state.products;
    } else if (slug === "new") {
      list = state.products.slice(0, 24);
    } else {
      const pool = new Set(expandSlugs2(slug));
      list = state.products.filter((p) => pool.has(p.categoryId));
    }
    drawProducts2(list);
  }

  // src/components/Orders.js
  function getStatusLabel2(s) {
    try {
      return getStatusLabel(s);
    } catch (e) {
      return String(s || "\u2014");
    }
  }
  function getDisplayId(o) {
    var _a4;
    const sid = (o == null ? void 0 : o.shortId) || (o == null ? void 0 : o.code);
    if (sid) return String(sid).toUpperCase();
    const full = String((_a4 = o == null ? void 0 : o.id) != null ? _a4 : "");
    if (!full) return "";
    return full.slice(-6).toUpperCase();
  }
  function matchesAnyId(o, val) {
    const needleRaw = String(val || "").trim();
    if (!needleRaw) return false;
    const needle = needleRaw.toUpperCase();
    const idFull = String((o == null ? void 0 : o.id) || "");
    const short = String((o == null ? void 0 : o.shortId) || (o == null ? void 0 : o.code) || "").toUpperCase();
    if (idFull && idFull === needleRaw) return true;
    if (short && short === needle) return true;
    if (idFull) {
      const tail6 = idFull.slice(-6).toUpperCase();
      if (needle === tail6) return true;
    }
    return false;
  }
  async function renderOrders() {
    var _a4, _b, _c, _d, _e, _f, _g;
    const v2 = document.getElementById("view");
    const myUid = ((_a4 = getUID) == null ? void 0 : _a4()) || "";
    if (!myUid) {
      v2.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="ordersBack"><i data-lucide="chevron-left"></i></button>
        \u041C\u043E\u0438 \u0437\u0430\u043A\u0430\u0437\u044B
      </div>
      <section class="checkout">
        <div class="cart-sub">\u041F\u043E\u0445\u043E\u0436\u0435, \u0432\u044B \u043D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u044B.</div>
      </section>`;
      ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
      (_c = document.getElementById("ordersBack")) == null ? void 0 : _c.addEventListener("click", () => history.back());
      return;
    }
    let myOrders = [];
    try {
      const list = await getOrdersForUser(myUid);
      myOrders = Array.isArray(list) ? list.slice() : [];
    } catch (e) {
      myOrders = [];
    }
    if (!myOrders.length) {
      v2.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="ordersBack"><i data-lucide="chevron-left"></i></button>
        \u041C\u043E\u0438 \u0437\u0430\u043A\u0430\u0437\u044B
      </div>
      <section class="checkout">
        <div style="text-align:center;color:#999; padding:40px 0">
          <i data-lucide="package" style="width:60px;height:60px;opacity:.35"></i>
          <div style="font-weight:800; font-size:22px; margin-top:6px">\u0417\u0430\u043A\u0430\u0437\u043E\u0432 \u043D\u0435\u0442</div>
          <div class="cart-sub">\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u2014 \u0438 \u043E\u043D \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C</div>
        </div>
      </section>`;
      ((_d = window.lucide) == null ? void 0 : _d.createIcons) && lucide.createIcons();
      (_e = document.getElementById("ordersBack")) == null ? void 0 : _e.addEventListener("click", () => history.back());
      return;
    }
    myOrders.sort((a, b) => ((b == null ? void 0 : b.createdAt) || 0) - ((a == null ? void 0 : a.createdAt) || 0));
    const inProgress = myOrders.filter((o) => !["\u0432\u044B\u0434\u0430\u043D", "\u043E\u0442\u043C\u0435\u043D\u0451\u043D"].includes(o == null ? void 0 : o.status));
    const received = myOrders.filter((o) => (o == null ? void 0 : o.status) === "\u0432\u044B\u0434\u0430\u043D");
    const canceled = myOrders.filter((o) => (o == null ? void 0 : o.status) === "\u043E\u0442\u043C\u0435\u043D\u0451\u043D");
    v2.innerHTML = `
    <div class="section-title" style="display:flex;align-items:center;gap:10px">
      <button class="square-btn" id="ordersBack"><i data-lucide="chevron-left"></i></button>
      \u041C\u043E\u0438 \u0437\u0430\u043A\u0430\u0437\u044B
    </div>
    <section class="checkout orders-groups">
      ${groupBlock("\u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435", inProgress)}
      ${groupBlock("\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u044B", received)}
      ${groupBlock("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u044B", canceled)}
    </section>
  `;
    ((_f = window.lucide) == null ? void 0 : _f.createIcons) && lucide.createIcons();
    (_g = document.getElementById("ordersBack")) == null ? void 0 : _g.addEventListener("click", () => history.back());
  }
  function groupBlock(title, list) {
    const count = Array.isArray(list) ? list.length : 0;
    return `
    <div class="orders-group">
      <div class="subsection-title" style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 6px">
        <span>${title}</span>
        <span class="muted mini">${count}</span>
      </div>
      ${count ? list.map(orderCard).join("") : emptyRow(title)}
    </div>
  `;
  }
  function orderCard(o) {
    var _a4, _b, _c;
    const cover = ((_c = (_b = (_a4 = o == null ? void 0 : o.cart) == null ? void 0 : _a4[0]) == null ? void 0 : _b.images) == null ? void 0 : _c[0]) || "assets/placeholder.jpg";
    const displayId = getDisplayId(o);
    const link = `#/track/${encodeURIComponent(displayId)}`;
    let actionHtml = `<a class="pill" href="${link}">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a>`;
    if ((o == null ? void 0 : o.status) === "\u0432\u044B\u0434\u0430\u043D") {
      actionHtml = `
      <a class="pill" href="${link}" style="display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="check-circle"></i><span>\u0414\u0435\u0442\u0430\u043B\u0438</span>
      </a>`;
    } else if ((o == null ? void 0 : o.status) === "\u043E\u0442\u043C\u0435\u043D\u0451\u043D") {
      actionHtml = `
      <a class="pill outline" href="${link}" style="display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="x-circle"></i><span>\u0414\u0435\u0442\u0430\u043B\u0438</span>
      </a>`;
    }
    const subLines = [];
    subLines.push(getStatusLabel2(o == null ? void 0 : o.status));
    if ((o == null ? void 0 : o.status) === "\u043E\u0442\u043C\u0435\u043D\u0451\u043D" && (o == null ? void 0 : o.cancelReason)) {
      subLines.push(`\u041F\u0440\u0438\u0447\u0438\u043D\u0430: ${escapeHtml3(o.cancelReason)}`);
    }
    return `
    <div class="order-row">
      <div class="cart-img"><img src="${cover}" alt=""></div>
      <div>
        <div class="cart-title">${"\u0417\u0430\u043A\u0430\u0437 #" + escapeHtml3(displayId)}</div>
        <div class="cart-sub" style="overflow-wrap:anywhere">${subLines.map(escapeHtml3).join(" \xB7 ")}</div>
        <div class="cart-price">${priceFmt(Number((o == null ? void 0 : o.total) || 0))}</div>
      </div>
      ${actionHtml}
    </div>
  `;
  }
  async function renderTrack({ id }) {
    var _a4, _b, _c, _d, _e;
    const v2 = document.getElementById("view");
    const myUid = ((_a4 = getUID) == null ? void 0 : _a4()) || "";
    let list = [];
    try {
      const l = await getOrdersForUser(myUid);
      list = Array.isArray(l) ? l : [];
    } catch (e) {
      list = [];
    }
    const o = list.find((x) => matchesAnyId(x, id));
    if (!o) {
      v2.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="trackBackNF"><i data-lucide="chevron-left"></i></button>
        \u0422\u0440\u0435\u043A\u0438\u043D\u0433
      </div>
      <section class="checkout">\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E</section>
    `;
      ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
      (_c = document.getElementById("trackBackNF")) == null ? void 0 : _c.addEventListener("click", () => history.back());
      return;
    }
    const stepsKeys = [
      "\u043D\u043E\u0432\u044B\u0439",
      "\u043F\u0440\u0438\u043D\u044F\u0442",
      "\u0441\u043E\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u0432 \u043A\u0438\u0442\u0430\u0435",
      "\u0432\u044B\u043B\u0435\u0442\u0435\u043B \u0432 \u0443\u0437\u0431",
      "\u043D\u0430 \u0442\u0430\u043C\u043E\u0436\u043D\u0435",
      "\u043D\u0430 \u043F\u043E\u0447\u0442\u0435",
      "\u0437\u0430\u0431\u0440\u0430\u043D \u0441 \u043F\u043E\u0447\u0442\u044B",
      "\u0432\u044B\u0434\u0430\u043D"
    ];
    const steps = stepsKeys.map((k6) => ({ key: k6, label: getStatusLabel2(k6) }));
    const curIdx = Math.max(steps.findIndex((s) => s.key === o.status), 0);
    const progress = Math.max(0, Math.min(100, Math.round(curIdx * 100 / Math.max(1, steps.length - 1))));
    const itemsHtml = itemsBlock(o);
    const displayId = getDisplayId(o);
    v2.innerHTML = `
    <style>
      .order-detail-page{overflow-x:hidden; max-width:100%;}
      .order-detail-page *{box-sizing:border-box;}

      .track-head{
        display:grid;
        grid-template-columns: 1fr auto;
        align-items:center;
        gap:8px;
      }
      .track-status{font-weight:800;text-align:right}
      @media (max-width: 480px){
        .track-head{grid-template-columns: 1fr; gap:4px;}
        .track-status{text-align:left}
      }

      .progress-bar{
        width:100%; overflow:hidden; border-radius:999px;
        height:8px; background:var(--border, rgba(0,0,0,.08));
      }
      .progress-bar b{
        display:block; height:100%; background:var(--primary,#111);
        transition:width .25s ease;
      }
      .progress-list{display:grid; gap:8px}
      .progress-item{display:flex; align-items:center; gap:8px; min-width:0}
      .progress-label{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%}

      /* \u0441\u043F\u0438\u0441\u043E\u043A \u043F\u043E\u0437\u0438\u0446\u0438\u0439 */
      .order-item{
        display:grid;
        grid-template-columns: 56px minmax(0,1fr) auto;
        gap:10px;
        align-items:center;
        margin-top:10px;
        width:100%;
      }
      .order-item .cart-img img{width:56px;height:56px;object-fit:cover;border-radius:10px}
      .order-item__meta .cart-title{word-break:break-word; overflow-wrap:anywhere}
      .order-item__meta .cart-sub{color:var(--muted); font-size:.92rem; overflow-wrap:anywhere; display:flex; align-items:center; gap:6px; flex-wrap:wrap}
      .order-item__qty-inline{white-space:nowrap; color:var(--muted)}
      .order-item__sum{justify-self:end; font-weight:700; padding-left:8px; white-space:nowrap}

      @media (max-width: 420px){
        .order-item{ grid-template-columns: 56px minmax(0,1fr) auto; }
      }

      .kv{display:block; width:100%;}
      .kv__row{display:grid; grid-template-columns:minmax(80px, 40%) minmax(0,1fr); gap:10px; align-items:start; margin:6px 0}
      .kv__row dt{color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
      .kv__row dd{margin:0; word-break:break-word; overflow-wrap:anywhere}

      .subsection-title{font-weight:700;margin:10px 0 6px}
      .pill, .btn{max-width:100%; white-space:nowrap; text-overflow:ellipsis; overflow:hidden}

      /* \u041A\u043D\u043E\u043F\u043A\u0430 "\u041D\u0430\u0437\u0430\u0434 \u043A \u0437\u0430\u043A\u0430\u0437\u0430\u043C": \u043F\u043E \u0446\u0435\u043D\u0442\u0440\u0443 + \u0441\u0442\u0440\u0435\u043B\u043A\u0430 */
      .back-wrap{
        margin-top:12px;
        display:flex;
        justify-content:center;
        align-items:center;
        width:100%;
      }
      .back-btn{
        display:inline-flex;
        align-items:center;
        gap:8px;
      }
    </style>

    <div class="section-title" style="display:flex;align-items:center;gap:10px">
      <button class="square-btn" id="trackBack"><i data-lucide="chevron-left"></i></button>
      \u0417\u0430\u043A\u0430\u0437 #${escapeHtml3(displayId)}
    </div>
    <section class="checkout order-detail-page">
      <div class="track-head">
        <div class="track-caption">\u042D\u0442\u0430\u043F ${Math.min(curIdx + 1, steps.length)} \u0438\u0437 ${steps.length}</div>
        <div class="track-status">${escapeHtml3(getStatusLabel2(o.status))}</div>
      </div>

      ${o.status !== "\u043E\u0442\u043C\u0435\u043D\u0451\u043D" ? `
        <div class="progress-bar" aria-label="\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u0437\u0430\u043A\u0430\u0437\u0430"><b style="width:${progress}%"></b></div>

        <div class="progress-list" style="margin-top:12px" role="list">
          ${steps.map((s, i) => `
            <div class="progress-item ${i < curIdx ? "is-done" : ""} ${i === curIdx ? "is-current" : ""}" role="listitem" aria-current="${i === curIdx ? "step" : "false"}">
              <span class="progress-dot" aria-hidden="true"></span>
              <span class="progress-label">${s.label}</span>
            </div>
          `).join("")}
        </div>
      ` : `
        <div class="note" style="grid-template-columns:auto 1fr">
          <i data-lucide="x-circle"></i>
          <div>
            <div class="note-title">\u0417\u0430\u043A\u0430\u0437 \u043E\u0442\u043C\u0435\u043D\u0451\u043D</div>
            ${o.cancelReason ? `<div class="note-sub">\u041F\u0440\u0438\u0447\u0438\u043D\u0430: ${escapeHtml3(o.cancelReason)}</div>` : ""}
          </div>
        </div>
      `}

      ${itemsHtml}

      <div class="kv" style="margin-top:12px">
        <div class="kv__row">
          <dt>\u0410\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438</dt>
          <dd class="break">${escapeHtml3(o.address || "\u2014")}</dd>
        </div>
        <div class="kv__row">
          <dt>\u0422\u0435\u043B\u0435\u0444\u043E\u043D</dt>
          <dd>${escapeHtml3(o.phone || "\u2014")}</dd>
        </div>
        <div class="kv__row">
          <dt>\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A</dt>
          <dd class="break">${escapeHtml3(o.payerFullName || "\u2014")}</dd>
        </div>
      </div>

      <div class="back-wrap">
        <a class="pill primary back-btn" href="#/orders" aria-label="\u041D\u0430\u0437\u0430\u0434 \u043A \u0437\u0430\u043A\u0430\u0437\u0430\u043C">
          <i data-lucide="arrow-left"></i><span>\u041D\u0430\u0437\u0430\u0434 \u043A \u0437\u0430\u043A\u0430\u0437\u0430\u043C</span>
        </a>
      </div>
    </section>`;
    ((_d = window.lucide) == null ? void 0 : _d.createIcons) && lucide.createIcons();
    (_e = document.getElementById("trackBack")) == null ? void 0 : _e.addEventListener("click", () => history.back());
  }
  function itemsBlock(o) {
    const items = Array.isArray(o == null ? void 0 : o.cart) ? o.cart : [];
    if (!items.length) {
      return `<div class="muted" style="margin-top:12px">\u0412 \u0437\u0430\u043A\u0430\u0437\u0435 \u043D\u0435\u0442 \u043F\u043E\u0437\u0438\u0446\u0438\u0439</div>`;
    }
    const rows = items.map((x) => {
      var _a4;
      const cover = ((_a4 = x == null ? void 0 : x.images) == null ? void 0 : _a4[0]) || "assets/placeholder.jpg";
      const colorLabel2 = (x == null ? void 0 : x.color) ? `\u0426\u0432\u0435\u0442: ${escapeHtml3(colorNameFromValue(String(x.color)))}` : "";
      const opts = [
        (x == null ? void 0 : x.size) ? `\u0420\u0430\u0437\u043C\u0435\u0440: ${escapeHtml3(x.size)}` : "",
        colorLabel2
      ].filter(Boolean).join(" \xB7 ");
      const qty = `\xD7${escapeHtml3(String((x == null ? void 0 : x.qty) || 0))}`;
      const line = Number((x == null ? void 0 : x.qty) || 0) * Number((x == null ? void 0 : x.price) || 0);
      return `
      <div class="order-item">
        <div class="cart-img"><img src="${cover}" alt=""></div>
        <div class="order-item__meta">
          <div class="cart-title">${escapeHtml3((x == null ? void 0 : x.title) || "\u0422\u043E\u0432\u0430\u0440")}</div>
          <div class="cart-sub">
            ${opts ? `<span>${opts}</span>` : ""}
            <span class="order-item__qty-inline">${qty}</span>
          </div>
        </div>
        <div class="order-item__sum">${priceFmt(line)}</div>
      </div>
    `;
    }).join("");
    return `
    <div class="subsection-title" style="margin-top:12px">\u0421\u043E\u0441\u0442\u0430\u0432 \u0437\u0430\u043A\u0430\u0437\u0430</div>
    ${rows}
    <div style="display:flex;justify-content:flex-end;margin-top:6px">
      <div style="text-align:right"><b>\u0418\u0442\u043E\u0433\u043E: ${priceFmt(Number((o == null ? void 0 : o.total) || 0))}</b></div>
    </div>
  `;
  }
  function emptyRow(title) {
    let hint = "\u041D\u0435\u0442 \u0437\u0430\u043A\u0430\u0437\u043E\u0432";
    if (title === "\u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435") hint = "\u0421\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u043A\u0430\u0437\u043E\u0432";
    if (title === "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u044B") hint = "\u0412\u044B \u0435\u0449\u0451 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0438";
    if (title === "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u044B") hint = "\u041E\u0442\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0445 \u0437\u0430\u043A\u0430\u0437\u043E\u0432 \u043D\u0435\u0442";
    return `<div class="orders-empty" style="color:#999; padding:8px 0 16px">${hint}</div>`;
  }
  function escapeHtml3(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
  function colorNameFromValue(raw) {
    if (!raw) return "";
    const v2 = String(raw).trim().toLowerCase();
    const dict = {
      // base
      "black": "\u0447\u0451\u0440\u043D\u044B\u0439",
      "white": "\u0431\u0435\u043B\u044B\u0439",
      "red": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
      "green": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      "blue": "\u0441\u0438\u043D\u0438\u0439",
      "yellow": "\u0436\u0451\u043B\u0442\u044B\u0439",
      "orange": "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439",
      "purple": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
      "violet": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
      "pink": "\u0440\u043E\u0437\u043E\u0432\u044B\u0439",
      "brown": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "gray": "\u0441\u0435\u0440\u044B\u0439",
      "grey": "\u0441\u0435\u0440\u044B\u0439",
      "beige": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
      "gold": "\u0437\u043E\u043B\u043E\u0442\u043E\u0439",
      "silver": "\u0441\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044B\u0439",
      "navy": "\u0442\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439",
      "teal": "\u0431\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439",
      "turquoise": "\u0431\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439",
      "maroon": "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439",
      "burgundy": "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439",
      "olive": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439",
      "lime": "\u043B\u0430\u0439\u043C\u043E\u0432\u044B\u0439",
      "cyan": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
      "magenta": "\u043F\u0443\u0440\u043F\u0443\u0440\u043D\u044B\u0439",
      "tan": "\u0441\u0432\u0435\u0442\u043B\u043E-\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "ivory": "\u0441\u043B\u043E\u043D\u043E\u0432\u0430\u044F \u043A\u043E\u0441\u0442\u044C",
      "cream": "\u043A\u0440\u0435\u043C\u043E\u0432\u044B\u0439",
      "khaki": "\u0445\u0430\u043A\u0438",
      "mustard": "\u0433\u043E\u0440\u0447\u0438\u0447\u043D\u044B\u0439",
      "lavender": "\u043B\u0430\u0432\u0430\u043D\u0434\u043E\u0432\u044B\u0439",
      "mint": "\u043C\u044F\u0442\u043D\u044B\u0439",
      "peach": "\u043F\u0435\u0440\u0441\u0438\u043A\u043E\u0432\u044B\u0439",
      "coral": "\u043A\u043E\u0440\u0430\u043B\u043B\u043E\u0432\u044B\u0439",
      // ru duplicates
      "\u0447\u0435\u0440\u043D\u044B\u0439": "\u0447\u0451\u0440\u043D\u044B\u0439",
      "\u0447\u0451\u0440\u043D\u044B\u0439": "\u0447\u0451\u0440\u043D\u044B\u0439",
      "\u0431\u0435\u043B\u044B\u0439": "\u0431\u0435\u043B\u044B\u0439",
      "\u043A\u0440\u0430\u0441\u043D\u044B\u0439": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
      "\u0437\u0435\u043B\u0451\u043D\u044B\u0439": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      "\u0437\u0435\u043B\u0435\u043D\u044B\u0439": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      "\u0441\u0438\u043D\u0438\u0439": "\u0441\u0438\u043D\u0438\u0439",
      "\u0433\u043E\u043B\u0443\u0431\u043E\u0439": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
      "\u0436\u0451\u043B\u0442\u044B\u0439": "\u0436\u0451\u043B\u0442\u044B\u0439",
      "\u0436\u0435\u043B\u0442\u044B\u0439": "\u0436\u0451\u043B\u0442\u044B\u0439",
      "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439": "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439",
      "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
      "\u0440\u043E\u0437\u043E\u0432\u044B\u0439": "\u0440\u043E\u0437\u043E\u0432\u044B\u0439",
      "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "\u0441\u0435\u0440\u044B\u0439": "\u0441\u0435\u0440\u044B\u0439",
      "\u0431\u0435\u0436\u0435\u0432\u044B\u0439": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
      "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439": "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439",
      "\u0441\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044B\u0439": "\u0441\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044B\u0439",
      "\u0437\u043E\u043B\u043E\u0442\u043E\u0439": "\u0437\u043E\u043B\u043E\u0442\u043E\u0439",
      "\u0445\u0430\u043A\u0438": "\u0445\u0430\u043A\u0438",
      "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439"
    };
    if (dict[v2]) return dict[v2];
    const short = {
      "bk": "\u0447\u0451\u0440\u043D\u044B\u0439",
      "bl": "\u0441\u0438\u043D\u0438\u0439",
      "blu": "\u0441\u0438\u043D\u0438\u0439",
      "blk": "\u0447\u0451\u0440\u043D\u044B\u0439",
      "wht": "\u0431\u0435\u043B\u044B\u0439",
      "wh": "\u0431\u0435\u043B\u044B\u0439",
      "gr": "\u0441\u0435\u0440\u044B\u0439",
      "gry": "\u0441\u0435\u0440\u044B\u0439",
      "gy": "\u0441\u0435\u0440\u044B\u0439",
      "rd": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
      "gn": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      "grn": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
      "yl": "\u0436\u0451\u043B\u0442\u044B\u0439",
      "ylw": "\u0436\u0451\u043B\u0442\u044B\u0439",
      "org": "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439",
      "pur": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
      "prp": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
      "pnk": "\u0440\u043E\u0437\u043E\u0432\u044B\u0439",
      "brn": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "br": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
      "be": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
      "nv": "\u0442\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439"
    };
    if (short[v2]) return short[v2];
    const hex = normalizeHex(v2);
    if (hex) {
      const name = hexToRuName(hex);
      if (name) return name;
    }
    if (v2.startsWith("rgb")) {
      const hexFromRgb = rgbToHex(v2);
      if (hexFromRgb) {
        const name = hexToRuName(hexFromRgb);
        if (name) return name;
      }
    }
    if (v2.includes("/") || v2.includes("-")) {
      const parts = v2.split(/[/\-]/).map((s) => s.trim()).filter(Boolean);
      const mapped = parts.map((p) => colorNameFromValue(p));
      if (mapped.length) return mapped.join(" / ");
    }
    return v2.startsWith("#") ? v2.toUpperCase() : v2;
  }
  function normalizeHex(v2) {
    const m = v2.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return "";
    let h = m[1].toLowerCase();
    if (h.length === 3) {
      h = h.split("").map((c) => c + c).join("");
    }
    return "#" + h;
  }
  var HEX_MAP = [
    ["#000000", "\u0447\u0451\u0440\u043D\u044B\u0439"],
    ["#ffffff", "\u0431\u0435\u043B\u044B\u0439"],
    ["#ff0000", "\u043A\u0440\u0430\u0441\u043D\u044B\u0439"],
    ["#00ff00", "\u0437\u0435\u043B\u0451\u043D\u044B\u0439"],
    ["#0000ff", "\u0441\u0438\u043D\u0438\u0439"],
    ["#ffff00", "\u0436\u0451\u043B\u0442\u044B\u0439"],
    ["#ffa500", "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439"],
    ["#800080", "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439"],
    ["#ffc0cb", "\u0440\u043E\u0437\u043E\u0432\u044B\u0439"],
    ["#8b4513", "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439"],
    ["#808080", "\u0441\u0435\u0440\u044B\u0439"],
    ["#c0c0c0", "\u0441\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044B\u0439"],
    ["#ffd700", "\u0437\u043E\u043B\u043E\u0442\u043E\u0439"],
    ["#000080", "\u0442\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439"],
    ["#00ffff", "\u0433\u043E\u043B\u0443\u0431\u043E\u0439"],
    ["#800000", "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439"],
    ["#556b2f", "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439"],
    ["#f5f5dc", "\u0431\u0435\u0436\u0435\u0432\u044B\u0439"],
    ["#e6e6fa", "\u043B\u0430\u0432\u0430\u043D\u0434\u043E\u0432\u044B\u0439"],
    ["#98ff98", "\u043C\u044F\u0442\u043D\u044B\u0439"],
    ["#ffdab9", "\u043F\u0435\u0440\u0441\u0438\u043A\u043E\u0432\u044B\u0439"],
    ["#ff7f50", "\u043A\u043E\u0440\u0430\u043B\u043B\u043E\u0432\u044B\u0439"],
    ["#bdb76b", "\u0445\u0430\u043A\u0438"]
  ];
  function hexToRuName(hex) {
    const exact = HEX_MAP.find(([h]) => h === hex.toLowerCase());
    if (exact) return exact[1];
    const [r, g, b] = hexToRGB(hex);
    let best = { dist: Infinity, name: "" };
    for (const [h, name] of HEX_MAP) {
      const [R, G, B] = hexToRGB(h);
      const d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2;
      if (d < best.dist) {
        best = { dist: d, name };
      }
    }
    return best.name;
  }
  function hexToRGB(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [r, g, b];
  }
  function rgbToHex(rgbStr) {
    const m = rgbStr.replace(/\s+/g, "").match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,([01]?\.?\d*))?\)$/i);
    if (!m) return "";
    const r = clamp255(+m[1]);
    const g = clamp255(+m[2]);
    const b = clamp255(+m[3]);
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  function clamp255(n) {
    return Math.max(0, Math.min(255, n | 0));
  }

  // src/core/modal.js
  function openModal({ title = "", body = "", actions = [], onOpen }) {
    const m = el("#modal");
    el("#modalTitle").textContent = title;
    el("#modalBody").innerHTML = body;
    const act = el("#modalActions");
    act.innerHTML = "";
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "pill";
      b.textContent = a.label;
      if (a.variant === "primary") {
        b.classList.add("primary");
      }
      b.onclick = () => {
        a.onClick && a.onClick();
      };
      act.appendChild(b);
    });
    m.classList.add("show");
    m.setAttribute("aria-hidden", "false");
    el("#modalClose").onclick = () => closeModal();
    onOpen && onOpen();
  }
  function closeModal() {
    const m = document.getElementById("modal");
    if (!m) return;
    m.classList.remove("show");
    m.setAttribute("aria-hidden", "true");
  }

  // src/components/Filters.js
  var COLOR_MAP = {
    "#000000": "\u0447\u0451\u0440\u043D\u044B\u0439",
    black: "\u0447\u0451\u0440\u043D\u044B\u0439",
    "#ffffff": "\u0431\u0435\u043B\u044B\u0439",
    white: "\u0431\u0435\u043B\u044B\u0439",
    // синие
    "#1e3a8a": "\u0442\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439",
    "#3b82f6": "\u0441\u0438\u043D\u0438\u0439",
    "#60a5fa": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
    "#93c5fd": "\u0441\u0432\u0435\u0442\u043B\u043E-\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
    "#0ea5e9": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
    // серые/графит
    "#6b7280": "\u0441\u0435\u0440\u044B\u0439",
    "#808080": "\u0441\u0435\u0440\u044B\u0439",
    "#111827": "\u0433\u0440\u0430\u0444\u0438\u0442",
    "#616161": "\u0441\u0435\u0440\u044B\u0439",
    // красные/розовые/фиолетовые
    "#b91c1c": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
    "#ef4444": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
    "#f472b6": "\u0440\u043E\u0437\u043E\u0432\u044B\u0439",
    "#a855f7": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
    // зелёные/хаки/олива
    "#16a34a": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
    "#166534": "\u0442\u0451\u043C\u043D\u043E-\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
    "#556b2f": "\u0445\u0430\u043A\u0438",
    "#4b5320": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439",
    "#1f5132": "\u0442\u0451\u043C\u043D\u043E-\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
    // коричневые/бежевые/песочные
    "#7b3f00": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
    "#8b5a2b": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
    "#6b4226": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
    "#b0a36f": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
    "#c8b796": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
    "#d1b892": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
    "#c19a6b": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
    "#a3a380": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439"
  };
  function colorLabel(c = "") {
    const k6 = String(c).toLowerCase();
    return COLOR_MAP[k6] || (k6 === "" ? "" : k6.replace(/^#/, ""));
  }
  function openFilterModal(router2) {
    const allSizes = Array.from(new Set(state.products.flatMap((p) => p.sizes || [])));
    const allColorsRaw = Array.from(new Set(state.products.flatMap((p) => p.colors || [])));
    const allColors = allColorsRaw.map((v2) => ({ value: v2, label: colorLabel(v2) }));
    const allMaterials = Array.from(new Set(state.products.map((p) => p.material).filter(Boolean)));
    const chipGroup = (items, selected, key2) => items.map((v2) => {
      const val = typeof v2 === "object" ? v2.value : v2;
      const label = typeof v2 === "object" ? v2.label : v2;
      return `<button class="chip ${selected.includes(val) ? "active" : ""}" data-${key2}="${val}">${label}</button>`;
    }).join("");
    openModal({
      title: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
      body: `
      <div class="h2">\u0420\u0430\u0437\u043C\u0435\u0440</div>
      <div class="chipbar" id="fSizes">${chipGroup(allSizes, state.filters.size, "size")}</div>

      <div class="h2">\u0426\u0432\u0435\u0442</div>
      <div class="chipbar" id="fColors">${chipGroup(allColors, state.filters.colors, "color")}</div>

      <div class="h2">\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B</div>
      <div class="chipbar" id="fMaterials">${chipGroup(allMaterials, state.filters.materials, "mat")}</div>

      <div class="chipbar" style="margin-top:8px">
        <label class="chip"><input id="fStock" type="checkbox" ${state.filters.inStock ? "checked" : ""} style="margin-right:8px"> \u0422\u043E\u043B\u044C\u043A\u043E \u0432 \u043D\u0430\u043B\u0438\u0447\u0438\u0438</label>
        <button id="clearBtn" class="chip">\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C</button>
      </div>`,
      actions: [
        { label: "\u041E\u0442\u043C\u0435\u043D\u0430", variant: "secondary", onClick: closeModal },
        { label: "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C", onClick: () => {
          state.filters.inStock = el("#fStock").checked;
          const pick = (sel, attr) => Array.from(el(sel).querySelectorAll(".chip.active")).map((b) => b.getAttribute(attr));
          state.filters.size = pick("#fSizes", "data-size");
          state.filters.colors = pick("#fColors", "data-color");
          state.filters.materials = pick("#fMaterials", "data-mat");
          closeModal();
          router2();
          renderActiveFilterChips();
        } }
      ],
      onOpen: () => {
        ["#fSizes", "#fColors", "#fMaterials"].forEach((s) => {
          el(s).addEventListener("click", (e) => {
            const btn = e.target.closest(".chip");
            if (!btn) return;
            btn.classList.toggle("active");
          });
        });
        el("#clearBtn").onclick = () => {
          state.filters = __spreadProps(__spreadValues({}, state.filters), { size: [], colors: [], materials: [], minPrice: null, maxPrice: null, inStock: false });
          closeModal();
          router2();
          renderActiveFilterChips();
        };
      }
    });
  }
  function renderActiveFilterChips() {
    const bar = el("#activeFilters");
    if (!bar) return;
    bar.innerHTML = "";
    const addChip = (label) => {
      const tNode = document.getElementById("filter-chip");
      const n = tNode.content.firstElementChild.cloneNode(true);
      n.textContent = label;
      n.classList.add("active");
      bar.appendChild(n);
    };
    if (state.filters.size.length) addChip("\u0420\u0430\u0437\u043C\u0435\u0440: " + state.filters.size.join(", "));
    if (state.filters.colors.length) addChip("\u0426\u0432\u0435\u0442: " + state.filters.colors.map(colorLabel).join(", "));
    if (state.filters.materials.length) addChip("\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B: " + state.filters.materials.join(", "));
  }

  // src/core/auth.js
  var KEY_UNLOCK = "nas_admin_unlock";
  var ADMIN_IDS = [
    5422089180,
    6448300416
  ];
  var ADMIN_USERNAMES = [
    "dcoredanil",
    "evliseorder"
  ];
  var PASSCODE = "234234123123";
  var PASSCODE_TTL_DAYS = 7;
  function now() {
    return Date.now();
  }
  function days(n) {
    return n * 24 * 60 * 60 * 1e3;
  }
  function getTgUser() {
    var _a4, _b, _c;
    try {
      return ((_c = (_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initDataUnsafe) == null ? void 0 : _c.user) || null;
    } catch (e) {
      return null;
    }
  }
  function isAdminByTelegram() {
    try {
      const u = getTgUser();
      if (!u) return false;
      if (ADMIN_IDS.includes(Number(u.id))) return true;
      if (u.username) {
        const list = ADMIN_USERNAMES.map((x) => String(x).toLowerCase());
        if (list.includes(String(u.username).toLowerCase())) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
  function adminUnlocked() {
    try {
      const raw = localStorage.getItem(KEY_UNLOCK);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!(data == null ? void 0 : data.ok) || !(data == null ? void 0 : data.exp)) return false;
      if (Number(data.exp) < now()) {
        localStorage.removeItem(KEY_UNLOCK);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  function canAccessAdmin() {
    return isAdminByTelegram() || adminUnlocked();
  }
  function unlockAdminWithPasscode(code) {
    if (!code) return false;
    if (String(code) !== String(PASSCODE)) return false;
    const exp = now() + days(PASSCODE_TTL_DAYS);
    localStorage.setItem(KEY_UNLOCK, JSON.stringify({ ok: true, exp }));
    window.dispatchEvent(new CustomEvent("auth:updated"));
    return true;
  }
  function tryUnlockFromStartParam() {
    var _a4, _b, _c;
    try {
      const sp = String(((_c = (_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initDataUnsafe) == null ? void 0 : _c.start_param) || "").trim().toLowerCase();
      const ALLOW_AUTO_UNLOCK = true;
      if (!ALLOW_AUTO_UNLOCK) return false;
      if (sp === "admin") {
        return unlockAdminWithPasscode(PASSCODE);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // src/components/Account.js
  var OP_CHAT_URL2 = "https://t.me/evliseorder";
  var DEFAULT_AVATAR = "assets/user-default.png";
  function k4(base) {
    var _a4;
    try {
      const uid = ((_a4 = getUID) == null ? void 0 : _a4()) || "guest";
      return `${base}__${uid}`;
    } catch (e) {
      return `${base}__guest`;
    }
  }
  var POINTS_MATURITY_MS2 = 24 * 60 * 60 * 1e3;
  function readRefProfile() {
    try {
      return JSON.parse(localStorage.getItem(k4("ref_profile")) || "{}");
    } catch (e) {
      return {};
    }
  }
  function getReferralLink() {
    return makeReferralLink();
  }
  function readMyReferrals() {
    try {
      const raw = localStorage.getItem(k4("my_referrals")) || "[]";
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  async function fetchTgAvatarUrl(uid) {
    const url = `/.netlify/functions/user-avatar?uid=${encodeURIComponent(uid)}`;
    const r = await fetch(url, { method: "GET" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j == null ? void 0 : j.ok) === false) throw new Error("avatar fetch failed");
    return String((j == null ? void 0 : j.url) || "");
  }
  function cacheAvatar(url) {
    try {
      localStorage.setItem(k4("tg_avatar_url"), url || "");
    } catch (e) {
    }
  }
  function readCachedAvatar() {
    try {
      return localStorage.getItem(k4("tg_avatar_url")) || "";
    } catch (e) {
      return "";
    }
  }
  function getTelegramUserId(u) {
    var _a4, _b, _c, _d, _e;
    return String(
      (_e = (_d = (_c = (_b = (_a4 = u == null ? void 0 : u.id) != null ? _a4 : u == null ? void 0 : u.tg_id) != null ? _b : u == null ? void 0 : u.tgId) != null ? _c : u == null ? void 0 : u.chatId) != null ? _d : u == null ? void 0 : u.uid) != null ? _e : ""
    ).trim();
  }
  async function loadTgAvatar() {
    var _a4;
    const u = ((_a4 = state) == null ? void 0 : _a4.user) || null;
    const uid = getTelegramUserId(u);
    const box = document.getElementById("avatarBox");
    const img = document.getElementById("tgAvatar");
    if (!img) return;
    if (!img.getAttribute("src")) {
      img.src = DEFAULT_AVATAR;
    }
    if (!img._evliseErrorBound) {
      img._evliseErrorBound = true;
      img.addEventListener("error", () => {
        if (img.src !== location.origin + "/" + DEFAULT_AVATAR && !img.src.endsWith(DEFAULT_AVATAR)) {
          img.src = DEFAULT_AVATAR;
        }
        box == null ? void 0 : box.classList.add("has-img");
      });
    }
    if (!uid) {
      img.src = DEFAULT_AVATAR;
      box == null ? void 0 : box.classList.add("has-img");
      return;
    }
    const cached = readCachedAvatar();
    if (cached) {
      img.src = cached;
      box == null ? void 0 : box.classList.add("has-img");
    } else {
      img.src = DEFAULT_AVATAR;
      box == null ? void 0 : box.classList.add("has-img");
    }
    try {
      const fresh = await fetchTgAvatarUrl(uid);
      if (fresh) {
        if (fresh !== cached) {
          cacheAvatar(fresh);
        }
        img.src = fresh;
        box == null ? void 0 : box.classList.add("has-img");
      } else {
        cacheAvatar("");
        img.src = DEFAULT_AVATAR;
        box == null ? void 0 : box.classList.add("has-img");
      }
    } catch (e) {
      img.src = DEFAULT_AVATAR;
      box == null ? void 0 : box.classList.add("has-img");
    }
  }
  function renderAccount() {
    var _a4, _b, _c, _d;
    try {
      (_a4 = document.querySelector(".app-header")) == null ? void 0 : _a4.classList.remove("hidden");
      const fix = document.getElementById("productFixHdr");
      if (fix) {
        fix.classList.remove("show");
        fix.setAttribute("aria-hidden", "true");
      }
    } catch (e) {
    }
    (_b = window.setTabbarMenu) == null ? void 0 : _b.call(window, "account");
    const v2 = document.getElementById("view");
    const u = state.user;
    const isAdmin = canAccessAdmin();
    const ref = readRefProfile();
    const hasBoost = !!ref.firstOrderBoost && !ref.firstOrderDone;
    v2.innerHTML = `
    <section class="section" style="padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));">
      <div class="section-title">\u041B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442</div>

      <style>
        .account-card{
          display:flex; gap:12px; align-items:center;
          padding:12px; border:1px solid var(--border,rgba(0,0,0,.1));
          border-radius:12px; background:var(--card,rgba(0,0,0,.03));
        }
        .avatar{
          width:56px; height:56px; border-radius:50%;
          display:grid; place-items:center;
          overflow:hidden; user-select:none;
          background:#111827;
        }
        .avatar img{ display:block; width:100%; height:100%; object-fit:cover; }
        .avatar.has-img{ background:transparent; }
        .info .name{ font-weight:800; font-size:16px; }
        .muted{ color:var(--muted,#6b7280); }
        .muted.mini{ font-size:.9rem; }

        /* ======= \u0411\u0430\u043B\u043B\u044B (\u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D\u043D\u044B\u0439 \u0441\u0442\u0438\u043B\u044C, \u0411\u0415\u0417 \u0433\u0440\u0430\u0434\u0438\u0435\u043D\u0442\u0430) ======= */
        .points-card{
          position:relative; overflow:hidden;
          margin:12px 0 8px; padding:14px;
          border-radius:14px;
          background: var(--card, rgba(0,0,0,.03)); /* \u0431\u0435\u0437 \u0433\u0440\u0430\u0434\u0438\u0435\u043D\u0442\u0430 */
          border:1px solid rgba(0,0,0,.08);
        }

        .points-top{
          display:flex; align-items:center; justify-content:flex-start; gap:8px;
          white-space:nowrap; min-width:0;
        }
        .points-title{
          display:flex; align-items:center; gap:6px;
          font-weight:700; letter-spacing:.2px;
          font-size: clamp(13px, 3.5vw, 16px);
          color:#0f172a; white-space:nowrap;
        }
        .points-title i{ width:18px; height:18px; flex:0 0 auto; }

        .points-row{
          margin-top:10px;
          display:grid; grid-template-columns: 1fr; gap:8px;
        }
        .points-chip{
          display:flex; align-items:center; gap:8px;
          padding:8px 10px; border-radius:10px; border:1px solid rgba(0,0,0,.06);
          background:#fff;
        }
        .points-chip i{ width:18px; height:18px; flex:0 0 auto; }
        .points-chip .label{ font-size:12px; color:var(--muted,#6b7280); white-space:nowrap; }
        .points-chip .val{ margin-left:auto; font-weight:800; white-space:nowrap; }

        .points-actions{
          margin-top:10px; display:flex; gap:8px; align-items:stretch;
          flex-wrap:nowrap; min-width:0;
        }
        .points-actions .pill{
          height:36px; padding:0 10px;
          display:inline-flex; align-items:center; justify-content:center; gap:8px;
          border-radius:10px; border:1px solid var(--border,rgba(0,0,0,.08)); background:#fff;
          font-weight:600; line-height:1;
          flex:1 1 0; min-width:0;
          font-size: clamp(12px, 3.3vw, 14px);
          white-space:nowrap;
        }
        .points-actions .pill i{ width:18px; height:18px; flex:0 0 auto; }

        .points-actions .primary{
          color:#fff; border-color:transparent;
          background: linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ea580c 100%);
          box-shadow: 0 1px 0 rgba(0,0,0,.06), inset 0 0 0 1px rgba(255,255,255,.15);
        }
        @media (hover:hover){
          .points-actions .primary:hover{ filter:brightness(.98); }
          .points-actions .pill:not(.primary):hover{ filter:brightness(.98); }
        }

        @media (min-width: 420px){
          .points-row{ grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 360px){
          .points-actions{ gap:6px; }
          .points-actions .pill{ height:34px; padding:0 8px; font-size:12px; }
          .points-title i{ width:16px; height:16px; }
        }
      </style>

      <div class="account-card">
        <div class="avatar" id="avatarBox" aria-label="\u0410\u0432\u0430\u0442\u0430\u0440">
          <img id="tgAvatar" alt="\u0410\u0432\u0430\u0442\u0430\u0440" src="${DEFAULT_AVATAR}">
        </div>
        <div class="info">
          <div class="name">${u ? `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C" : "\u0413\u043E\u0441\u0442\u044C"}</div>
          <div class="muted">${u ? "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D \u0447\u0435\u0440\u0435\u0437 Telegram" : "\u0410\u043D\u043E\u043D\u0438\u043C\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C"}</div>
        </div>
      </div>

      <!-- \u0411\u043B\u043E\u043A \u0431\u0430\u043B\u043B\u043E\u0432 -->
      <div class="points-card" role="region" aria-label="\u0411\u0430\u043B\u043B\u044B \u0438 \u043A\u044D\u0448\u0431\u0435\u043A">
        <div class="points-top">
          <div class="points-title"><i data-lucide="coins"></i><span>\u0412\u0430\u0448\u0438 \u0431\u0430\u043B\u043B\u044B</span></div>
        </div>

        <div class="points-row" aria-label="\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0431\u0430\u043B\u043B\u043E\u0432">
          <div class="points-chip" title="\u0411\u0430\u043B\u043B\u044B, \u043A\u043E\u0442\u043E\u0440\u044B\u043C\u0438 \u043C\u043E\u0436\u043D\u043E \u043E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0447\u0430\u0441\u0442\u044C \u0437\u0430\u043A\u0430\u0437\u0430">
            <i data-lucide="badge-check"></i>
            <div class="label">\u0413\u043E\u0442\u043E\u0432\u043E \u043A \u043E\u043F\u043B\u0430\u0442\u0435</div>
            <div class="val" id="ptsAvail">${0 .toLocaleString("ru-RU")}</div>
          </div>
          <div class="points-chip" title="\u0411\u0430\u043B\u043B\u044B \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043D\u0430 \u0431\u0430\u043B\u0430\u043D\u0441\u0435 \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F (\u043E\u0431\u044B\u0447\u043D\u043E 24 \u0447\u0430\u0441\u0430 \u0438\u043B\u0438 \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u043F\u0440\u0438 \xAB\u0432\u044B\u0434\u0430\u043D\xBB)">
            <i data-lucide="hourglass"></i>
            <div class="label">\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F</div>
            <div class="val" id="ptsPend">${0 .toLocaleString("ru-RU")}</div>
          </div>
        </div>

        <div class="points-actions">
          <a class="pill primary" href="#/account/cashback"><i data-lucide="sparkles"></i><span>\u041C\u043E\u0439 \u043A\u044D\u0448\u0431\u0435\u043A</span></a>
          <a class="pill" href="#/faq"><i data-lucide="help-circle"></i><span>\u041A\u0430\u043A \u043F\u043E\u0442\u0440\u0430\u0442\u0438\u0442\u044C</span></a>
        </div>
      </div>

      ${hasBoost ? `
        <div class="note" style="display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start;margin:8px 0;padding:10px;border:1px dashed #d97706;border-radius:12px;background:rgba(245,158,11,.06)">
          <i data-lucide="zap"></i>
          <div class="muted">
            \u0423 \u0432\u0430\u0441 \u0430\u043A\u0442\u0438\u0432\u0435\u043D \u0431\u043E\u043D\u0443\u0441 <b>x2 \u043A\u044D\u0448\u0431\u0435\u043A</b> \u043D\u0430 \u043F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u043F\u043E \u0440\u0435\u0444-\u0441\u0441\u044B\u043B\u043A\u0435.
          </div>
        </div>` : ""}

      <nav class="menu">
        <a class="menu-item" href="#/orders"><i data-lucide="package"></i><span>\u041C\u043E\u0438 \u0437\u0430\u043A\u0430\u0437\u044B</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/cashback"><i data-lucide="coins"></i><span>\u041C\u043E\u0439 \u043A\u044D\u0448\u0431\u0435\u043A</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/referrals"><i data-lucide="users"></i><span>\u041C\u043E\u0438 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u044B</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/account/addresses"><i data-lucide="map-pin"></i><span>\u0410\u0434\u0440\u0435\u0441\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/favorites"><i data-lucide="heart"></i><span>\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435</span><i data-lucide="chevron-right" class="chev"></i></a>
        <a class="menu-item" href="#/faq"><i data-lucide="help-circle"></i><span>\u041F\u043E\u043C\u043E\u0449\u044C</span><i data-lucide="chevron-right" class="chev"></i></a>
        ${isAdmin ? `<a class="menu-item" href="#/admin"><i data-lucide="shield-check"></i><span>\u0410\u0434\u043C\u0438\u043D\u043A\u0430</span><i data-lucide="chevron-right" class="chev"></i></a>` : ""}
      </nav>

      <div style="margin-top:12px;display:flex;gap:10px">
        <button id="supportBtn" class="pill" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px">
          <i data-lucide="message-circle"></i>
          <span>\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430</span>
        </button>
      </div>
    </section>`;
    ((_c = window.lucide) == null ? void 0 : _c.createIcons) && lucide.createIcons();
    (async () => {
      try {
        await fetchMyLoyalty();
        const b = getLocalLoyalty();
        const a = document.getElementById("ptsAvail");
        const p = document.getElementById("ptsPend");
        if (a) a.textContent = Number(b.available || 0).toLocaleString("ru-RU");
        if (p) p.textContent = Number(b.pending || 0).toLocaleString("ru-RU");
      } catch (e) {
      }
    })();
    (_d = document.getElementById("supportBtn")) == null ? void 0 : _d.addEventListener("click", () => {
      openExternal2(OP_CHAT_URL2);
    });
    loadTgAvatar();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        loadTgAvatar();
        (async () => {
          try {
            await fetchMyLoyalty();
            const b = getLocalLoyalty();
            const a = document.getElementById("ptsAvail");
            const p = document.getElementById("ptsPend");
            if (a) a.textContent = Number(b.available || 0).toLocaleString("ru-RU");
            if (p) p.textContent = Number(b.pending || 0).toLocaleString("ru-RU");
          } catch (e) {
          }
        })();
      }
    });
    document.querySelectorAll(".menu a").forEach((a) => {
      a.addEventListener("click", () => {
        var _a5;
        return (_a5 = window.setTabbarMenu) == null ? void 0 : _a5.call(window, "account");
      });
    });
  }
  function renderCashback() {
    var _a4, _b, _c;
    (_a4 = window.setTabbarMenu) == null ? void 0 : _a4.call(window, "account");
    const v2 = document.getElementById("view");
    v2.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAcc"><i data-lucide="chevron-left"></i></button>
        \u041C\u043E\u0439 \u043A\u044D\u0448\u0431\u0435\u043A
      </div>

      <div class="stat-cb" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 10px">
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">\u0411\u0430\u043B\u0430\u043D\u0441</div>
          <div id="cbAvail" style="font-weight:800;font-size:22px">0</div>
        </div>
        <div class="stat-card" style="padding:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px">
          <div class="muted mini">\u041E\u0436\u0438\u0434\u0430\u0435\u0442 (~24\u0447)</div>
          <div id="cbPend" style="font-weight:800;font-size:22px">0</div>
        </div>
      </div>

      <div class="subsection-title">\u0418\u0441\u0442\u043E\u0440\u0438\u044F</div>
      <div class="table-wrap">
        <table class="size-table">
          <thead>
            <tr><th>\u0414\u0430\u0442\u0430</th><th>\u0421\u043E\u0431\u044B\u0442\u0438\u0435</th><th style="text-align:right">\u0411\u0430\u043B\u043B\u044B</th></tr>
          </thead>
          <tbody id="cbRows"><tr><td colspan="3" class="muted">\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C\u2026</td></tr></tbody>
        </table>
      </div>
    </section>
  `;
    ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
    (_c = document.getElementById("backAcc")) == null ? void 0 : _c.addEventListener("click", () => history.back());
    (async () => {
      try {
        await fetchMyLoyalty();
      } catch (e) {
      }
      const b = getLocalLoyalty();
      const avail = Number(b.available || 0);
      const pend = Number(b.pending || 0);
      const hist = Array.isArray(b.history) ? b.history.slice().reverse() : [];
      const availEl = document.getElementById("cbAvail");
      const pendEl = document.getElementById("cbPend");
      if (availEl) availEl.textContent = avail.toLocaleString("ru-RU");
      if (pendEl) pendEl.textContent = pend.toLocaleString("ru-RU");
      const rowsEl = document.getElementById("cbRows");
      if (rowsEl) {
        if (!hist.length) {
          rowsEl.innerHTML = `<tr><td colspan="3" class="muted">\u041F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u043E</td></tr>`;
        } else {
          rowsEl.innerHTML = hist.slice(-200).map((h) => {
            const dt = new Date(h.ts || Date.now());
            const d = `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
            const pts = Number(h.pts || 0) | 0;
            const sign = pts >= 0 ? "+" : "";
            const reason = h.info || h.reason || mapKind(h.kind) || "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F";
            return `
            <tr>
              <td>${d}</td>
              <td>${escapeHtml4(reason)}</td>
              <td style="text-align:right"><b>${sign}${pts.toLocaleString("ru-RU")}</b></td>
            </tr>
          `;
          }).join("");
        }
      }
    })();
  }
  function renderReferrals() {
    var _a4, _b, _c;
    (_a4 = window.setTabbarMenu) == null ? void 0 : _a4.call(window, "account");
    const v2 = document.getElementById("view");
    const link = getReferralLink();
    const arr = readMyReferrals();
    const monthKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const monthCount = arr.filter((x) => (x.month || "") === monthKey).length;
    v2.innerHTML = `
    <section class="section" style="padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAcc"><i data-lucide="chevron-left"></i></button>
        \u041C\u043E\u0438 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u044B
      </div>

      <style>
        /* \u2014\u2014\u2014 \u0420\u0435\u0444-\u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u2014\u2014\u2014 */
        .ref-card{
          padding:12px;
          border:1px solid var(--border,rgba(0,0,0,.12));
          border-radius:12px;
          background:var(--card,rgba(0,0,0,.03));
          display:grid; gap:10px;
        }
        .ref-grid{
          display:grid;
          grid-template-columns: minmax(0,1fr) auto;
          align-items: stretch;
          gap:10px;
        }
        .ref-linkbox{
          min-height:42px;
          padding:10px 12px;
          border:1px solid var(--border,rgba(0,0,0,.12));
          border-radius:10px;
          background:var(--bg,#fff);
          overflow-x:auto;
          overflow-y:hidden;
          white-space:nowrap;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size:.92rem;
          line-height:1.2;
          user-select:all;
        }
        .ref-actions .pill{
          height:42px;
          display:inline-flex; align-items:center; gap:8px;
          white-space:nowrap;
        }
        .ref-hint{ color:var(--muted,#6b7280); font-size:.9rem; }
        @media (max-width: 460px){
          .ref-grid{ grid-template-columns: 1fr; }
          .ref-actions .pill{ width:100%; justify-content:center; }
        }
      </style>

      <div class="ref-card">
        <div class="muted mini">\u0412\u0430\u0448\u0430 \u0440\u0435\u0444-\u0441\u0441\u044B\u043B\u043A\u0430</div>

        <div class="ref-grid">
          <div id="refLinkBox" class="ref-linkbox">${escapeHtml4(link)}</div>
          <div class="ref-actions"><button id="copyRef" class="pill"><i data-lucide="copy"></i><span>\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C</span></button></div>
        </div>

        <div id="copyHint" class="ref-hint" style="display:none">\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E!</div>

        <div class="muted mini">\u041F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u043F\u043E \u044D\u0442\u043E\u0439 \u0441\u0441\u044B\u043B\u043A\u0435 \u0434\u0430\u0451\u0442 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u0443 x2 \u043A\u044D\u0448\u0431\u0435\u043A, \u0430 \u0432\u0430\u043C \u2014 5% \u0441 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0435\u0433\u043E \u0437\u0430\u043A\u0430\u0437\u0430. \u041B\u0438\u043C\u0438\u0442 \u2014 \u043D\u0435 \u0431\u043E\u043B\u0435\u0435 10 \u043D\u043E\u0432\u044B\u0445 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u043E\u0432 \u0432 \u043C\u0435\u0441\u044F\u0446.</div>
        <div class="muted mini">\u0412 \u044D\u0442\u043E\u043C \u043C\u0435\u0441\u044F\u0446\u0435 \u043D\u043E\u0432\u044B\u0445 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u043E\u0432: <b>${monthCount}</b> / 10</div>
      </div>

      <div class="subsection-title" style="margin-top:12px">\u0421\u043F\u0438\u0441\u043E\u043A \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u043E\u0432</div>
      <div class="table-wrap">
        <table class="size-table">
          <thead><tr><th>#</th><th>UID</th><th>\u041A\u043E\u0433\u0434\u0430 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D</th></tr></thead>
          <tbody>
            ${arr.length ? arr.map((r, i) => {
      const d = new Date(r.ts || 0);
      const dt = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
      return `<tr><td>${i + 1}</td><td>${escapeHtml4(String(r.uid || ""))}</td><td>${dt}</td></tr>`;
    }).join("") : `<tr><td colspan="3" class="muted">\u041F\u043E\u043A\u0430 \u043D\u0435\u0442</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
    ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
    (_c = document.getElementById("backAcc")) == null ? void 0 : _c.addEventListener("click", () => history.back());
    const btn = document.getElementById("copyRef");
    const hint = document.getElementById("copyHint");
    btn == null ? void 0 : btn.addEventListener("click", async () => {
      var _a5;
      const text = String(link);
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          ok = true;
        } catch (e2) {
        }
      }
      if (ok) {
        const icon = btn.querySelector("i[data-lucide]");
        const label = btn.querySelector("span");
        const prev = { label: (label == null ? void 0 : label.textContent) || "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C", icon: (icon == null ? void 0 : icon.getAttribute("data-lucide")) || "copy" };
        if (label) label.textContent = "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E!";
        if (icon) {
          icon.setAttribute("data-lucide", "check");
          ((_a5 = window.lucide) == null ? void 0 : _a5.createIcons) && lucide.createIcons();
        }
        if (hint) {
          hint.style.display = "block";
        }
        setTimeout(() => {
          var _a6;
          if (label) label.textContent = prev.label;
          if (icon) {
            icon.setAttribute("data-lucide", prev.icon);
            ((_a6 = window.lucide) == null ? void 0 : _a6.createIcons) && lucide.createIcons();
          }
          if (hint) {
            hint.style.display = "none";
          }
        }, 1500);
      }
    });
  }
  function renderAddresses() {
    var _a4, _b, _c, _d, _e;
    (_a4 = window.setTabbarMenu) == null ? void 0 : _a4.call(window, "account");
    const v2 = document.getElementById("view");
    const list = state.addresses.list.slice();
    const defId = state.addresses.defaultId;
    v2.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAccAddrs"><i data-lucide="chevron-left"></i></button>
        \u0410\u0434\u0440\u0435\u0441\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438
      </div>

      <style>
        .addr-list .addr{
          display:grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          column-gap: 10px;
          padding: 10px 12px;
          border: 1px solid var(--border, rgba(0,0,0,.08));
          border-radius: 10px;
          margin-bottom: 8px;
          background: var(--card, rgba(0,0,0,.03));
        }
        .addr-list .addr input[type="radio"]{
          margin: 0 4px 0 0;
          align-self: center;
        }
        .addr-list .addr-body{ min-width: 0; }
        .addr-list .addr-title{ font-weight: 700; line-height: 1.2; }
        .addr-list .addr-sub{
          color: var(--muted, #777);
          font-size: .92rem;
          line-height: 1.3;
          word-break: break-word;
        }
        .addr-list .addr-ops{
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-end;
          justify-content: center;
        }
        .addr-list .addr-ops .icon-btn{
          display:inline-flex; align-items:center; justify-content:center;
          width:32px; height:32px; border-radius:8px;
          border:1px solid var(--border, rgba(0,0,0,.08));
          background: var(--btn, #fff);
        }
        .addr-list .addr-ops .icon-btn.danger{
          border-color: rgba(220, 53, 69, .35);
          background: rgba(220, 53, 69, .06);
        }
        @media (hover:hover){
          .addr-list .addr-ops .icon-btn:hover{ filter: brightness(0.98); }
        }
        .addr-actions{ display:flex; gap:10px; margin-top:10px; }
      </style>

      <div class="addr-list">
        ${list.length ? list.map((a) => `
          <label class="addr">
            <input type="radio" name="addr" ${a.id === defId ? "checked" : ""} data-id="${a.id}" aria-label="\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0430\u0434\u0440\u0435\u0441 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E">
            <div class="addr-body">
              <div class="addr-title">${escapeHtml4(a.nickname || "\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F")}</div>
              <div class="addr-sub">${escapeHtml4(a.address || "")}</div>
            </div>
            <div class="addr-ops" aria-label="\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0430\u0434\u0440\u0435\u0441\u043E\u043C">
              <button class="icon-btn edit" data-id="${a.id}" title="\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C" aria-label="\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0430\u0434\u0440\u0435\u0441">
                <i data-lucide="pencil"></i>
              </button>
              <button class="icon-btn danger delete" data-id="${a.id}" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C" aria-label="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </label>
        `).join("") : `
          <div class="muted" style="padding:8px 2px">\u0410\u0434\u0440\u0435\u0441\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u2014 \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439.</div>
        `}
      </div>

      <div class="addr-actions">
        <button id="addAddr" class="pill primary">\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441</button>
        <button id="saveAddr" class="pill">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>
      </div>
    </section>`;
    const listEl = v2.querySelector(".addr-list");
    if (listEl) {
      listEl.addEventListener("click", (e) => {
        var _a5, _b2;
        const delBtn = e.target.closest(".delete");
        const editBtn = e.target.closest(".edit");
        if (!delBtn && !editBtn) return;
        const id = Number((delBtn || editBtn).getAttribute("data-id"));
        const idx2 = state.addresses.list.findIndex((x) => Number(x.id) === id);
        if (idx2 === -1) return;
        if (editBtn) {
          const cur = state.addresses.list[idx2];
          const nickname = prompt("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \u0414\u043E\u043C)", cur.nickname || "");
          if (nickname === null) return;
          const address = prompt("\u041F\u043E\u043B\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441", cur.address || "");
          if (address === null) return;
          state.addresses.list[idx2] = __spreadProps(__spreadValues({}, cur), { nickname: (nickname || "").trim(), address: (address || "").trim() });
          persistAddresses();
          renderAddresses();
          return;
        }
        if (delBtn) {
          const cur = state.addresses.list[idx2];
          const ok = confirm(`\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441 "${cur.nickname || "\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F"}"?`);
          if (!ok) return;
          state.addresses.list.splice(idx2, 1);
          if (Number(state.addresses.defaultId) === id) {
            state.addresses.defaultId = (_b2 = (_a5 = state.addresses.list[0]) == null ? void 0 : _a5.id) != null ? _b2 : null;
          }
          persistAddresses();
          renderAddresses();
          return;
        }
      });
    }
    (_b = document.getElementById("addAddr")) == null ? void 0 : _b.addEventListener("click", () => {
      const nickname = prompt("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \u0414\u043E\u043C)");
      if (nickname === null) return;
      const address = prompt("\u041F\u043E\u043B\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441");
      if (address === null) return;
      if (!nickname.trim() || !address.trim()) return;
      const id = Date.now();
      state.addresses.list.push({ id, nickname: nickname.trim(), address: address.trim() });
      if (!state.addresses.defaultId) state.addresses.defaultId = id;
      persistAddresses();
      renderAddresses();
    });
    (_c = document.getElementById("saveAddr")) == null ? void 0 : _c.addEventListener("click", () => {
      const r = v2.querySelector('input[name="addr"]:checked');
      if (r) {
        state.addresses.defaultId = Number(r.getAttribute("data-id"));
        persistAddresses();
      }
      history.back();
    });
    (_d = document.getElementById("backAccAddrs")) == null ? void 0 : _d.addEventListener("click", () => history.back());
    ((_e = window.lucide) == null ? void 0 : _e.createIcons) && lucide.createIcons();
  }
  function renderSettings() {
    var _a4, _b, _c;
    (_a4 = window.setTabbarMenu) == null ? void 0 : _a4.call(window, "account");
    const v2 = document.getElementById("view");
    v2.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="backAccSettings"><i data-lucide="chevron-left"></i></button>
        \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438
      </div>
      <div class="menu">
        <div class="menu-item"><i data-lucide="moon"></i><span>\u0422\u0435\u043C\u0430 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430</span></div>
      </div>
    </section>`;
    ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
    (_c = document.getElementById("backAccSettings")) == null ? void 0 : _c.addEventListener("click", () => history.back());
  }
  function openExternal2(url) {
    var _a4;
    try {
      const tg2 = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp;
      if (tg2 == null ? void 0 : tg2.openTelegramLink) {
        tg2.openTelegramLink(url);
        return;
      }
      if (tg2 == null ? void 0 : tg2.openLink) {
        tg2.openLink(url, { try_instant_view: false });
        return;
      }
    } catch (e) {
    }
    window.open(url, "_blank", "noopener");
  }
  function escapeHtml4(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
  function mapKind(kind = "") {
    const dict = {
      accrue: "\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 (\u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435/\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E)",
      confirm: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F",
      redeem: "\u041E\u043F\u043B\u0430\u0442\u0430 \u0431\u0430\u043B\u043B\u0430\u043C\u0438",
      reserve: "\u0420\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
      reserve_cancel: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u0440\u0435\u0437\u0435\u0440\u0432\u0430",
      ref_accrue: "\u0420\u0435\u0444\u0435\u0440\u0430\u043B\u044C\u043D\u043E\u0435 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 (\u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435)",
      ref_confirm: "\u0420\u0435\u0444\u0435\u0440\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B"
    };
    return dict[kind] || "";
  }

  // src/components/FAQ.js
  var OP_CHAT_URL3 = "https://t.me/evliseorder";
  function renderFAQ() {
    var _a4, _b, _c, _d;
    const v2 = document.getElementById("view");
    try {
      (_a4 = window.setTabbarMenu) == null ? void 0 : _a4.call(window, "account");
    } catch (e) {
    }
    const items = [
      {
        icon: "truck",
        title: "\u0421\u0440\u043E\u043A\u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438",
        html: `\u041E\u0431\u044B\u0447\u043D\u043E <b>14\u201316 \u0434\u043D\u0435\u0439</b> \u0441 \u043C\u043E\u043C\u0435\u043D\u0442\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0437\u0430\u043A\u0430\u0437\u0430. \u0415\u0441\u043B\u0438 \u0441\u0440\u043E\u043A \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0441\u044F \u2014 \u043C\u044B \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u0438\u043C.`
      },
      {
        icon: "credit-card",
        title: "\u041E\u043F\u043B\u0430\u0442\u0430",
        html: `\u041E\u043F\u043B\u0430\u0442\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u043E\u043C \u043D\u0430 \u043A\u0430\u0440\u0442\u0443 \u2014 \u043D\u043E\u043C\u0435\u0440 \u043F\u043E\u043A\u0430\u0436\u0435\u043C \u043D\u0430 \u0448\u0430\u0433\u0435 \u043E\u043F\u043B\u0430\u0442\u044B. \u041F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 <b>\u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442 \u0447\u0435\u043A\u0430</b> \u043F\u0440\u044F\u043C\u043E \u0432 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0438.`
      },
      {
        icon: "package",
        title: "\u0427\u0442\u043E \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442 \u043F\u043E\u0441\u043B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B?",
        html: `\u041C\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C \u043F\u043B\u0430\u0442\u0451\u0436 \u0438 \u0431\u0435\u0440\u0451\u043C \u0437\u0430\u043A\u0430\u0437 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443. \u041A\u0430\u043A \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u044B\u043B\u043A\u0430 \u0431\u0443\u0434\u0435\u0442 \u0433\u043E\u0442\u043E\u0432\u0430 \u043A \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u2014 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0441\u0432\u044F\u0436\u0435\u0442\u0441\u044F \u0438 \u0443\u0442\u043E\u0447\u043D\u0438\u0442 \u0434\u0435\u0442\u0430\u043B\u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438.`
      },
      {
        icon: "clock",
        title: "\u041A\u0430\u043A \u043E\u0442\u0441\u043B\u0435\u0434\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441?",
        html: `\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0440\u0430\u0437\u0434\u0435\u043B <b>\u041C\u043E\u0438 \u0437\u0430\u043A\u0430\u0437\u044B</b> \u2014 \u0442\u0430\u043C \u0432\u0438\u0434\u0435\u043D \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u044D\u0442\u0430\u043F \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043F\u043E \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0437\u0430\u043A\u0430\u0437\u0443.`
      },
      {
        icon: "coins",
        title: "\u041A\u044D\u0448\u0431\u0435\u043A: \u043A\u0430\u043A \u044D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442",
        html: `
        <p><b>\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435.</b> \u0417\u0430 \u043A\u0430\u0436\u0434\u044B\u0439 \u043E\u043F\u043B\u0430\u0447\u0435\u043D\u043D\u044B\u0439 \u0442\u043E\u0432\u0430\u0440 \u0432\u044B \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442\u0435 \u043A\u044D\u0448\u0431\u0435\u043A \u0432 \u0431\u0430\u043B\u043B\u0430\u0445: \u043E\u0431\u044B\u0447\u043D\u043E <b>5%</b> \u043E\u0442 \u0446\u0435\u043D\u044B.</p>
        <p><b>\u0414\u043E\u0437\u0440\u0435\u0432\u0430\u043D\u0438\u0435.</b> \u0411\u0430\u043B\u043B\u044B \u0441\u0442\u0430\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u043C\u0438 \u0447\u0435\u0440\u0435\u0437 <b>24 \u0447\u0430\u0441\u0430</b> \u043F\u043E\u0441\u043B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B.</p>
        <p><b>\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435.</b> \u041D\u0430 \u0448\u0430\u0433\u0435 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F \u0437\u0430\u043A\u0430\u0437\u0430 \u043C\u043E\u0436\u043D\u043E \u043E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0447\u0430\u0441\u0442\u044C \u0441\u0443\u043C\u043C\u044B \u0431\u0430\u043B\u043B\u0430\u043C\u0438. \u0412\u0430\u0448 \u0431\u0430\u043B\u0430\u043D\u0441 \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435
        <a href="#/account/cashback">\xAB\u041C\u043E\u0439 \u043A\u044D\u0448\u0431\u0435\u043A\xBB</a>.</p>
        <p class="muted">\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430: \u0435\u0441\u043B\u0438 \u0432\u044B \u043F\u0440\u0438\u0448\u043B\u0438 \u043F\u043E \u0440\u0435\u0444-\u0441\u0441\u044B\u043B\u043A\u0435, \u043D\u0430 <b>\u043F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u2014 x2</b> \u043A\u044D\u0448\u0431\u0435\u043A.</p>
      `
      },
      {
        icon: "users",
        title: "\u0420\u0435\u0444\u0435\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430",
        html: `
        <p><b>\u041A\u0430\u043A \u044D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442.</b> \u0414\u0435\u043B\u0438\u0442\u0435\u0441\u044C \u0432\u0430\u0448\u0435\u0439 \u0440\u0435\u0444-\u0441\u0441\u044B\u043B\u043A\u043E\u0439: \u0437\u0430\u043A\u0430\u0437\u044B \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0451\u043D\u043D\u044B\u0445 \u043F\u0440\u0438\u043D\u043E\u0441\u044F\u0442 \u0432\u0430\u043C <b>5% \u0431\u043E\u043D\u0443\u0441\u043E\u043C</b> \u043E\u0442 \u0438\u0445 \u043F\u043E\u043A\u0443\u043F\u043E\u043A.</p>
        <p><b>\u0411\u043E\u043D\u0443\u0441 \u0434\u043B\u044F \u0434\u0440\u0443\u0433\u0430.</b> \u041F\u043E \u0432\u0430\u0448\u0435\u0439 \u0441\u0441\u044B\u043B\u043A\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u0434\u0430\u0451\u0442 \u0434\u0440\u0443\u0433\u0443 <b>x2 \u043A\u044D\u0448\u0431\u0435\u043A</b>.</p>
        <p><b>\u0413\u0434\u0435 \u0432\u0437\u044F\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443.</b> \u0412 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 <a href="#/account/referrals">\xAB\u041C\u043E\u0438 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u044B\xBB</a> \u2014 \u0442\u0430\u043C \u0436\u0435 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0437\u0430 \u043C\u0435\u0441\u044F\u0446.</p>
        <p class="muted">\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435: \u043D\u0435 \u0431\u043E\u043B\u0435\u0435 10 \u043D\u043E\u0432\u044B\u0445 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u043E\u0432 \u0432 \u043C\u0435\u0441\u044F\u0446.</p>
      `
      },
      {
        icon: "shirt",
        title: "\u0420\u0430\u0437\u043C\u0435\u0440\u044B \u0438 \u043A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u0446\u0438\u044F",
        html: `\u041D\u0435 \u0443\u0432\u0435\u0440\u0435\u043D\u044B \u0441 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u043C? \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0443 \u2014 \u043F\u043E\u0434\u0441\u043A\u0430\u0436\u0435\u043C \u043F\u043E \u043C\u0435\u0440\u043A\u0430\u043C \u0438 \u043F\u043E\u0441\u0430\u0434\u043A\u0435 \u043F\u0435\u0440\u0435\u0434 \u043E\u043F\u043B\u0430\u0442\u043E\u0439.`
      },
      {
        icon: "undo-2",
        title: "\u041E\u0431\u043C\u0435\u043D / \u0432\u043E\u0437\u0432\u0440\u0430\u0442",
        html: `\u0415\u0441\u043B\u0438 \u0442\u043E\u0432\u0430\u0440 \u0441 \u0437\u0430\u0432\u043E\u0434\u0441\u043A\u0438\u043C \u0431\u0440\u0430\u043A\u043E\u043C \u0438\u043B\u0438 \u043F\u0440\u0438\u0448\u043B\u0430 \u043D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u043F\u043E\u0437\u0438\u0446\u0438\u044F \u2014 \u0440\u0435\u0448\u0438\u043C \u0432\u043E\u043F\u0440\u043E\u0441. \u0421\u0432\u044F\u0436\u0438\u0442\u0435\u0441\u044C \u0441 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u043E\u043C \u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u0444\u043E\u0442\u043E/\u0432\u0438\u0434\u0435\u043E \u0440\u0430\u0441\u043F\u0430\u043A\u043E\u0432\u043A\u0438.`
      },
      {
        icon: "help-circle",
        title: "\u041C\u043E\u0436\u043D\u043E \u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u043A\u0430\u0437 \u043F\u043E\u0441\u043B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B?",
        html: `\u0418\u043D\u043E\u0433\u0434\u0430 \u2014 \u0434\u0430, \u0435\u0441\u043B\u0438 \u0437\u0430\u043A\u0430\u0437 \u0435\u0449\u0451 \u043D\u0435 \u0443\u0448\u0451\u043B \u0432 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443/\u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443. \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0443, \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 \u0437\u0430\u043A\u0430\u0437\u0430 \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043C \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C.`
      },
      {
        icon: "wallet",
        title: "\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438",
        html: `\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u043E\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0437\u0430 \u0441\u0447\u0451\u0442 \u0437\u0430\u043A\u0430\u0437\u0447\u0438\u043A\u0430, \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E \u0441\u0435\u0440\u0432\u0438\u0441\u0430 \u042F\u043D\u0434\u0435\u043A\u0441.`
      },
      {
        icon: "shield-check",
        title: "\u0411\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u044C \u0438 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u044F",
        html: `\u0412\u0441\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u2014 \u0432\u043D\u0443\u0442\u0440\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F: \u0447\u0435\u043A\u0438, \u0441\u0442\u0430\u0442\u0443\u0441\u044B \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044F. \u041F\u0440\u0438 \u0441\u043F\u043E\u0440\u043D\u044B\u0445 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044F\u0445 \u0432\u0441\u0451 \u0440\u0435\u0448\u0430\u0435\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0430.`
      }
    ];
    v2.innerHTML = `
    <section class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="faqBack"><i data-lucide="chevron-left"></i></button>
        \u041F\u043E\u043C\u043E\u0449\u044C
      </div>

      <style>
        /* ==== A C C O R D I O N  (\u0430\u0434\u0430\u043F\u0442\u0438\u0432) ==== */
        .faq{
          margin: 0 0 12px;
          display: grid;
          gap: 10px;
        }
        .faq details{
          border:1px solid var(--stroke);
          border-radius:14px;
          background:#fff;
          overflow:hidden;
        }
        .faq summary{
          list-style:none;
          cursor:pointer;
          padding:14px 14px;
          display:grid;
          grid-template-columns:auto 1fr auto;
          gap:12px;
          align-items:center;
          user-select:none;
          outline:none;
        }
        .faq summary::-webkit-details-marker{ display:none; }

        .faq .ico{ width:22px; height:22px; opacity:.9; color:inherit; }
        .faq .q{
          font-weight:800;
          line-height:1.2;
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .faq .chev{
          width:18px; height:18px;
          transform:rotate(0deg);
          transition: transform .18s ease;
          opacity:.7;
        }
        details[open] .chev{ transform:rotate(180deg); }

        .faq .a{
          padding: 0 14px 14px 54px; /* \u043E\u0442\u0441\u0442\u0443\u043F \u043F\u043E\u0434 \u0438\u043A\u043E\u043D\u043A\u0443 */
          color: var(--muted);
          font-size: 14px;
          line-height: 1.45;
        }
        .faq .a b{ color: var(--text); }

        /* \u043A\u0440\u0443\u043F\u043D\u044B\u0435 \u0442\u0430\u0447-\u0446\u0435\u043B\u0438 \u043D\u0430 \u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0445 \u044D\u043A\u0440\u0430\u043D\u0430\u0445 */
        @media (max-width: 420px){
          .faq summary{ padding:13px 12px; gap:10px; }
          .faq .a{ padding: 0 12px 12px 50px; font-size: 14px; }
        }

        /* \u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0431\u043B\u043E\u043A \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0438 */
        .support-strip{
          margin-top: 6px;
          border:1px solid var(--stroke);
          border-radius:14px;
          background:#fff;
          display:flex;
          align-items:center;
          gap:10px;
          padding:10px 12px;
        }
        .support-strip i{ width:20px; height:20px; opacity:.9; }
        .support-text{ min-width:0; flex:1; }
        .support-title{
          font-weight:800;
          line-height:1.1;
          font-size:14px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .support-sub{
          color:var(--muted);
          font-size:12px;
          line-height:1.2;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        /* \u043D\u0430 \u0443\u0437\u043A\u0438\u0445 \u044D\u043A\u0440\u0430\u043D\u0430\u0445 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u043C \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0434\u043D\u0443 \u043A\u043E\u0440\u043E\u0442\u043A\u0443\u044E \u0441\u0442\u0440\u043E\u043A\u0443 */
        @media (max-width: 420px){
          .support-sub{ display:none; }
        }
        .support-strip .pill{
          flex:0 0 auto;
          height:36px;
          padding:0 12px;
          border-radius:12px;
        }
        .support-strip .pill i{ width:18px; height:18px; }
      </style>

      <div class="faq" id="faqList">
        ${items.map((it, i) => `
          <details ${i === 0 ? "open" : ""}>
            <summary>
              <i data-lucide="${it.icon}" class="ico"></i>
              <div class="q">${escapeHtml5(it.title)}</div>
              <i data-lucide="chevron-down" class="chev"></i>
            </summary>
            <div class="a">${it.html}</div>
          </details>
        `).join("")}

        <!-- \u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u0430\u044F \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430: \u043E\u0434\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 + \u043A\u043D\u043E\u043F\u043A\u0430 -->
        <div class="support-strip">
          <i data-lucide="message-circle"></i>
          <div class="support-text">
            <div class="support-title">\u041D\u0443\u0436\u043D\u0430 \u043F\u043E\u043C\u043E\u0449\u044C?</div>
            <div class="support-sub">\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0443 \u2014 \u043E\u0442\u0432\u0435\u0442\u0438\u043C \u0431\u044B\u0441\u0442\u0440\u043E</div>
          </div>
          <button id="faqSupport" class="pill"><i data-lucide="send"></i><span>\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430</span></button>
        </div>
      </div>
    </section>
  `;
    ((_b = window.lucide) == null ? void 0 : _b.createIcons) && lucide.createIcons();
    (_c = document.getElementById("faqBack")) == null ? void 0 : _c.addEventListener("click", () => history.back());
    (_d = document.getElementById("faqSupport")) == null ? void 0 : _d.addEventListener("click", () => {
      openExternal3(OP_CHAT_URL3);
    });
    const faq = document.getElementById("faqList");
    faq == null ? void 0 : faq.addEventListener("click", (e) => {
      const sm = e.target.closest("summary");
      if (!sm) return;
      const host = sm.parentElement;
      if (!host.open) {
        faq.querySelectorAll("details[open]").forEach((d) => {
          if (d !== host) d.removeAttribute("open");
        });
      }
    });
  }
  function openExternal3(url) {
    var _a4;
    try {
      const tg2 = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp;
      if (tg2 == null ? void 0 : tg2.openTelegramLink) {
        tg2.openTelegramLink(url);
        return;
      }
      if (tg2 == null ? void 0 : tg2.openLink) {
        tg2.openLink(url, { try_instant_view: false });
        return;
      }
    } catch (e) {
    }
    window.open(url, "_blank", "noopener");
  }
  function escapeHtml5(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }

  // src/components/Notifications.js
  var ENDPOINT2 = "/.netlify/functions/notifs";
  var FETCH_TIMEOUT_MS3 = 1e4;
  function withTimeout3(promise, ms = FETCH_TIMEOUT_MS3) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(
        (v2) => {
          clearTimeout(t);
          resolve(v2);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }
  function getTgInitDataRaw2() {
    var _a4, _b;
    try {
      return typeof ((_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initData) === "string" ? window.Telegram.WebApp.initData : "";
    } catch (e) {
      return "";
    }
  }
  async function renderNotifications(onAfterMarkRead) {
    var _a4;
    const v2 = document.getElementById("view");
    if (!v2) return;
    let list = await fetchServerListSafe().catch(() => null);
    if (!Array.isArray(list)) list = getList();
    list = list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!list.length) {
      v2.innerHTML = `
      <div class="section-title">\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F</div>
      <div class="notes-empty">\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439. \u041C\u044B \u0441\u043E\u043E\u0431\u0449\u0438\u043C, \u043A\u043E\u0433\u0434\u0430 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043D\u043E\u0432\u043E\u0441\u0442\u0438 \u0438\u043B\u0438 \u0430\u043A\u0446\u0438\u0438.</div>
    `;
    } else {
      v2.innerHTML = `
      <div class="section-title">\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F</div>
      <section class="notes">
        ${list.map((n) => noteTpl(n)).join("")}
      </section>
    `;
    }
    if (list.some((n) => !n.read)) {
      const serverItems = await markAllServerSafe().catch(() => null);
      if (Array.isArray(serverItems) && serverItems.length) {
        const norm = serverItems.map((n) => normalize(n));
        setList(norm.sort((a, b) => (b.ts || 0) - (a.ts || 0)));
      } else {
        const updated = list.map((n) => __spreadProps(__spreadValues({}, n), { read: true }));
        setList(updated);
      }
      onAfterMarkRead && onAfterMarkRead();
    }
    ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
  }
  function noteTpl(n) {
    var _a4;
    const icon = n.icon || "bell";
    const d = new Date(n.ts || Date.now());
    const time = ((_a4 = d.toLocaleTimeString) == null ? void 0 : _a4.call(d, [], { hour: "2-digit", minute: "2-digit" })) || `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `
    <div class="note ${n.read ? "is-read" : ""}" data-id="${escapeAttr(n.id)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <div>
        <div class="note-title">${escapeHtml6(n.title || "")}</div>
        ${n.sub ? `<div class="note-sub">${escapeHtml6(n.sub)}</div>` : ""}
      </div>
      <div class="time">${escapeHtml6(time)}</div>
    </div>
  `;
  }
  function normalize(n) {
    return {
      id: String(n.id || Date.now()),
      ts: Number(n.ts || Date.now()),
      read: !!n.read,
      icon: String(n.icon || "bell"),
      title: String(n.title || ""),
      sub: String(n.sub || "")
    };
  }
  async function fetchServerListSafe() {
    const uid = getUID();
    if (!uid) return null;
    try {
      const r = await withTimeout3(fetch(`${ENDPOINT2}?op=list&uid=${encodeURIComponent(uid)}&ts=${Date.now()}`, {
        method: "GET",
        headers: { "X-Tg-Init-Data": getTgInitDataRaw2(), "Cache-Control": "no-store" }
      }));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j == null ? void 0 : j.ok) === false) return null;
      const items = Array.isArray(j.items) ? j.items : [];
      const norm = items.map(normalize);
      setList(norm);
      return norm;
    } catch (e) {
      return null;
    }
  }
  async function markAllServerSafe() {
    const uid = getUID();
    if (!uid) return null;
    try {
      const r = await withTimeout3(fetch(ENDPOINT2, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tg-Init-Data": getTgInitDataRaw2()
        },
        // ВАЖНО: оп должен быть строго в нижнем регистре — notifs.js ожидает 'markseen' / 'markmine'
        body: JSON.stringify({ op: "markseen", uid })
      }));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j == null ? void 0 : j.ok) === false) return null;
      return Array.isArray(j.items) ? j.items : null;
    } catch (e) {
      return null;
    }
  }
  function key() {
    return k("notifs_list");
  }
  function getList() {
    try {
      return JSON.parse(localStorage.getItem(key()) || "[]");
    } catch (e) {
      return [];
    }
  }
  function setList(list) {
    localStorage.setItem(key(), JSON.stringify(Array.isArray(list) ? list : []));
  }
  function escapeHtml6(s = "") {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escapeAttr(s = "") {
    return escapeHtml6(String(s));
  }

  // src/core/loyaltyAdmin.js
  var ENDPOINT3 = "/.netlify/functions/loyalty";
  function adminToken() {
    return (getAdminToken() || "").toString();
  }
  function normalizeOp2(op) {
    return String(op || "").trim().toLowerCase();
  }
  async function safeJson(res) {
    try {
      return await res.json();
    } catch (e) {
      return {};
    }
  }
  async function call(op, payload = {}, opts = {}) {
    var _a4;
    const { timeout = 15e3 } = opts;
    const headers = { "Content-Type": "application/json" };
    const token = adminToken();
    if (token) headers["X-Internal-Auth"] = token;
    const ctrl = new AbortController();
    const tId = setTimeout(() => ctrl.abort(), Math.max(1, timeout));
    let res, data;
    try {
      res = await fetch(ENDPOINT3, {
        method: "POST",
        headers,
        body: JSON.stringify(__spreadValues({ op: normalizeOp2(op) }, payload)),
        signal: ctrl.signal
      });
      data = await safeJson(res);
    } finally {
      clearTimeout(tId);
    }
    if (!(res == null ? void 0 : res.ok) || (data == null ? void 0 : data.ok) === false) {
      const status = (_a4 = res == null ? void 0 : res.status) != null ? _a4 : 0;
      const msg = (data == null ? void 0 : data.error) || (data == null ? void 0 : data.reason) || `loyalty admin api error (HTTP ${status})`;
      throw new Error(msg);
    }
    return data;
  }
  async function adminCalc(orderId) {
    const j = await call("admincalc", { orderId: String(orderId) });
    return j.calc || null;
  }
  async function getBalance(uid) {
    const j = await call("getbalance", { uid: String(uid) });
    return j.balance || { available: 0, pending: 0, history: [] };
  }
  async function confirmAccrual(uid, orderId) {
    const j = await call("confirmaccrual", { uid: String(uid), orderId: String(orderId) });
    return (j == null ? void 0 : j.ok) !== false;
  }

  // src/components/Admin.js
  function getStatusLabel3(s) {
    try {
      return getStatusLabel(s);
    } catch (e) {
      return String(s || "\u2014");
    }
  }
  var CASHBACK_RATE_BASE2 = 0.05;
  var CASHBACK_RATE_BOOST2 = 0.1;
  var REFERRER_RATE = 0.05;
  var MAX_DISCOUNT_SHARE2 = 0.3;
  var MAX_REDEEM_POINTS2 = 15e4;
  function computeOrderCalc(order) {
    const sum = Number((order == null ? void 0 : order.total) || 0);
    const maxRedeemByShare = Math.floor(sum * MAX_DISCOUNT_SHARE2);
    const maxRedeem = Math.min(maxRedeemByShare, MAX_REDEEM_POINTS2);
    const cbBase = Math.floor(sum * CASHBACK_RATE_BASE2);
    const cbBoost = Math.floor(sum * CASHBACK_RATE_BOOST2);
    const refEarn = Math.floor(sum * REFERRER_RATE);
    return {
      sum,
      maxRedeem,
      cashbackBase: cbBase,
      cashbackIfBoost: cbBoost,
      referrerEarnIfLinked: refEarn
    };
  }
  async function renderAdmin() {
    const v2 = document.getElementById("view");
    if (!v2) return;
    seedOrdersOnce();
    document.body.classList.add("admin-mode");
    const TABS = [
      { key: "new", label: "\u041D\u043E\u0432\u044B\u0435" },
      { key: "active", label: "\u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435" },
      { key: "done", label: "\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u044B\u0435" }
    ];
    let tab = "new";
    let mode = "list";
    let selectedId = null;
    let pollTimer = null;
    function startPolling() {
      stopPolling();
      pollTimer = setInterval(async () => {
        if (!document.body.classList.contains("admin-mode")) return;
        if (document.visibilityState === "hidden") return;
        if (mode !== "list") return;
        await getAll();
        render();
      }, 15e3);
    }
    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }
    const getAll = async () => {
      try {
        const orders = await getOrders();
        state.orders = Array.isArray(orders) ? orders : [];
        return state.orders;
      } catch (e) {
        state.orders = Array.isArray(state.orders) ? state.orders : [];
        return state.orders;
      }
    };
    const filterByTab = (list) => {
      const src = Array.isArray(list) ? list : [];
      if (tab === "new") return src.filter((o) => (o == null ? void 0 : o.status) === "\u043D\u043E\u0432\u044B\u0439" && !(o == null ? void 0 : o.accepted) && !(o == null ? void 0 : o.canceled));
      if (tab === "active") return src.filter((o) => !["\u043D\u043E\u0432\u044B\u0439", "\u0432\u044B\u0434\u0430\u043D", "\u043E\u0442\u043C\u0435\u043D\u0451\u043D"].includes(o == null ? void 0 : o.status));
      if (tab === "done") return src.filter((o) => ["\u0432\u044B\u0434\u0430\u043D", "\u043E\u0442\u043C\u0435\u043D\u0451\u043D"].includes(o == null ? void 0 : o.status));
      return src;
    };
    const currentProductsMap = () => {
      const map = /* @__PURE__ */ new Map();
      (state.products || []).forEach((p) => map.set(String(p.id), p));
      return map;
    };
    function shell(innerHTML) {
      var _a4, _b;
      v2.innerHTML = `
      <section class="section admin-shell">
        <div class="admin-head">
          <div class="admin-title"><i data-lucide="shield-check"></i><span>\u0410\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C</span></div>
        </div>

        <div class="admin-tabs" id="adminTabs" role="tablist" aria-label="\u0421\u0442\u0430\u0442\u0443\u0441\u044B \u0437\u0430\u043A\u0430\u0437\u043E\u0432">
          ${TABS.map((t) => `
            <button class="admin-tab ${tab === t.key ? "is-active" : ""}" data-k="${t.key}" role="tab" aria-selected="${tab === t.key}">${t.label}</button>
          `).join("")}
        </div>

        ${innerHTML}
      </section>
    `;
      ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
      (_b = document.getElementById("adminTabs")) == null ? void 0 : _b.addEventListener("click", (e) => {
        const b = e.target.closest(".admin-tab");
        if (!b) return;
        tab = b.getAttribute("data-k") || "new";
        mode = "list";
        selectedId = null;
        render();
      });
    }
    async function listView() {
      var _a4, _b;
      const orders = filterByTab(await getAll());
      const pmap = currentProductsMap();
      const html = orders.length ? `
      <div class="admin-list-mini" id="adminListMini">
        ${orders.map((o) => {
        var _a5, _b2, _c, _d;
        const items = Array.isArray(o == null ? void 0 : o.cart) ? o.cart : [];
        const itemsCount = items.reduce((s, x) => s + (Number(x == null ? void 0 : x.qty) || 0), 0) || ((o == null ? void 0 : o.qty) || 0) || (items.length || 0);
        const calcSum = items.reduce((s, x) => s + (Number(x == null ? void 0 : x.price) || 0) * (Number(x == null ? void 0 : x.qty) || 0), 0);
        const total = Number.isFinite(Number(o == null ? void 0 : o.total)) ? Number(o.total) : calcSum;
        const totalFmt = priceFmt(total);
        const prod = pmap.get(String(o == null ? void 0 : o.productId));
        const singleTitle = ((_a5 = items[0]) == null ? void 0 : _a5.title) || (prod == null ? void 0 : prod.title) || "\u0422\u043E\u0432\u0430\u0440";
        const nameLineRaw = items.length > 1 || itemsCount > 1 ? `${itemsCount} ${plural(itemsCount, "\u0442\u043E\u0432\u0430\u0440", "\u0442\u043E\u0432\u0430\u0440\u0430", "\u0442\u043E\u0432\u0430\u0440\u043E\u0432")}` : singleTitle;
        return `
            <article class="order-mini" data-id="${escapeHtml7(String((_b2 = o == null ? void 0 : o.id) != null ? _b2 : ""))}" tabindex="0" role="button" aria-label="\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043A\u0430\u0437 #${escapeHtml7(String((_c = o == null ? void 0 : o.id) != null ? _c : ""))}">
              <div class="order-mini__left">
                <div class="order-mini__sum">${totalFmt}</div>
                <div class="muted mini" style="margin-top:4px">${escapeHtml7(nameLineRaw)}</div>
                <div class="order-mini__meta">
                  <span class="chip-id">#${escapeHtml7(String((_d = o == null ? void 0 : o.id) != null ? _d : ""))}</span>
                  <span class="chip-user">@${escapeHtml7((o == null ? void 0 : o.username) || "\u2014")}</span>
                  <span class="muted mini">\xB7 ${escapeHtml7(getStatusLabel3(o == null ? void 0 : o.status))}</span>
                </div>
              </div>
              <div class="order-mini__right">
                <i class="arrow" aria-hidden="true"></i>
              </div>
            </article>
          `;
      }).join("")}
      </div>
    ` : `
      <div class="admin-empty">
        <i data-lucide="inbox"></i>
        <div>\u0412 \u044D\u0442\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u043A\u0430\u0437\u043E\u0432</div>
      </div>
    `;
      shell(html);
      const hook = (card) => {
        if (!card) return;
        selectedId = card.getAttribute("data-id");
        if (!selectedId) return;
        mode = "detail";
        render();
      };
      (_a4 = document.getElementById("adminListMini")) == null ? void 0 : _a4.addEventListener("click", (e) => hook(e.target.closest(".order-mini")));
      (_b = document.getElementById("adminListMini")) == null ? void 0 : _b.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const card = e.target.closest(".order-mini");
          if (!card) return;
          e.preventDefault();
          hook(card);
        }
      });
      startPolling();
    }
    function itemsBlock2(o) {
      const items = Array.isArray(o == null ? void 0 : o.cart) ? o.cart : [];
      if (!items.length) return `
      <div class="muted" style="margin-top:12px">\u0412 \u0437\u0430\u043A\u0430\u0437\u0435 \u043D\u0435\u0442 \u043F\u043E\u0437\u0438\u0446\u0438\u0439</div>
    `;
      const rows = items.map((x, i) => {
        const opts = [
          (x == null ? void 0 : x.size) ? `\u0420\u0430\u0437\u043C\u0435\u0440: ${escapeHtml7(String(x.size))}` : "",
          (x == null ? void 0 : x.color) ? `\u0426\u0432\u0435\u0442: <span title="${escapeHtml7(String(x.color))}">${escapeHtml7(humanColorName(x.color))}</span>` : ""
        ].filter(Boolean).join(" \xB7 ");
        const line = Number((x == null ? void 0 : x.qty) || 0) * Number((x == null ? void 0 : x.price) || 0);
        return `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>
            <div class="cart-title" style="font-weight:600">${escapeHtml7((x == null ? void 0 : x.title) || "\u0422\u043E\u0432\u0430\u0440")}</div>
            ${opts ? `<div class="muted mini">${opts}</div>` : ""}
          </td>
          <td style="text-align:right">${escapeHtml7(String((x == null ? void 0 : x.qty) || 0))}</td>
          <td style="text-align:right">${priceFmt(Number((x == null ? void 0 : x.price) || 0))}</td>
          <td style="text-align:right"><b>${priceFmt(line)}</b></td>
        </tr>
      `;
      }).join("");
      return `
      <div class="subsection-title" style="margin-top:14px">\u0421\u043E\u0441\u0442\u0430\u0432 \u0437\u0430\u043A\u0430\u0437\u0430</div>
      <div class="table-wrap">
        <table class="size-table">
          <thead>
            <tr>
              <th>#</th>
              <th>\u0422\u043E\u0432\u0430\u0440</th>
              <th style="text-align:right">\u041A\u043E\u043B-\u0432\u043E</th>
              <th style="text-align:right">\u0426\u0435\u043D\u0430</th>
              <th style="text-align:right">\u0421\u0443\u043C\u043C\u0430</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right">\u0418\u0442\u043E\u0433\u043E</td>
              <td style="text-align:right"><b>${priceFmt(Number((o == null ? void 0 : o.total) || 0))}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    }
    function calcBlock(o) {
      const c = computeOrderCalc(o);
      return `
      <div class="subsection-title" style="margin-top:14px">\u0414\u0430\u0448\u0431\u043E\u0440\u0434 \u0440\u0430\u0441\u0447\u0451\u0442\u043E\u0432 (\u0431\u0430\u0437\u043E\u0432\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C)</div>
      <div class="table-wrap">
        <table class="size-table">
          <tbody>
            <tr><td>\u0421\u0443\u043C\u043C\u0430 \u043A \u043E\u043F\u043B\u0430\u0442\u0435</td><td style="text-align:right"><b>${priceFmt(c.sum)}</b></td></tr>
            <tr><td>\u041C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E \u043C\u043E\u0436\u043D\u043E \u0441\u043F\u0438\u0441\u0430\u0442\u044C \u0431\u0430\u043B\u043B\u0430\u043C\u0438 (30%, \u2264150\u043A)</td><td style="text-align:right">${priceFmt(c.maxRedeem)}</td></tr>
            <tr><td>\u041A\u044D\u0448\u0431\u0435\u043A (\u0431\u0430\u0437\u0430 5%)</td><td style="text-align:right">+${c.cashbackBase.toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432</td></tr>
            <tr><td>\u041A\u044D\u0448\u0431\u0435\u043A \u043F\u0440\u0438 x2 (1-\u0439 \u0437\u0430\u043A\u0430\u0437 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u0430)</td><td style="text-align:right">+${c.cashbackIfBoost.toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432</td></tr>
            <tr><td>\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u0438\u043D\u0432\u0430\u0439\u0442\u0435\u0440\u0443 (\u0435\u0441\u043B\u0438 \u0435\u0441\u0442\u044C \u0441\u0432\u044F\u0437\u043A\u0430)</td><td style="text-align:right">+${c.referrerEarnIfLinked.toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432</td></tr>
          </tbody>
        </table>
      </div>
      <div class="muted mini" style="margin-top:6px">
        \u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u0435: \u0430\u043D\u0442\u0438\u0444\u0440\u043E\u0434 \u0431\u043B\u043E\u043A\u0438\u0440\u0443\u0435\u0442 \u0441\u0430\u043C\u043E\u0440\u0435\u0444\u0435\u0440\u0430\u043B\u044B, \u043B\u0438\u043C\u0438\u0442\u0438\u0440\u0443\u0435\u0442 10 \u043D\u043E\u0432\u044B\u0445 \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u043E\u0432/\u043C\u0435\u0441 \u0438 \u0432\u044B\u0434\u0430\u0451\u0442 \u043A\u044D\u0448\u0431\u0435\u043A \u0447\u0435\u0440\u0435\u0437 24\u0447.
      </div>
    `;
    }
    function realLoyaltyBlock(o, calc, balance) {
      if (!calc) {
        return `
        <div class="subsection-title" style="margin-top:14px">\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043B\u043E\u044F\u043B\u044C\u043D\u043E\u0441\u0442\u0438</div>
        <div class="muted">\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u043E \u044D\u0442\u043E\u043C\u0443 \u0437\u0430\u043A\u0430\u0437\u0443.</div>
      `;
      }
      const usedPts = Number((calc == null ? void 0 : calc.usedPoints) || 0);
      const paidShare = Number(o == null ? void 0 : o.total) > 0 && usedPts > 0 ? Math.round(100 * usedPts / Number(o.total)) : 0;
      const refText = (calc == null ? void 0 : calc.referrer) ? `\u0434\u0430 (\u0438\u043D\u0432\u0430\u0439\u0442\u0435\u0440: <code>${escapeHtml7(String(calc.referrer))}</code>)` : "\u043D\u0435\u0442";
      const released = (calc == null ? void 0 : calc.pendingReleased) === true;
      return `
      <div class="subsection-title" style="margin-top:14px">\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043B\u043E\u044F\u043B\u044C\u043D\u043E\u0441\u0442\u0438</div>
      <div class="table-wrap">
        <table class="size-table">
          <tbody>
            <tr><td>UID \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044F</td><td style="text-align:right"><code>${escapeHtml7(String((calc == null ? void 0 : calc.uid) || (o == null ? void 0 : o.userId) || "\u2014"))}</code></td></tr>
            <tr><td>\u0420\u0435\u0444\u0435\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u043A\u0430</td><td style="text-align:right">${refText}</td></tr>
            <tr><td>\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E \u0431\u0430\u043B\u043B\u0430\u043C\u0438</td><td style="text-align:right">\u2212${usedPts.toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432${paidShare ? ` (${paidShare}%)` : ""}</td></tr>
            <tr><td>\u041A\u044D\u0448\u0431\u0435\u043A \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044E \u0437\u0430 \u044D\u0442\u043E\u0442 \u0437\u0430\u043A\u0430\u0437</td><td style="text-align:right">+${Number((calc == null ? void 0 : calc.buyerCashback) || 0).toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432</td></tr>
            <tr><td>\u0411\u043E\u043D\u0443\u0441 \u0438\u043D\u0432\u0430\u0439\u0442\u0435\u0440\u0443</td><td style="text-align:right">+${Number((calc == null ? void 0 : calc.referrerBonus) || 0).toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432</td></tr>
            <tr><td>\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u043F\u0435\u0440\u0435\u0432\u0435\u0434\u0435\u043D\u044B \u0438\u0437 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u044F</td><td style="text-align:right">${released ? "\u0434\u0430" : "\u043D\u0435\u0442"}</td></tr>
            <tr><td>\u0411\u0430\u043B\u0430\u043D\u0441 \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044F (\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E)</td><td style="text-align:right"><b>${Number((balance == null ? void 0 : balance.available) || 0).toLocaleString("ru-RU")}</b> \u0431\u0430\u043B\u043B\u043E\u0432</td></tr>
            <tr><td>\u0411\u0430\u043B\u0430\u043D\u0441 \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044F (\u0432 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0438)</td><td style="text-align:right">${Number((balance == null ? void 0 : balance.pending) || 0).toLocaleString("ru-RU")} \u0431\u0430\u043B\u043B\u043E\u0432</td></tr>
          </tbody>
        </table>
      </div>
      ${released ? "" : `
        <div class="muted mini" style="margin:8px 0 0">\u041C\u043E\u0436\u043D\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0432\u0440\u0443\u0447\u043D\u0443\u044E, \u0435\u0441\u043B\u0438 \u0437\u0430\u043A\u0430\u0437 \u0432\u044B\u0434\u0430\u043D.</div>
        <button class="btn btn--sm" id="btnConfirmAccrual" data-uid="${escapeHtml7(String((calc == null ? void 0 : calc.uid) || (o == null ? void 0 : o.userId) || ""))}" data-oid="${escapeHtml7(String((calc == null ? void 0 : calc.orderId) || (o == null ? void 0 : o.id) || ""))}">
          \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F (pending \u2192 available)
        </button>
      `}
    `;
    }
    async function detailView() {
      var _a4, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
      stopPolling();
      const orders = await getAll();
      const o = orders.find((x) => String(x == null ? void 0 : x.id) === String(selectedId));
      if (!o) {
        mode = "list";
        return listView();
      }
      const items = Array.isArray(o == null ? void 0 : o.cart) ? o.cart : [];
      const itemsCount = items.reduce((s, x) => s + (Number(x == null ? void 0 : x.qty) || 0), 0) || ((o == null ? void 0 : o.qty) || 0) || (items.length || 0);
      const calcSum = items.reduce((s, x) => s + (Number(x == null ? void 0 : x.price) || 0) * (Number(x == null ? void 0 : x.qty) || 0), 0);
      const total = Number.isFinite(Number(o == null ? void 0 : o.total)) ? Number(o.total) : calcSum;
      const totalFmt = priceFmt(total);
      const titleText = items.length > 1 || itemsCount > 1 ? `${itemsCount} ${plural(itemsCount, "\u0442\u043E\u0432\u0430\u0440", "\u0442\u043E\u0432\u0430\u0440\u0430", "\u0442\u043E\u0432\u0430\u0440\u043E\u0432")} \xB7 <span class="muted">${totalFmt}</span>` : `${escapeHtml7(((_a4 = items[0]) == null ? void 0 : _a4.title) || "\u0422\u043E\u0432\u0430\u0440")} \xB7 <span class="muted">${totalFmt}</span>`;
      const isNew = (o == null ? void 0 : o.status) === "\u043D\u043E\u0432\u044B\u0439" && !(o == null ? void 0 : o.accepted);
      const isDone = ["\u0432\u044B\u0434\u0430\u043D", "\u043E\u0442\u043C\u0435\u043D\u0451\u043D"].includes(o == null ? void 0 : o.status);
      let loyaltyCalc = null;
      let buyerBal = null;
      try {
        loyaltyCalc = await adminCalc(o.id);
        buyerBal = await getBalance((loyaltyCalc == null ? void 0 : loyaltyCalc.uid) || (o == null ? void 0 : o.userId));
      } catch (e) {
      }
      shell(`
      <div class="order-detail">
        <div class="order-detail__top">
          <button id="backToList" class="btn-ghost" aria-label="\u041D\u0430\u0437\u0430\u0434 \u043A \u0441\u043F\u0438\u0441\u043A\u0443">
            <i data-lucide="arrow-left"></i><span>\u041D\u0430\u0437\u0430\u0434</span>
          </button>
          <div class="order-detail__title">${titleText}</div>
        </div>

        <div class="order-detail__body">
          <dl class="kv kv--detail">
            <div class="kv__row">
              <dt>\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u043A\u0430\u0437\u0430</dt>
              <dd>#${escapeHtml7(String((_b = o == null ? void 0 : o.id) != null ? _b : ""))}</dd>
            </div>
            <div class="kv__row">
              <dt>\u041A\u043B\u0438\u0435\u043D\u0442</dt>
              <dd>@${escapeHtml7((o == null ? void 0 : o.username) || "\u2014")}</dd>
            </div>
            <div class="kv__row">
              <dt>\u0422\u0435\u043B\u0435\u0444\u043E\u043D</dt>
              <dd>${escapeHtml7((o == null ? void 0 : o.phone) || "\u2014")}</dd>
            </div>
            <div class="kv__row">
              <dt>\u0410\u0434\u0440\u0435\u0441</dt>
              <dd class="break">${escapeHtml7((o == null ? void 0 : o.address) || "\u2014")}</dd>
            </div>
            <div class="kv__row">
              <dt>\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A</dt>
              <dd class="break">${escapeHtml7((o == null ? void 0 : o.payerFullName) || "\u2014")}</dd>
            </div>
            <div class="kv__row">
              <dt>\u0421\u0443\u043C\u043C\u0430</dt>
              <dd>${priceFmt(Number((o == null ? void 0 : o.total) || 0))}</dd>
            </div>
            <div class="kv__row">
              <dt>\u0421\u0442\u0430\u0442\u0443\u0441</dt>
              <dd>${escapeHtml7(getStatusLabel3(o == null ? void 0 : o.status))}</dd>
            </div>
            ${(o == null ? void 0 : o.status) === "\u043E\u0442\u043C\u0435\u043D\u0451\u043D" ? `
              <div class="kv__row">
                <dt>\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B</dt>
                <dd class="break">${escapeHtml7((o == null ? void 0 : o.cancelReason) || "\u2014")}</dd>
              </div>` : ""}
            <div class="kv__row">
              <dt>\u0427\u0435\u043A</dt>
              <dd>
                ${(o == null ? void 0 : o.paymentScreenshot) ? `
                  <div class="receipt-actions">
                    <button class="btn btn--sm btn--outline" data-open="${escapeHtml7(String(o.paymentScreenshot))}">
                      <i data-lucide="external-link"></i><span>&nbsp;\u041E\u0442\u043A\u0440\u044B\u0442\u044C</span>
                    </button>
                    <button class="btn btn--sm btn--primary" data-download="${escapeHtml7(String(o.paymentScreenshot))}" data-oid="${escapeHtml7(String((_c = o == null ? void 0 : o.id) != null ? _c : ""))}">
                      <i data-lucide="download"></i><span>&nbsp;\u0421\u043A\u0430\u0447\u0430\u0442\u044C</span>
                    </button>
                  </div>
                ` : "\u2014"}
              </dd>
            </div>
          </dl>

          ${calcBlock(o)}
          ${realLoyaltyBlock(o, loyaltyCalc, buyerBal)}
          ${itemsBlock2(o)}

          <div class="order-detail__actions">
            ${isNew ? `
              <button class="btn btn--primary" id="btnAccept" data-id="${escapeHtml7(String((_d = o == null ? void 0 : o.id) != null ? _d : ""))}">\u041F\u0440\u0438\u043D\u044F\u0442\u044C</button>
              <button class="btn btn--outline" id="btnCancel" data-id="${escapeHtml7(String((_e = o == null ? void 0 : o.id) != null ? _e : ""))}">\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C</button>
            ` : ""}

            ${!isNew && !isDone ? `
              <div class="stage-list" id="stageList" role="group" aria-label="\u042D\u0442\u0430\u043F\u044B \u0437\u0430\u043A\u0430\u0437\u0430">
                ${ORDER_STATUSES.filter((s) => !["\u043D\u043E\u0432\u044B\u0439", "\u043E\u0442\u043C\u0435\u043D\u0451\u043D"].includes(s)).map((s) => `
                  <button class="stage-btn ${(o == null ? void 0 : o.status) === s ? "is-active" : ""}" data-st="${escapeHtml7(s)}">${getStatusLabel3(s)}</button>
                `).join("")}
              </div>
            ` : ""}

            ${isDone ? '<span class="muted mini">\u0417\u0430\u043A\u0430\u0437 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D</span>' : ""}
          </div>
        </div>
      </div>
    `);
      ((_f = window.lucide) == null ? void 0 : _f.createIcons) && lucide.createIcons();
      (_g = document.getElementById("backToList")) == null ? void 0 : _g.addEventListener("click", () => {
        mode = "list";
        selectedId = null;
        render();
      });
      (_h = document.querySelector("[data-open]")) == null ? void 0 : _h.addEventListener("click", (e) => {
        const url = e.currentTarget.getAttribute("data-open") || "";
        openReceiptPreview(url);
      });
      (_i = document.querySelector("[data-download]")) == null ? void 0 : _i.addEventListener("click", async (e) => {
        const url = e.currentTarget.getAttribute("data-download") || "";
        const oid = e.currentTarget.getAttribute("data-oid") || "receipt";
        await triggerDownload(url, suggestReceiptFilename(url, oid));
      });
      const btnAccept = document.getElementById("btnAccept");
      btnAccept == null ? void 0 : btnAccept.addEventListener("click", async () => {
        if (btnAccept.disabled) return;
        btnAccept.disabled = true;
        try {
          await acceptOrder(o.id);
          dispatchGlobal("orders:updated");
          dispatchGlobal("admin:orderAccepted", { id: o.id, userId: o.userId });
          mode = "detail";
          selectedId = o.id;
          await render();
        } finally {
          btnAccept.disabled = false;
        }
      });
      const btnCancel = document.getElementById("btnCancel");
      btnCancel == null ? void 0 : btnCancel.addEventListener("click", async () => {
        if (btnCancel.disabled) return;
        const reason = prompt("\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B (\u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u043D\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0443):") || "";
        btnCancel.disabled = true;
        try {
          await cancelOrder(o.id, reason);
          dispatchGlobal("orders:updated");
          dispatchGlobal("admin:orderCanceled", { id: o.id, reason, userId: o.userId });
          mode = "list";
          tab = "done";
          render();
        } finally {
          btnCancel.disabled = false;
        }
      });
      (_j = document.getElementById("stageList")) == null ? void 0 : _j.addEventListener("click", async (e) => {
        const btn = e.target.closest(".stage-btn");
        if (!btn) return;
        const st = btn.getAttribute("data-st");
        if (!st) return;
        const prevText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "...";
        try {
          await updateOrderStatus(o.id, st);
          dispatchGlobal("orders:updated");
          dispatchGlobal("admin:statusChanged", { id: o.id, status: st, userId: o.userId });
          if (st === "\u0432\u044B\u0434\u0430\u043D") {
            mode = "list";
            tab = "done";
          }
          render();
        } finally {
          btn.disabled = false;
          btn.textContent = prevText;
        }
      });
      (_k = document.getElementById("btnConfirmAccrual")) == null ? void 0 : _k.addEventListener("click", async (e) => {
        const uid = e.currentTarget.getAttribute("data-uid") || "";
        const oid = e.currentTarget.getAttribute("data-oid") || "";
        if (!uid || !oid) return;
        const prev = e.currentTarget.textContent;
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u043C...";
        try {
          await confirmAccrual(uid, oid);
          alert("\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B.");
        } catch (err) {
          alert("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F: " + ((err == null ? void 0 : err.message) || err));
        } finally {
          e.currentTarget.disabled = false;
          e.currentTarget.textContent = prev;
        }
        dispatchGlobal("orders:updated");
        render();
      });
    }
    async function render() {
      if (mode === "detail") await detailView();
      else await listView();
    }
    const rerenderOnOrders = () => render();
    window.addEventListener("admin:refresh", rerenderOnOrders);
    window.addEventListener("orders:updated", rerenderOnOrders);
    await render();
  }
  function dispatchGlobal(name, detail = null) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (e) {
    }
  }
  function openReceiptPreview(url = "") {
    var _a4, _b;
    if (!url) return;
    const modal = document.getElementById("modal");
    const mb = document.getElementById("modalBody");
    const mt = document.getElementById("modalTitle");
    const ma = document.getElementById("modalActions");
    if (!modal || !mb || !mt || !ma) {
      return safeOpenInNewTab(url);
    }
    mt.textContent = "\u0427\u0435\u043A \u043E\u043F\u043B\u0430\u0442\u044B";
    ma.innerHTML = `<button id="rcClose" class="pill">\u0417\u0430\u043A\u0440\u044B\u0442\u044C</button>
                  <a id="rcDownload" class="pill primary" href="${escapeHtml7(url)}" download>\u0421\u043A\u0430\u0447\u0430\u0442\u044C</a>`;
    const isPdf = isProbablyPdf(url);
    mb.innerHTML = isPdf ? `
      <div class="receipt-view">
        <div class="receipt-img-wrap" style="aspect-ratio:auto">
          <iframe src="${escapeHtml7(url)}" title="\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 PDF" style="width:100%;height:70vh;border:0;border-radius:12px;background:#f8f8f8"></iframe>
        </div>
      </div>` : `
      <div class="receipt-view">
        <div class="receipt-img-wrap">
          <img class="receipt-img" src="${escapeHtml7(url)}" alt="\u0427\u0435\u043A \u043E\u043F\u043B\u0430\u0442\u044B">
        </div>
      </div>`;
    modal.classList.add("show");
    const close = () => modal.classList.remove("show");
    (_a4 = document.getElementById("modalClose")) == null ? void 0 : _a4.addEventListener("click", close, { once: true });
    (_b = document.getElementById("rcClose")) == null ? void 0 : _b.addEventListener("click", close, { once: true });
    const onKey = (e) => {
      if (e.key === "Escape") {
        close();
        window.removeEventListener("keydown", onKey);
      }
    };
    window.addEventListener("keydown", onKey);
  }
  function isProbablyPdf(url = "") {
    if (/^data:/i.test(url)) return /^data:application\/pdf/i.test(url);
    try {
      const u = new URL(url, location.href);
      const path = (u.pathname || "").toLowerCase();
      const type = (u.searchParams.get("type") || "").toLowerCase();
      const dl = (u.searchParams.get("dl") || "").toLowerCase();
      return path.endsWith(".pdf") || type === "pdf" || dl === "pdf";
    } catch (e) {
      return /\.pdf(\?|$)/i.test(url);
    }
  }
  function safeOpenInNewTab(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
    }
  }
  async function triggerDownload(url, filename = "receipt.jpg") {
    if (!url) return;
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      try {
        const resp = await fetch(url, { mode: "cors" });
        const blob = await resp.blob();
        const ext = extensionFromMime(blob.type) || filename.split(".").pop() || "jpg";
        const name = ensureExt(filename, ext);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2e3);
      } catch (e2) {
        safeOpenInNewTab(url);
      }
    }
  }
  function suggestReceiptFilename(url, orderId = "") {
    if (/^data:/i.test(url)) {
      const m = /^data:([^;,]+)/i.exec(url);
      const ext = extensionFromMime((m == null ? void 0 : m[1]) || "") || "jpg";
      return `receipt_${orderId || "order"}.${ext}`;
    }
    try {
      const u = new URL(url, location.href);
      const last = (u.pathname.split("/").pop() || "").split("?")[0];
      if (last) return last;
    } catch (e) {
    }
    return `receipt_${orderId || "order"}.jpg`;
  }
  function extensionFromMime(mime = "") {
    const map = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/bmp": "bmp",
      "image/heic": "heic",
      "image/heif": "heif",
      "application/pdf": "pdf"
    };
    return map[(mime || "").toLowerCase()] || "";
  }
  function ensureExt(name, ext) {
    if (!ext) return name;
    const low = name.toLowerCase();
    if (low.endsWith(`.${ext.toLowerCase()}`)) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    return `${base}.${ext}`;
  }
  function escapeHtml7(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
  function plural(n, one, few, many) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }
  function humanColorName(value) {
    if (!value && value !== 0) return "";
    const s = String(value).trim();
    const low = s.toLowerCase();
    if (COLOR_EN_RU[low]) return COLOR_EN_RU[low];
    if (COLOR_RU[low]) return COLOR_RU[low];
    const rgb = parseAnyColorToRgb(s);
    if (!rgb) return s;
    const { r, g, b } = rgb;
    const { h, l, sat } = rgbToHsl(r, g, b);
    if (sat < 10) {
      if (l >= 95) return "\u0431\u0435\u043B\u044B\u0439";
      if (l <= 8) return "\u0447\u0451\u0440\u043D\u044B\u0439";
      if (l < 30) return "\u0442\u0451\u043C\u043D\u043E-\u0441\u0435\u0440\u044B\u0439";
      if (l > 75) return "\u0441\u0432\u0435\u0442\u043B\u043E-\u0441\u0435\u0440\u044B\u0439";
      return "\u0441\u0435\u0440\u044B\u0439";
    }
    if (h >= 10 && h <= 40 && l < 55 && sat > 20) {
      if (l < 30) return "\u0442\u0451\u043C\u043D\u043E-\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439";
      return "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439";
    }
    const base = hueToRu(h);
    if (l >= 78) return `\u0441\u0432\u0435\u0442\u043B\u043E-${base}`;
    if (l <= 22) return `\u0442\u0451\u043C\u043D\u043E-${base}`;
    return base;
  }
  var COLOR_RU = {
    "\u0447\u0451\u0440\u043D\u044B\u0439": "\u0447\u0451\u0440\u043D\u044B\u0439",
    "\u0447\u0435\u0440\u043D\u044B\u0439": "\u0447\u0451\u0440\u043D\u044B\u0439",
    "\u0431\u0435\u043B\u044B\u0439": "\u0431\u0435\u043B\u044B\u0439",
    "\u0441\u0435\u0440\u044B\u0439": "\u0441\u0435\u0440\u044B\u0439",
    "\u043A\u0440\u0430\u0441\u043D\u044B\u0439": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
    "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439": "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439",
    "\u0436\u0451\u043B\u0442\u044B\u0439": "\u0436\u0451\u043B\u0442\u044B\u0439",
    "\u0436\u0435\u043B\u0442\u044B\u0439": "\u0436\u0451\u043B\u0442\u044B\u0439",
    "\u0437\u0435\u043B\u0451\u043D\u044B\u0439": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
    "\u0437\u0435\u043B\u0435\u043D\u044B\u0439": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
    "\u0433\u043E\u043B\u0443\u0431\u043E\u0439": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
    "\u0441\u0438\u043D\u0438\u0439": "\u0441\u0438\u043D\u0438\u0439",
    "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
    "\u0440\u043E\u0437\u043E\u0432\u044B\u0439": "\u0440\u043E\u0437\u043E\u0432\u044B\u0439",
    "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
    "\u0431\u0435\u0436\u0435\u0432\u044B\u0439": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
    "\u0431\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439": "\u0431\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439",
    "\u0445\u0430\u043A\u0438": "\u0445\u0430\u043A\u0438",
    "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439",
    "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439": "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439",
    "\u0438\u043D\u0434\u0438\u0433\u043E": "\u0438\u043D\u0434\u0438\u0433\u043E"
  };
  var COLOR_EN_RU = {
    "black": "\u0447\u0451\u0440\u043D\u044B\u0439",
    "white": "\u0431\u0435\u043B\u044B\u0439",
    "gray": "\u0441\u0435\u0440\u044B\u0439",
    "grey": "\u0441\u0435\u0440\u044B\u0439",
    "red": "\u043A\u0440\u0430\u0441\u043D\u044B\u0439",
    "orange": "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439",
    "yellow": "\u0436\u0451\u043B\u0442\u044B\u0439",
    "green": "\u0437\u0435\u043B\u0451\u043D\u044B\u0439",
    "blue": "\u0441\u0438\u043D\u0438\u0439",
    "navy": "\u0442\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439",
    "skyblue": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
    "cyan": "\u0433\u043E\u043B\u0443\u0431\u043E\u0439",
    "teal": "\u0431\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439",
    "turquoise": "\u0431\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439",
    "purple": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
    "violet": "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439",
    "magenta": "\u043F\u0443\u0440\u043F\u0443\u0440\u043D\u044B\u0439",
    "pink": "\u0440\u043E\u0437\u043E\u0432\u044B\u0439",
    "brown": "\u043A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439",
    "beige": "\u0431\u0435\u0436\u0435\u0432\u044B\u0439",
    "khaki": "\u0445\u0430\u043A\u0438",
    "olive": "\u043E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439",
    "maroon": "\u0431\u043E\u0440\u0434\u043E\u0432\u044B\u0439",
    "indigo": "\u0438\u043D\u0434\u0438\u0433\u043E"
  };
  function parseAnyColorToRgb(str) {
    const s = str.trim();
    const m3 = /^#([0-9a-f]{3})$/i.exec(s);
    if (m3) {
      const h = m3[1];
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16)
      };
    }
    const m6 = /^#([0-9a-f]{6})$/i.exec(s);
    if (m6) {
      const h = m6[1];
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
      };
    }
    const mrgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(s);
    if (mrgb) {
      return {
        r: clamp2552(Number(mrgb[1])),
        g: clamp2552(Number(mrgb[2])),
        b: clamp2552(Number(mrgb[3]))
      };
    }
    const low = s.toLowerCase();
    if (COLOR_EN_RU[low] || COLOR_RU[low]) {
      return null;
    }
    return null;
  }
  function clamp2552(n) {
    n = Math.round(n);
    if (n < 0) return 0;
    if (n > 255) return 255;
    return n;
  }
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = 0;
      s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100, sat: s * 100 };
  }
  function hueToRu(h) {
    if (h < 0) h = 0;
    if (h <= 15 || h >= 345) return "\u043A\u0440\u0430\u0441\u043D\u044B\u0439";
    if (h <= 35) return "\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439";
    if (h <= 60) return "\u0436\u0451\u043B\u0442\u044B\u0439";
    if (h <= 85) return "\u043B\u0430\u0439\u043C\u043E\u0432\u044B\u0439";
    if (h <= 165) return "\u0437\u0435\u043B\u0451\u043D\u044B\u0439";
    if (h <= 190) return "\u0431\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439";
    if (h <= 210) return "\u0433\u043E\u043B\u0443\u0431\u043E\u0439";
    if (h <= 240) return "\u0441\u0438\u043D\u0438\u0439";
    if (h <= 265) return "\u0438\u043D\u0434\u0438\u0433\u043E";
    if (h <= 285) return "\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439";
    if (h <= 320) return "\u043F\u0443\u0440\u043F\u0443\u0440\u043D\u044B\u0439";
    return "\u0440\u043E\u0437\u043E\u0432\u044B\u0439";
  }

  // src/views/RefBridge.js
  function renderRefBridge() {
    const v2 = document.getElementById("view");
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const start = params.get("start") || "";
    const inviter = params.get("ref") || (start.startsWith("ref_") ? start.slice(4) : "");
    const startParam = start || (inviter ? `ref_${inviter}` : "");
    const tgUrl = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(startParam)}`;
    const tgNative = `tg://resolve?domain=${BOT_USERNAME}&start=${encodeURIComponent(startParam)}`;
    v2.innerHTML = `
    <section class="section">
      <div class="section-title">\u0420\u0435\u0444\u0435\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430</div>
      <p class="muted">\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u0432 Telegram, \u0447\u0442\u043E\u0431\u044B \u0431\u043E\u043D\u0443\u0441\u044B \u0431\u044B\u043B\u0438 \u0437\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.</p>
      <div style="display:flex;gap:10px;margin-top:10px">
        <a class="pill primary" href="${tgUrl}">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 Telegram</a>
        <a class="pill" href="${tgUrl}" target="_blank" rel="noopener">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435</a>
      </div>
      <p class="mini muted" style="margin-top:8px">\u0415\u0441\u043B\u0438 Telegram \u043D\u0435 \u043E\u0442\u043A\u0440\u044B\u043B\u0441\u044F \u2014 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 Telegram\xBB \u0435\u0449\u0451 \u0440\u0430\u0437.</p>
    </section>
  `;
    try {
      const a = document.createElement("a");
      a.href = tgNative;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 400);
    } catch (e) {
    }
  }

  // src/main.js
  var POINTS_MATURITY_MS3 = 24 * 60 * 60 * 1e3;
  function k5(base) {
    var _a4;
    try {
      const uid = ((_a4 = getUID) == null ? void 0 : _a4()) || "guest";
      return `${base}__${uid}`;
    } catch (e) {
      return `${base}__guest`;
    }
  }
  function readWallet() {
    try {
      const w = JSON.parse(localStorage.getItem(k5("points_wallet")) || "{}");
      return {
        available: Math.max(0, Number(w.available || 0) | 0),
        pending: Array.isArray(w.pending) ? w.pending : [],
        history: Array.isArray(w.history) ? w.history : []
      };
    } catch (e) {
      return { available: 0, pending: [], history: [] };
    }
  }
  function writeWallet(w) {
    localStorage.setItem(k5("points_wallet"), JSON.stringify(w || { available: 0, pending: [], history: [] }));
  }
  function settleMatured() {
    const w = readWallet();
    const now2 = Date.now();
    let changed = false;
    const keep = [];
    for (const p of w.pending) {
      if ((p.tsUnlock || 0) <= now2) {
        w.available += Math.max(0, Number(p.pts) || 0);
        w.history.unshift({ ts: now2, type: "accrue", pts: p.pts | 0, reason: p.reason || "\u041A\u044D\u0448\u0431\u0435\u043A", orderId: p.orderId || null });
        changed = true;
      } else keep.push(p);
    }
    if (changed) {
      w.pending = keep;
      writeWallet(w);
    }
  }
  function makeDisplayOrderIdFromParts(orderId, shortId) {
    const s = String(shortId || "").trim();
    if (s) return s.toUpperCase();
    const full = String(orderId || "").trim();
    return full ? full.slice(-6).toUpperCase() : "";
  }
  function makeDisplayOrderId(order) {
    return makeDisplayOrderIdFromParts(order == null ? void 0 : order.id, order == null ? void 0 : order.shortId);
  }
  var NOTIF_API = "/.netlify/functions/notifs";
  var USER_JOIN_API = "/.netlify/functions/user-join";
  function getTgInitDataRaw3() {
    var _a4, _b;
    try {
      return typeof ((_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initData) === "string" ? window.Telegram.WebApp.initData : "";
    } catch (e) {
      return "";
    }
  }
  async function notifApiList(uid) {
    const url = `${NOTIF_API}?op=list&uid=${encodeURIComponent(uid)}`;
    const res = await fetch(url, { method: "GET", headers: { "X-Tg-Init-Data": getTgInitDataRaw3() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data == null ? void 0 : data.ok) === false) throw new Error("notif list error");
    return Array.isArray(data.items) ? data.items : [];
  }
  async function notifApiAdd(uid, notif) {
    const res = await fetch(NOTIF_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tg-Init-Data": getTgInitDataRaw3() },
      body: JSON.stringify({ op: "add", uid: String(uid), notif })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data == null ? void 0 : data.ok) === false) throw new Error("notif add error");
    return data.id || notif.id || Date.now();
  }
  async function notifApiMarkAll(uid) {
    const res = await fetch(NOTIF_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tg-Init-Data": getTgInitDataRaw3() },
      body: JSON.stringify({ op: "markmine", uid: String(uid) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data == null ? void 0 : data.ok) === false) throw new Error("notif mark error");
    return Array.isArray(data.items) ? data.items : null;
  }
  function mergeNotifsToLocal(serverItems) {
    const local = getNotifications();
    const byId = new Map(local.map((n) => [String(n.id), n]));
    let changed = false;
    for (const s of serverItems) {
      const sid = String(s.id);
      const prev = byId.get(sid);
      if (!prev) {
        byId.set(sid, { id: s.id, ts: s.ts || Date.now(), read: !!s.read, icon: s.icon || "bell", title: s.title || "", sub: s.sub || "" });
        changed = true;
      } else {
        const next = __spreadValues(__spreadValues({}, prev), s);
        if (JSON.stringify(next) !== JSON.stringify(prev)) {
          byId.set(sid, next);
          changed = true;
        }
      }
    }
    if (changed) {
      setNotifications([...byId.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)));
    }
  }
  async function serverPushFor(uid, notif) {
    var _a4;
    const safe = {
      id: notif.id || Date.now(),
      ts: notif.ts || Date.now(),
      read: !!notif.read,
      icon: notif.icon || "bell",
      title: String(notif.title || ""),
      sub: String(notif.sub || "")
    };
    try {
      await notifApiAdd(uid, safe);
    } catch (e) {
      if (String(uid) === String((_a4 = getUID) == null ? void 0 : _a4())) {
        const cache = getNotifications();
        cache.push(safe);
        setNotifications(cache);
      }
    }
  }
  async function syncMyNotifications() {
    const uid = getUID();
    if (!uid) return;
    try {
      const items = await notifApiList(uid);
      mergeNotifsToLocal(items);
      updateNotifBadge == null ? void 0 : updateNotifBadge();
    } catch (e) {
    }
  }
  async function ensureOnboardingNotifsOnce() {
    var _a4, _b;
    const uid = (_a4 = getUID) == null ? void 0 : _a4();
    if (!uid) return;
    const FLAG = `onb_seeded__${uid}`;
    if (localStorage.getItem(FLAG) === "1") return;
    if ((((_b = getNotifications()) == null ? void 0 : _b.length) || 0) > 0) {
      localStorage.setItem(FLAG, "1");
      return;
    }
    const now2 = Date.now();
    const items = [
      {
        id: `welcome-${now2}`,
        icon: "sparkles",
        title: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 EVLISE",
        sub: "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0439\u0442\u0435 \u043F\u043E\u043D\u0440\u0430\u0432\u0438\u0432\u0448\u0435\u0435\u0441\u044F \u0432 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u0438 \u043E\u0444\u043E\u0440\u043C\u043B\u044F\u0439\u0442\u0435 \u0432 2 \u043A\u043B\u0438\u043A\u0430.",
        ts: now2,
        read: false
      },
      {
        id: `feat-tracking-${now2}`,
        icon: "package",
        title: "\u041E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043A\u0430\u0437\u043E\u0432",
        sub: "\u042D\u0442\u0430\u043F\u044B: \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435, \u0441\u0431\u043E\u0440\u043A\u0430, \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u2014 \u0432\u0441\u0451 \u0432 \u043E\u0434\u043D\u043E\u043C \u043C\u0435\u0441\u0442\u0435.",
        ts: now2 + 1e3,
        read: false
      },
      {
        id: `feat-cashback-${now2}`,
        icon: "wallet",
        title: "\u041A\u044D\u0448\u0431\u0435\u043A \u0431\u0430\u043B\u043B\u0430\u043C\u0438",
        sub: "\u041E\u043F\u043B\u0430\u0447\u0438\u0432\u0430\u0439\u0442\u0435 \u0447\u0430\u0441\u0442\u044C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0445 \u0437\u0430\u043A\u0430\u0437\u043E\u0432 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u043C\u0438 \u0431\u0430\u043B\u043B\u0430\u043C\u0438.",
        ts: now2 + 2e3,
        read: false
      }
    ];
    try {
      await Promise.all(items.map((n) => serverPushFor(uid, n)));
    } finally {
      localStorage.setItem(FLAG, "1");
    }
  }
  (function initUserIdentityEarly() {
    var _a4, _b;
    const tg2 = (_a4 = window.Telegram) == null ? void 0 : _a4.WebApp;
    if ((_b = tg2 == null ? void 0 : tg2.initDataUnsafe) == null ? void 0 : _b.user) {
      const u = tg2.initDataUnsafe.user;
      state.user = u;
      try {
        localStorage.setItem("nas_uid", String(u.id));
      } catch (e) {
      }
      return;
    }
    try {
      const stored = localStorage.getItem("nas_uid");
      if (!stored) localStorage.setItem("nas_uid", "guest");
    } catch (e) {
    }
  })();
  loadCart();
  loadAddresses();
  loadProfile();
  loadFavorites();
  updateCartBadge();
  initTelegramChrome();
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (e) {
  }
  function setAdminMode(on) {
    document.body.classList.toggle("admin-mode", !!on);
    setTabbarMenu(on ? "admin" : "home");
  }
  function confirmAdminSwitch(onConfirm, onCancel) {
    const modal = document.getElementById("modal");
    const mb = document.getElementById("modalBody");
    const mt = document.getElementById("modalTitle");
    const ma = document.getElementById("modalActions");
    mt.textContent = "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430";
    mb.innerHTML = `
    <div style="font-size:15px;line-height:1.35">
      \u0412\u044B \u043F\u043E\u043A\u0438\u0434\u0430\u0435\u0442\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u0438 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0438\u0442\u0435 \u0432 \u0440\u0435\u0436\u0438\u043C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C?
    </div>
  `;
    ma.innerHTML = `
    <button id="admCancel" class="pill">\u041E\u0442\u043C\u0435\u043D\u0430</button>
    <button id="admOk" class="pill primary">\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C</button>
  `;
    modal.classList.add("show");
    document.getElementById("modalClose").onclick = close;
    document.getElementById("admCancel").onclick = () => {
      close();
      onCancel && onCancel();
    };
    document.getElementById("admOk").onclick = () => {
      close();
      onConfirm && onConfirm();
    };
    function close() {
      modal.classList.remove("show");
    }
  }
  function mountIcons() {
    var _a4;
    ((_a4 = window.lucide) == null ? void 0 : _a4.createIcons) && lucide.createIcons();
  }
  function killExternalCTA() {
    document.querySelectorAll(".cta, .paybtn").forEach((n) => n.remove());
    document.body.classList.remove("has-cta");
  }
  function setTabbarMenu(activeKey = "home") {
    var _a4, _b;
    const inner = document.querySelector(".tabbar .tabbar-inner");
    if (!inner) return;
    killExternalCTA();
    inner.classList.remove("is-cta");
    const inAdmin = document.body.classList.contains("admin-mode");
    if (inAdmin) {
      inner.innerHTML = `
      <a href="#/admin" data-tab="admin" class="tab ${activeKey === "admin" ? "active" : ""}" role="tab" aria-selected="${String(activeKey === "admin")}">
        <i data-lucide="shield-check"></i><span>\u0410\u0434\u043C\u0438\u043D\u043A\u0430</span>
      </a>
      <a href="#/account" id="leaveAdmin" data-tab="leave" class="tab" role="tab" aria-selected="false">
        <i data-lucide="log-out"></i><span>\u0412\u044B\u0439\u0442\u0438</span>
      </a>
    `;
      mountIcons();
      (_a4 = document.getElementById("leaveAdmin")) == null ? void 0 : _a4.addEventListener("click", (e) => {
        e.preventDefault();
        setAdminMode(false);
        location.hash = "#/account";
      });
      return;
    }
    const adminTab = canAccessAdmin() ? `
    <a href="#/admin" id="openAdminTab" data-tab="admin" class="tab ${activeKey === "admin" ? "active" : ""}" role="tab" aria-selected="${String(activeKey === "admin")}">
      <i data-lucide="shield-check"></i><span>\u0410\u0434\u043C\u0438\u043D\u043A\u0430</span>
    </a>` : "";
    inner.innerHTML = `
    <a href="#/" data-tab="home" class="tab ${activeKey === "home" ? "active" : ""}" role="tab" aria-selected="${String(activeKey === "home")}">
      <i data-lucide="home"></i><span>\u0413\u043B\u0430\u0432\u043D\u0430\u044F</span>
    </a>
    <a href="#/favorites" data-tab="saved" class="tab ${activeKey === "saved" ? "active" : ""}" role="tab" aria-selected="${String(activeKey === "saved")}">
      <i data-lucide="heart"></i><span>\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435</span>
    </a>
    <a href="#/cart" data-tab="cart" class="tab badge-wrap ${activeKey === "cart" ? "active" : ""}" role="tab" aria-selected="${String(activeKey === "cart")}">
      <i data-lucide="shopping-bag"></i><span>\u041A\u043E\u0440\u0437\u0438\u043D\u0430</span>
      <b id="cartBadge" class="badge" hidden></b>
    </a>
    <a href="#/account" data-tab="account" class="tab ${activeKey === "account" ? "active" : ""}" role="tab" aria-selected="${String(activeKey === "account")}">
      <i data-lucide="user-round"></i><span>\u0410\u043A\u043A\u0430\u0443\u043D\u0442</span>
    </a>
    ${adminTab}
  `;
    mountIcons();
    (_b = document.getElementById("openAdminTab")) == null ? void 0 : _b.addEventListener("click", (e) => {
      e.preventDefault();
      confirmAdminSwitch(() => {
        setAdminMode(true);
        location.hash = "#/admin";
      });
    });
    updateCartBadge();
  }
  function setTabbarCTA(arg) {
    const inner = document.querySelector(".tabbar .tabbar-inner");
    if (!inner) return;
    killExternalCTA();
    document.body.classList.add("has-cta");
    let id = "ctaBtn", html = "", onClick = null;
    if (typeof arg === "string") {
      html = arg;
    } else {
      ({ id = "ctaBtn", html = "", onClick = null } = arg || {});
    }
    inner.classList.add("is-cta");
    inner.innerHTML = `<button id="${id}" class="btn" style="flex:1">${html}</button>`;
    mountIcons();
    if (onClick) document.getElementById(id).onclick = onClick;
  }
  function setTabbarCTAs(left = { id: "ctaLeft", html: "", onClick: null }, right = { id: "ctaRight", html: "", onClick: null }) {
    const inner = document.querySelector(".tabbar .tabbar-inner");
    if (!inner) return;
    killExternalCTA();
    document.body.classList.add("has-cta");
    inner.classList.add("is-cta");
    inner.innerHTML = `
    <button id="${left.id || "ctaLeft"}" class="btn outline" style="flex:1">${left.html || ""}</button>
    <button id="${right.id || "ctaRight"}" class="btn" style="flex:1">${right.html || ""}</button>
  `;
    mountIcons();
    if (left.onClick) document.getElementById(left.id || "ctaLeft").onclick = left.onClick;
    if (right.onClick) document.getElementById(right.id || "ctaRight").onclick = right.onClick;
  }
  window.setTabbarMenu = setTabbarMenu;
  window.setTabbarCTA = setTabbarCTA;
  window.setTabbarCTAs = setTabbarCTAs;
  (function initTelegram() {
    var _a4;
    const tg2 = (_a4 = window.Telegram) == null ? void 0 : _a4.WebApp;
    if (tg2 == null ? void 0 : tg2.initDataUnsafe) {
      const u = tg2.initDataUnsafe.user;
      if (u) state.user = u;
      const sp = String(tg2.initDataUnsafe.start_param || "").trim().toLowerCase();
      if (sp) {
        try {
          fetch("/.netlify/functions/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "miniapp_open",
              startapp: sp,
              uid: (u == null ? void 0 : u.id) || null
            })
          }).catch(() => {
          });
        } catch (e) {
        }
      }
      tryUnlockFromStartParam();
      if (sp === "admin" || sp === "admin-login") {
        try {
          sessionStorage.setItem("nas_start_route", `#/${sp}`);
        } catch (e) {
        }
      }
    }
  })();
  var _a2;
  (_a2 = el("#searchInput")) == null ? void 0 : _a2.addEventListener("input", (e) => {
    state.filters.query = e.target.value;
    renderHome(router);
  });
  function updateNotifBadge() {
    const unread = getNotifications().filter((n) => !n.read).length;
    const b = document.getElementById("notifBadge");
    if (!b) return;
    if (unread > 0) {
      b.textContent = String(unread);
      b.hidden = false;
      b.setAttribute("aria-hidden", "false");
    } else {
      b.textContent = "";
      b.hidden = true;
      b.setAttribute("aria-hidden", "true");
    }
  }
  window.updateNotifBadge = updateNotifBadge;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#openNotifications");
    if (!btn) return;
    location.hash = "#/notifications";
  });
  function hideProductHeader() {
    const stat = document.querySelector(".app-header");
    const fix = document.getElementById("productFixHdr");
    if (window._productHdrAbort) {
      try {
        window._productHdrAbort.abort();
      } catch (e) {
      }
      window._productHdrAbort = null;
    }
    if (fix) {
      fix.classList.remove("show");
      fix.setAttribute("aria-hidden", "true");
    }
    if (stat) {
      stat.classList.remove("hidden");
    }
  }
  async function router() {
    const path = (location.hash || "#/").slice(1);
    const clean = path.replace(/#.*/, "");
    const inAdmin = document.body.classList.contains("admin-mode");
    const parts = path.split("/").filter(Boolean);
    const map = {
      "": "home",
      "/": "home",
      "/favorites": "saved",
      "/cart": "cart",
      "/account": "account",
      "/orders": "account",
      "/admin": "admin"
    };
    const match = (pattern) => {
      const p = pattern.split("/").filter(Boolean);
      if (p.length !== parts.length) return null;
      const params = {};
      for (let i = 0; i < p.length; i++) {
        if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (p[i] !== parts[i]) return null;
      }
      return params;
    };
    setTabbarMenu(map[clean] || (inAdmin ? "admin" : "home"));
    hideProductHeader();
    if (inAdmin) {
      if (parts.length === 0 || parts[0] !== "admin") {
        location.hash = "#/admin";
        return renderAdmin();
      }
      if (!canAccessAdmin()) {
        setAdminMode(false);
        toast("\u0414\u043E\u0441\u0442\u0443\u043F \u0432 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D");
        location.hash = "#/admin-login";
        return;
      }
      return renderAdmin();
    }
    if (parts.length === 0) return renderHome(router);
    const m1 = match("category/:slug");
    if (m1) return renderCategory(m1);
    const m2 = match("product/:id");
    if (m2) return renderProduct(m2);
    const m3 = match("track/:id");
    if (m3) return renderTrack(m3);
    if (match("favorites")) return renderFavorites();
    if (match("cart")) return renderCart();
    if (match("orders")) return renderOrders();
    if (match("account")) return renderAccount();
    if (match("account/addresses")) return renderAddresses();
    if (match("account/settings")) return renderSettings();
    if (match("account/cashback")) return renderCashback();
    if (match("account/referrals")) return renderReferrals();
    if (match("notifications")) {
      await syncMyNotifications();
      renderNotifications(updateNotifBadge);
      const uid = getUID();
      try {
        const items = await notifApiMarkAll(uid);
        if (items) {
          mergeNotifsToLocal(items);
        } else {
          const loc = getNotifications().map((n) => __spreadProps(__spreadValues({}, n), { read: true }));
          setNotifications(loc);
        }
      } catch (e) {
      }
      updateNotifBadge == null ? void 0 : updateNotifBadge();
      return;
    }
    if (match("ref")) {
      renderRefBridge();
      return;
    }
    if (match("admin")) {
      if (!canAccessAdmin()) {
        toast("\u0414\u043E\u0441\u0442\u0443\u043F \u0432 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D");
        location.hash = "#/admin-login";
        return;
      }
      confirmAdminSwitch(() => {
        setAdminMode(true);
        location.hash = "#/admin";
      }, () => {
        location.hash = "#/account";
      });
      return;
    }
    if (match("faq")) return renderFAQ();
    renderHome(router);
  }
  function collectSnapshot() {
    var _a4, _b, _c, _d, _e, _f;
    const uid = ((_a4 = getUID) == null ? void 0 : _a4()) || "guest";
    const chatId = (_e = (_d = (_c = (_b = window == null ? void 0 : window.Telegram) == null ? void 0 : _b.WebApp) == null ? void 0 : _c.initDataUnsafe) == null ? void 0 : _d.user) == null ? void 0 : _e.id;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tashkent";
    const cart = Array.isArray((_f = state.cart) == null ? void 0 : _f.items) ? state.cart.items.map((it) => {
      const p = state.products.find((x) => String(x.id) === String(it.productId)) || {};
      return {
        id: it.productId,
        qty: Number(it.qty || 1),
        title: p.title || it.title || "\u0442\u043E\u0432\u0430\u0440",
        price: Number(p.price || it.price || 0)
      };
    }) : [];
    const favorites = state.favorites instanceof Set ? Array.from(state.favorites) : Array.isArray(state.favorites) ? state.favorites.slice() : [];
    return { uid, chatId, tz, cart, favorites };
  }
  async function sendSnapshot() {
    try {
      const snap = collectSnapshot();
      if (!snap.uid || !snap.chatId) return;
      await fetch("/.netlify/functions/user-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap)
      });
    } catch (e) {
    }
  }
  function startUserSnapshotSync() {
    sendSnapshot();
    window.addEventListener("cart:updated", sendSnapshot);
    window.addEventListener("favorites:updated", sendSnapshot);
    setInterval(sendSnapshot, 10 * 60 * 1e3);
  }
  async function init() {
    var _a4, _b;
    captureInviterFromContext();
    try {
      const res = await fetch("data/products.json");
      const data = await res.json();
      state.products = Array.isArray(data == null ? void 0 : data.products) ? data.products : [];
      state.categories = Array.isArray(data == null ? void 0 : data.categories) ? data.categories.map((c) => __spreadProps(__spreadValues({}, c), { name: c.name })) : [];
    } catch (e) {
      state.products = [];
      state.categories = [];
    }
    try {
      state.orders = await getOrders();
    } catch (e) {
      state.orders = [];
    }
    pruneCartAgainstProducts(state.products);
    updateCartBadge();
    drawCategoriesChips(router);
    renderActiveFilterChips();
    let startRoute = null;
    try {
      const tg2 = (_a4 = window.Telegram) == null ? void 0 : _a4.WebApp;
      if (tg2 == null ? void 0 : tg2.initDataUnsafe) {
        tryUnlockFromStartParam();
      }
      startRoute = sessionStorage.getItem("nas_start_route");
      sessionStorage.removeItem("nas_start_route");
    } catch (e) {
    }
    if (startRoute) {
      location.hash = startRoute;
    }
    await ensureUserJoinReported();
    settleMatured();
    await router();
    await tryBindPendingInviter();
    window.addEventListener("hashchange", router);
    window.addEventListener("orders:updated", () => {
      const inAdmin = document.body.classList.contains("admin-mode");
      const isAdminRoute = location.hash.replace("#", "").startsWith("/admin");
      if (inAdmin && isAdminRoute) {
        try {
          window.dispatchEvent(new CustomEvent("admin:refresh"));
        } catch (e) {
        }
      } else {
        router();
      }
    });
    window.addEventListener("force:rerender", router);
    window.addEventListener("auth:updated", () => {
      if (document.body.classList.contains("admin-mode") && !canAccessAdmin()) {
        setAdminMode(false);
        location.hash = "#/admin-login";
      }
      router();
      tryBindPendingInviter();
    });
    function buildOrderShortTitle(order) {
      var _a5, _b2, _c, _d, _e;
      const firstTitle = ((_b2 = (_a5 = order == null ? void 0 : order.cart) == null ? void 0 : _a5[0]) == null ? void 0 : _b2.title) || ((_d = (_c = order == null ? void 0 : order.cart) == null ? void 0 : _c[0]) == null ? void 0 : _d.name) || (order == null ? void 0 : order.title) || "\u0442\u043E\u0432\u0430\u0440";
      const extra = Math.max(0, (((_e = order == null ? void 0 : order.cart) == null ? void 0 : _e.length) || 0) - 1);
      return extra > 0 ? `${firstTitle} + \u0435\u0449\u0451 ${extra}` : firstTitle;
    }
    function instantLocalIfSelf(targetUid, notif) {
      var _a5;
      if (String(targetUid) === String((_a5 = getUID) == null ? void 0 : _a5())) {
        pushNotification(notif);
        updateNotifBadge == null ? void 0 : updateNotifBadge();
      }
    }
    window.addEventListener("client:orderPlaced", async (e) => {
      var _a5;
      try {
        const id = (_a5 = e.detail) == null ? void 0 : _a5.id;
        const order = (await getOrders() || []).find((o) => String(o.id) === String(id));
        const dispId = makeDisplayOrderId(order);
        const notif = {
          id: `order-placed-${id}`,
          ts: Date.now(),
          icon: "package",
          title: "\u0417\u0430\u043A\u0430\u0437 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D",
          sub: dispId ? `#${dispId} \u2014 \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F` : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F",
          read: false
        };
        pushNotification(notif);
        updateNotifBadge == null ? void 0 : updateNotifBadge();
        await serverPushFor(getUID(), notif);
        window.dispatchEvent(new CustomEvent("orders:updated"));
      } catch (e2) {
      }
    });
    window.addEventListener("admin:orderAccepted", async (e) => {
      try {
        const { id, userId } = e.detail || {};
        const order = (await getOrders() || []).find((o) => String(o.id) === String(id));
        const dispId = makeDisplayOrderId(order);
        const notif = {
          icon: "shield-check",
          title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C",
          sub: dispId ? `#${dispId}` : ""
        };
        await serverPushFor(userId, notif);
        instantLocalIfSelf(userId, notif);
      } catch (e2) {
      }
    });
    window.addEventListener("admin:statusChanged", async (e) => {
      try {
        const { id, status, userId } = e.detail || {};
        const order = (await getOrders() || []).find((o) => String(o.id) === String(id));
        const dispId = makeDisplayOrderId(order);
        const notif = {
          icon: "refresh-ccw",
          title: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043A\u0430\u0437\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D",
          sub: dispId ? `#${dispId}: ${getStatusLabel(status)}` : getStatusLabel(status)
        };
        await serverPushFor(userId, notif);
        instantLocalIfSelf(userId, notif);
      } catch (e2) {
      }
    });
    window.addEventListener("admin:orderCanceled", async (e) => {
      try {
        const { id, reason, userId } = e.detail || {};
        const order = (await getOrders() || []).find((o) => String(o.id) === String(id));
        const dispId = makeDisplayOrderId(order);
        const subSuffix = reason ? ` \u2014 ${reason}` : "";
        const notif = {
          icon: "x-circle",
          title: "\u0417\u0430\u043A\u0430\u0437 \u043E\u0442\u043C\u0435\u043D\u0451\u043D",
          sub: dispId ? `#${dispId}${subSuffix}` : reason || ""
        };
        await serverPushFor(userId, notif);
        instantLocalIfSelf(userId, notif);
      } catch (e2) {
      }
    });
    window.lucide && ((_b = lucide.createIcons) == null ? void 0 : _b.call(lucide));
    await ensureOnboardingNotifsOnce();
    await syncMyNotifications();
    updateNotifBadge();
    const NOTIF_POLL_MS = 3e4;
    setInterval(() => {
      syncMyNotifications();
      settleMatured();
    }, NOTIF_POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        syncMyNotifications();
        settleMatured();
      }
    });
    startUserSnapshotSync();
    setInterval(async () => {
      try {
        await getOrders();
      } catch (e) {
      }
    }, 45e3);
  }
  init();
  var _a3;
  (_a3 = document.getElementById("openFilters")) == null ? void 0 : _a3.addEventListener("click", () => openFilterModal(router));
  async function ensureUserJoinReported() {
    var _a4, _b, _c;
    try {
      const tgUser = (_c = (_b = (_a4 = window == null ? void 0 : window.Telegram) == null ? void 0 : _a4.WebApp) == null ? void 0 : _b.initDataUnsafe) == null ? void 0 : _c.user;
      if (!tgUser) return;
      const uid = String(tgUser.id);
      const FLAG = `user_join_sent__${uid}`;
      if (localStorage.getItem(FLAG) === "1") return;
      const payload = {
        uid,
        first_name: String(tgUser.first_name || "").trim(),
        last_name: String(tgUser.last_name || "").trim(),
        username: String(tgUser.username || "").trim()
      };
      const r = await fetch(USER_JOIN_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      localStorage.setItem(FLAG, "1");
      await r.json().catch(() => ({}));
    } catch (e) {
    }
  }
})();

/* =========================================================
   MERONQ / ARTIK FOOD — site.js (CSP-SAFE + COMPACT + FIXED)
   ✅ Магазин → Категории → Товары категории
   ✅ Иконки категорий
   ✅ Поиск: магазины / категории / товары (по контексту)
   ✅ +/- без inline onclick (CSP safe)
   ✅ Фото: .jpg -> .png -> placeholder (без inline onerror)
   ✅ Заказ → Worker /orders
   ✅ История заказов (localStorage)
========================================================= */

/* ================= PATHS ================= */
const BASE_PATH = new URL("./", location.href).pathname;
const STORES_INDEX_URL = BASE_PATH + "stores/index.json";

/* ================= WORKER ================= */
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";


/* ================= STATE ================= */
let stores = {};
let menus = {}; // {storeId: {categories:{cat:[item]}}}
let cart = {};  // {storeId: {productName: {q, p}}}

let currentStoreId = null;
let currentCategory = null;
let currentCategoryItems = []; // для поиска внутри категории

/* ================= DOM HELPERS ================= */
const $ = (id) => document.getElementById(id);

function asset(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : BASE_PATH + path.replace(/^\/+/, "");
}

function amd(n) {
  return `${Number(n || 0).toLocaleString()} AMD`;
}

function deliveryCost(d) {
  return d === "Артик" ? 500 :
         d === "Арич" ? 700 :
         (d === "Нор-Кянк" || d === "Пемзашен") ? 1000 : 0;
}

/* ================= UTILS ================= */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ================= NAV ================= */
function showHome() {
  $("home-page")?.classList.remove("hidden");
  $("store-page")?.classList.add("hidden");
  currentStoreId = null;
  currentCategory = null;
  currentCategoryItems = [];
  scrollTo(0, 0);
}

function showStore() {
  $("home-page")?.classList.add("hidden");
  $("store-page")?.classList.remove("hidden");
  scrollTo(0, 0);
}

function goBack() {
  if (currentStoreId && currentCategory) {
    showCategories(currentStoreId);
    return;
  }
  showHome();
}

function openShops() {
  showHome();
  const sec = document.getElementById("shops");
  if (sec) sec.scrollIntoView({ behavior: "smooth" });
}

window.goHome = openShops;
window.goBack = goBack;
window.openShops = openShops;

window.toggleTheme = () => document.body.classList.toggle("light-theme");

/* ================= CATEGORY ICONS ================= */
const CATEGORY_ICONS = {
  "Шаурма": "🥙",
  "Шашлык": "🍖",
  "Мангал": "🔥",
  "Кебаб": "🌯",
  "Салаты": "🥗",
  "Гарнир": "🍟",
  "Соусы": "🧄",
  "Напитки": "🥤",
  "Десерты": "🍰",
  "Хлеб": "🥖",
  "Разное": "🍽️",
};
function catIcon(name) {
  return CATEGORY_ICONS[name] || "📦";
}

/* ================= IMAGES (jpg -> png) ================= */
function setProductImage(imgElementId, basePathNoExt) {
  const img = document.getElementById(imgElementId);
  if (!img) return;

  const jpgUrl = asset(basePathNoExt + ".jpg");
  const pngUrl = asset(basePathNoExt + ".png");

  // 1) пробуем jpg
  img.onerror = () => {
    // 2) если jpg нет — пробуем png
    img.onerror = () => {
      // 3) если и png нет — заглушка
      img.onerror = null;
      img.src =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='26'%3E📦%3C/text%3E%3C/svg%3E";
    };
    img.src = pngUrl;
  };

  img.src = jpgUrl;
}

/* ================= STORES ================= */
async function loadStores() {
  const list = $("shops-list");
  const loading = $("loading-shops");
  if (!list) return;

  try {
    const r = await fetch(STORES_INDEX_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`stores/index.json HTTP ${r.status}`);
    const data = await r.json();

    if (loading) loading.style.display = "none";
    list.innerHTML = "";
    stores = {};

    (data.stores || []).forEach((s) => {
      if (!s?.enabled) return;
      stores[s.id] = s;

      const card = document.createElement("div");
      card.className = "card";
      card.addEventListener("click", () => openStore(s.id));

      // CSP-safe: создаём img как элемент, без inline onerror
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:10px";

      const img = document.createElement("img");
      img.src = asset(s.logo);
      img.alt = s.name || "";
      img.style.cssText =
        "width:72px;height:72px;border-radius:16px;object-fit:cover;" +
        "box-shadow:var(--shadow-soft);background:rgba(0,0,0,0.06)";
      img.onerror = () => { img.style.display = "none"; };

      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.textContent = s.name || "";

      const hours = document.createElement("div");
      hours.style.cssText = "font-size:12px;color:var(--text-muted)";
      hours.textContent = `🕙 ${s.workingHours?.open || "09:00"} - ${s.workingHours?.close || "22:00"}`;

      wrap.appendChild(img);
      wrap.appendChild(title);
      wrap.appendChild(hours);
      card.appendChild(wrap);

      list.appendChild(card);
    });

    if (!list.children.length) {
      list.innerHTML = `<div class="loading">Магазины не найдены</div>`;
    }
  } catch (e) {
    console.error(e);
    if (loading) loading.innerHTML = `<div style="color:#ff6b6b;">❌ ${escapeHtml(e.message)}</div>`;
  }
}

/* ================= MENU FLOW ================= */
async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  currentStoreId = storeId;
  currentCategory = null;
  currentCategoryItems = [];

  showStore();
  if ($("store-title")) $("store-title").textContent = store.name || "";

  $("store-products") && ($("store-products").innerHTML = "");
  $("categories-list") && ($("categories-list").innerHTML = "");
  $("categories-block")?.classList.remove("hidden");

  // сброс поиска
  if ($("searchInput")) $("searchInput").value = "";

  // меню уже загружали
  if (menus[storeId]?.categories) {
    showCategories(storeId);
    return;
  }

  const box = $("store-products");
  if (box) box.innerHTML = `<div class="loading">Загрузка меню…</div>`;

  try {
    const menuUrl = asset(store.menu);
    const r = await fetch(menuUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`Меню не найдено: ${menuUrl} (HTTP ${r.status})`);
    const csv = await r.text();

    menus[storeId] = { categories: parseMenuToCategories(csv) };
    showCategories(storeId);
  } catch (e) {
    console.error(e);
    if (box) box.innerHTML = `<div class="loading" style="color:#ff6b6b;">❌ ${escapeHtml(e.message)}</div>`;
  }
}

function showCategories(storeId) {
  currentCategory = null;
  currentCategoryItems = [];

  const catBlock = $("categories-block");
  const catList = $("categories-list");
  const productsBox = $("store-products");
  if (!catList || !productsBox) return;

  catBlock?.classList.remove("hidden");
  productsBox.innerHTML = "";

  const cats = Object.keys(menus[storeId]?.categories || {}).sort();
  catList.innerHTML = "";

  if (!cats.length) {
    productsBox.innerHTML = `<div class="loading" style="color:#ff6b6b;">Меню пустое или не распознано</div>`;
    return;
  }

  cats.forEach((cat) => {
    const count = (menus[storeId].categories[cat] || []).length;

    const card = document.createElement("div");
    card.className = "card";
    card.style.textAlign = "left";
    card.style.padding = "12px"; // компактнее
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:26px;line-height:1">${catIcon(cat)}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px">${escapeHtml(cat)}</div>
          <div style="margin-top:4px;font-size:12px;color:var(--text-muted)">Товаров: ${count}</div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => showCategoryProducts(storeId, cat));
    catList.appendChild(card);
  });

  scrollTo(0, 0);
}

function showCategoryProducts(storeId, category) {
  currentCategory = category;

  const productsBox = $("store-products");
  const catBlock = $("categories-block");
  if (!productsBox) return;

  catBlock?.classList.add("hidden");

  const items = menus[storeId]?.categories?.[category] || [];
  currentCategoryItems = items.slice();

  renderCategoryList(storeId, category, items);
  scrollTo(0, 0);
}

/* ====== render product list (CSP-safe) ====== */
function makeQtyId(storeId, productName) {
  const enc = btoa(unescape(encodeURIComponent(`${storeId}::${productName}`))).replace(/=+$/g, "");
  return `qty-${enc}`;
}

function renderCategoryList(storeId, category, items) {
  const productsBox = $("store-products");
  if (!productsBox) return;

  productsBox.innerHTML = "";

  const h = document.createElement("h3");
  h.style.margin = "14px 0 6px";
  h.style.color = "var(--accent-gold)";
  h.style.fontSize = "16px";
  h.textContent = category;
  productsBox.appendChild(h);

  if (!items.length) {
    productsBox.innerHTML += `<div class="loading">Ничего не найдено</div>`;
    return;
  }

  items.forEach((p) => {
    const base = (p.image || "").trim() || "no-image";
    const imgBase = `stores/${storeId}/images/${base}`;
    const imgElId = `img-${makeQtyId(storeId, p.name)}`;

    const qtyId = makeQtyId(storeId, p.name);
    const nameEnc = encodeURIComponent(String(p.name || ""));
    const price = Number(p.price || 0);

    const row = document.createElement("div");
    row.className = "product";
    row.style.gap = "10px";

    row.innerHTML = `
      <img id="${imgElId}"
           style="width:62px;height:62px;border-radius:14px;object-fit:cover;flex:0 0 62px"
           src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23222' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='24'%3E⏳%3C/text%3E%3C/svg%3E"
           alt="${escapeHtml(p.name)}">

      <div style="flex:1;min-width:0">
        <h4 style="margin:0 0 4px;font-size:14px;line-height:1.2">${escapeHtml(p.name)}</h4>
        <p style="margin:0;font-size:12px;color:var(--text-muted);line-height:1.25">
          ${escapeHtml(p.desc || "")}${p.desc ? " • " : ""}<span style="color:var(--text-main)">${amd(price)}</span>
        </p>
      </div>

      <div class="qty-controls" style="gap:6px">
        <button style="width:30px;height:30px"
                data-act="minus" data-store="${storeId}" data-name="${nameEnc}" data-price="${price}" data-qty="${qtyId}">−</button>
        <span class="qty-number" style="min-width:18px;font-size:13px" id="${qtyId}">${getQty(storeId, p.name)}</span>
        <button style="width:30px;height:30px"
                data-act="plus" data-store="${storeId}" data-name="${nameEnc}" data-price="${price}" data-qty="${qtyId}">+</button>
      </div>
    `;

    productsBox.appendChild(row);
    setProductImage(imgElId, imgBase);
  });

  updateCart();
}

/* ================= SEARCH ================= */
function applySearch() {
  const q = ($("searchInput")?.value || "").trim().toLowerCase();
  const active = q.length >= 2;

  // HOME: фильтр магазинов
  if (!currentStoreId) {
    filterShops(active ? q : "");
    return;
  }

  // STORE: внутри категории -> фильтруем товары
  if (currentStoreId && currentCategory) {
    const items = currentCategoryItems || [];
    const filtered = !active
      ? items
      : items.filter((p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.desc || "").toLowerCase().includes(q)
        );

    renderCategoryList(currentStoreId, currentCategory, filtered);
    return;
  }

  // STORE: на экране категорий -> фильтруем категории
  if (currentStoreId && !currentCategory) {
    filterCategories(active ? q : "");
  }
}

function filterShops(q) {
  const list = $("shops-list");
  if (!list) return;

  const cards = Array.from(list.children);
  if (!q) {
    cards.forEach((c) => (c.style.display = ""));
    return;
  }

  cards.forEach((c) => {
    const txt = (c.textContent || "").toLowerCase();
    c.style.display = txt.includes(q) ? "" : "none";
  });

  const sec = document.getElementById("shops");
  if (sec) sec.scrollIntoView({ behavior: "smooth" });
}

function filterCategories(q) {
  const catList = $("categories-list");
  if (!catList) return;

  const cards = Array.from(catList.children);
  if (!q) {
    cards.forEach((c) => (c.style.display = ""));
    return;
  }

  cards.forEach((c) => {
    const txt = (c.textContent || "").toLowerCase();
    c.style.display = txt.includes(q) ? "" : "none";
  });
}

window.applySearch = applySearch;
window.openStore = openStore;

/* ================= CART ================= */
function getQty(storeId, name) {
  return cart?.[storeId]?.[name]?.q || 0;
}

function addToCart(storeId, name, price, qtyId) {
  cart[storeId] ||= {};
  cart[storeId][name] ||= { q: 0, p: price };
  cart[storeId][name].q++;

  if (qtyId) {
    const el = document.getElementById(qtyId);
    if (el) el.textContent = String(cart[storeId][name].q);
  }

  updateCart();
}

function changeQty(storeId, name, delta, qtyId) {
  const item = cart?.[storeId]?.[name];
  if (!item) return;

  item.q += delta;

  if (item.q <= 0) {
    delete cart[storeId][name];
    if (Object.keys(cart[storeId]).length === 0) delete cart[storeId];

    if (qtyId) {
      const el = document.getElementById(qtyId);
      if (el) el.textContent = "0";
    }
  } else {
    if (qtyId) {
      const el = document.getElementById(qtyId);
      if (el) el.textContent = String(item.q);
    }
  }

  updateCart();
}

function updateCart() {
  const box = $("global-cart-items");
  if (!box) return;

  box.innerHTML = "";
  let sum = 0;

  for (const sid of Object.keys(cart)) {
    const storeName = stores[sid]?.name || sid;

    const header = document.createElement("div");
    header.style.margin = "10px 0 6px";
    header.style.fontWeight = "700";
    header.style.color = "var(--accent-gold)";
    header.style.fontSize = "13px";
    header.textContent = storeName;
    box.appendChild(header);

    for (const name of Object.keys(cart[sid])) {
      const it = cart[sid][name];
      sum += it.q * it.p;

      const nameEnc = encodeURIComponent(String(name || ""));
      const price = Number(it.p || 0);

      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div style="flex:1;text-align:left;">
          <div style="font-weight:600;font-size:13px">${escapeHtml(name)}</div>
          <span style="font-size:12px;color:var(--text-muted)">${amd(price)} × ${it.q} = ${amd(price * it.q)}</span>
        </div>
        <div class="qty-controls" style="gap:6px">
          <button style="width:30px;height:30px"
                  data-act="minus" data-store="${sid}" data-name="${nameEnc}" data-price="${price}">−</button>
          <span class="qty-number" style="min-width:18px;font-size:13px">${it.q}</span>
          <button style="width:30px;height:30px"
                  data-act="plus" data-store="${sid}" data-name="${nameEnc}" data-price="${price}">+</button>
        </div>
      `;
      box.appendChild(row);
    }
  }

  if (!Object.keys(cart).length) {
    box.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Корзина пуста</p>`;
  }

  const district = $("district")?.value || "";
  const d = deliveryCost(district);

  $("global-cart-total") && ($("global-cart-total").textContent = `Товары: ${amd(sum)}`);
  $("delivery-total") && ($("delivery-total").textContent = `Доставка: ${amd(d)}`);
  $("grand-total") && ($("grand-total").textContent = `Итого: ${amd(sum + d)}`);
}

window.addToCart = addToCart;
window.changeQty = changeQty;

/* ================= ORDERS ================= */
function buildOrderPayload() {
  const name = ($("name")?.value || "").trim();
  const phone = ($("phone")?.value || "").trim();
  const address = ($("address")?.value || "").trim();
  const district = ($("district")?.value || "").trim();
  const payment = ($("payment")?.value || "").trim();
  const comment = ($("comment")?.value || "").trim();

  if (!name || !phone || !address) return { error: "Заполни имя, телефон и адрес" };
  if (!district) return { error: "Выбери район" };
  if (!Object.keys(cart).length) return { error: "Корзина пуста" };

  const products = [];
  for (const storeId of Object.keys(cart)) {
    const store = stores[storeId];
    for (const pname of Object.keys(cart[storeId])) {
      const it = cart[storeId][pname];
      products.push({
        storeKey: storeId,
        storeName: store?.name || storeId,
        name: pname,
        quantity: it.q,
        unitPrice: it.p,
        totalPrice: it.q * it.p,
      });
    }
  }

  const itemsTotal = products.reduce((s, p) => s + (Number(p.totalPrice) || 0), 0);
  const delivery = deliveryCost(district);
  const grandTotal = itemsTotal + delivery;

  return {
    payload: {
      name,
      phone,
      address,
      district,
      payment,
      comment,
      products,
      totals: { itemsTotal, delivery, grandTotal },
      createdAt: new Date().toISOString(),
    },
  };
}

function showOrderMsg(text, kind = "error") {
  let box = document.getElementById("order-status");
  if (!box) {
    box = document.createElement("div");
    box.id = "order-status";
    const form = document.querySelector(".order-form") || document.body;
    form.appendChild(box);
  }

  if (kind === "ok") {
    box.style.cssText =
      "margin-top:10px;padding:10px 12px;border-radius:14px;" +
      "border:1px solid rgba(46,204,113,.35);background:rgba(46,204,113,.10);" +
      "color:#bff3d2;font-weight:700;font-size:13px;";
  } else {
    box.style.cssText =
      "margin-top:10px;padding:10px 12px;border-radius:14px;" +
      "border:1px solid rgba(255,107,107,.35);background:rgba(255,107,107,.10);" +
      "color:#ffb3b3;font-weight:600;font-size:13px;";
  }
  box.textContent = text;
}

async function placeOrder() {
  // убираем прошлое сообщение
  document.getElementById("order-status")?.remove();

  const built = buildOrderPayload();
  if (built.error) {
    showOrderMsg("❌ " + built.error, "error");
    return;
  }

  const btn = document.querySelector(".order-form button") || null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "ОТПРАВЛЯЕМ…";
  }

  try {
   const r = await fetch(WORKER_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(built.payload),
});


    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    saveOrderToLocal(built.payload, j);

    showOrderMsg("✅ Заказ отправлен!", "ok");

    cart = {};
    updateCart();
    if ($("comment")) $("comment").value = "";

    openShops();
  } catch (e) {
    console.error(e);
    showOrderMsg("❌ Ошибка заказа: " + (e?.message || "неизвестно"), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📲 Отправить заказ";
    }
  }
}

window.placeOrder = placeOrder;

/* ================= CSV PARSE ================= */
function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line, delim) {
  const re = new RegExp(`${escapeRegExp(delim)}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line
    .split(re)
    .map((v) => (v ?? "").replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim());
}

function parseMenuToCategories(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return {};

  const delim = detectDelimiter(lines[0]);
  const categories = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);

    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const priceRaw = cols[3] || "0";
    const imageSlug = (cols[4] || "").trim(); // без расширения

    if (!name) continue;

    const price = parseInt(String(priceRaw).split("/")[0].replace(/[^\d]/g, ""), 10) || 0;

    (categories[category] ||= []).push({
      name,
      desc,
      price,
      image: imageSlug,
    });
  }

  return categories;
}

/* ================= ORDER HISTORY (LOCALSTORAGE) ================= */
const LS_HISTORY_KEY = "meronq_order_history_v1";
const LS_LAST_ORDER_KEY = "meronq_last_order_v1";

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function saveOrderToLocal(orderData, resultFromServer) {
  const record = {
    id: resultFromServer?.orderId || resultFromServer?.id || null,
    at: new Date().toISOString(),
    customer: {
      name: orderData?.name || "",
      phone: orderData?.phone || "",
      address: orderData?.address || "",
      district: orderData?.district || "",
      payment: orderData?.payment || "",
      comment: orderData?.comment || "",
    },
    totals: orderData?.totals || null,
    products: Array.isArray(orderData?.products) ? orderData.products : [],
  };

  localStorage.setItem(LS_LAST_ORDER_KEY, JSON.stringify(record));

  let prev = safeParse(localStorage.getItem(LS_HISTORY_KEY), []);
if (!Array.isArray(prev)) prev = [];   // ← ключевая строка
prev.unshift(record);
localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(prev.slice(0, 30)));


function getHistory() {
  return safeParse(localStorage.getItem(LS_HISTORY_KEY), []);
}

function closeOrderHistory() {
  document.getElementById("history-modal")?.classList.add("hidden");
}

function showOrderHistory() {
  const modal = document.getElementById("history-modal");
  const list = document.getElementById("history-list");
  if (!modal || !list) return;

  const history = getHistory();

  if (!history.length) {
    list.innerHTML = `<div style="padding:16px;color:var(--text-muted);text-align:center">История пуста</div>`;
  } else {
    list.innerHTML = history.map((h, idx) => {
      const date = new Date(h.at);
      const dt = isNaN(date.getTime()) ? h.at : date.toLocaleString();
      const itemsTotal = h?.totals?.itemsTotal ?? null;
      const delivery = h?.totals?.delivery ?? null;
      const grand = h?.totals?.grandTotal ?? null;

      const productsText = (h.products || []).slice(0, 12).map(p => {
        const nm = escapeHtml(p.name || "");
        const q = Number(p.quantity || 0);
        const st = escapeHtml(p.storeName || p.storeKey || "");
        return `<div style="color:var(--text-muted);font-size:13px">• ${nm} × ${q} <span style="opacity:.8">(${st})</span></div>`;
      }).join("");

      return `
        <div style="
          border:1px solid var(--border-glass);
          background:linear-gradient(180deg,var(--bg-glass),rgba(255,255,255,0.02));
          border-radius:16px;
          padding:12px;
          margin-bottom:10px;
        ">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div style="font-weight:700;color:var(--text-main)">
              Заказ ${h.id ? `#${escapeHtml(String(h.id))}` : `№${history.length - idx}`}
            </div>
            <div style="color:var(--text-muted);font-size:13px">${escapeHtml(dt)}</div>
          </div>

          <div style="margin-top:6px;color:var(--text-muted);font-size:13px">
            👤 ${escapeHtml(h.customer.name)} • 📞 ${escapeHtml(h.customer.phone)}
          </div>
          <div style="margin-top:4px;color:var(--text-muted);font-size:13px">
            📍 ${escapeHtml(h.customer.address)} • 🏙 ${escapeHtml(h.customer.district)} • 💳 ${escapeHtml(h.customer.payment)}
          </div>

          <div style="margin-top:8px">
            ${productsText || `<div style="color:var(--text-muted);font-size:13px">Товары не сохранены</div>`}
          </div>

          <div style="margin-top:10px;font-weight:700;color:var(--accent-gold)">
            ${grand != null ? `Итого: ${Number(grand).toLocaleString()} AMD` : ""}
            <span style="font-weight:500;color:var(--text-muted);font-size:13px;margin-left:10px">
              ${itemsTotal != null ? `Товары: ${Number(itemsTotal).toLocaleString()} AMD` : ""}
              ${delivery != null ? ` • Доставка: ${Number(delivery).toLocaleString()} AMD` : ""}
            </span>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px">
            <button data-history-act="use" data-index="${idx}" style="
              padding:9px 12px;border-radius:999px;
              border:1px solid var(--border-glass);
              background:var(--bg-glass); color:var(--text-main);
              cursor:pointer;font-weight:600
            ">Заполнить форму</button>
          </div>
        </div>
      `;
    }).join("");
  }

  modal.classList.remove("hidden");
}

function clearOrderHistory() {
  localStorage.removeItem(LS_HISTORY_KEY);
  showOrderHistory();
}

function fillOrderForm(h) {
  const c = h.customer || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };

  setVal("name", c.name);
  setVal("phone", c.phone);
  setVal("address", c.address);
  setVal("district", c.district);
  setVal("payment", c.payment);
  setVal("comment", c.comment);

  const paymentSelect = document.getElementById("payment");
  const cardInfo = document.getElementById("card-info");
  if (paymentSelect && cardInfo) {
    cardInfo.style.display = paymentSelect.value.includes("Перевод") ? "block" : "none";
  }
}

function useHistoryOrder(index) {
  const history = getHistory();
  const h = history[index];
  if (!h) return;

  fillOrderForm(h);
  closeOrderHistory();
  document.getElementById("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

function fillFromLastOrder() {
  const h = safeParse(localStorage.getItem(LS_LAST_ORDER_KEY), null);
  if (!h) return showOrderMsg("Нет сохранённых данных последнего заказа", "error");
  fillOrderForm(h);
  document.getElementById("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

window.showOrderHistory = showOrderHistory;
window.closeOrderHistory = closeOrderHistory;
window.clearOrderHistory = clearOrderHistory;
window.useHistoryOrder = useHistoryOrder;
window.fillFromLastOrder = fillFromLastOrder;

/* ================= CSP-SAFE EVENTS ================= */
function bindDelegatedClicks() {
  // +/- в товарах
  const productsBox = $("store-products");
  if (productsBox && !productsBox.__bound) {
    productsBox.__bound = true;
    productsBox.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const storeId = btn.dataset.store;
      const name = decodeURIComponent(btn.dataset.name || "");
      const price = Number(btn.dataset.price || 0);
      const qtyId = btn.dataset.qty || "";

      if (!storeId || !name) return;

      if (act === "plus") addToCart(storeId, name, price, qtyId);
      if (act === "minus") changeQty(storeId, name, -1, qtyId);
    });
  }

  // +/- в корзине
  const cartBox = $("global-cart-items");
  if (cartBox && !cartBox.__bound) {
    cartBox.__bound = true;
    cartBox.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const storeId = btn.dataset.store;
      const name = decodeURIComponent(btn.dataset.name || "");
      const price = Number(btn.dataset.price || 0);

      if (!storeId || !name) return;

      if (act === "plus") addToCart(storeId, name, price, makeQtyId(storeId, name));
      if (act === "minus") changeQty(storeId, name, -1, makeQtyId(storeId, name));
    });
  }

  // история (кнопка "Заполнить форму")
  const historyList = document.getElementById("history-list");
  if (historyList && !historyList.__bound) {
    historyList.__bound = true;
    historyList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-history-act='use']");
      if (!btn) return;
      const idx = parseInt(btn.dataset.index || "0", 10) || 0;
      useHistoryOrder(idx);
    });
  }
}

// Если в HTML были inline onclick — перевесим на нормальные
function rebindInlineButtons() {
  const all = Array.from(document.querySelectorAll("[onclick]"));
  all.forEach((el) => {
    const v = String(el.getAttribute("onclick") || "");
    // order
    if (v.includes("placeOrder")) {
      el.addEventListener("click", (e) => { e.preventDefault(); placeOrder(); });
      el.removeAttribute("onclick");
      return;
    }
    // back/home/theme/history
    if (v.includes("goBack")) {
      el.addEventListener("click", (e) => { e.preventDefault(); goBack(); });
      el.removeAttribute("onclick");
      return;
    }
    if (v.includes("goHome") || v.includes("openShops")) {
      el.addEventListener("click", (e) => { e.preventDefault(); openShops(); });
      el.removeAttribute("onclick");
      return;
    }
    if (v.includes("toggleTheme")) {
      el.addEventListener("click", (e) => { e.preventDefault(); window.toggleTheme(); });
      el.removeAttribute("onclick");
      return;
    }
    if (v.includes("showOrderHistory")) {
      el.addEventListener("click", (e) => { e.preventDefault(); showOrderHistory(); });
      el.removeAttribute("onclick");
      return;
    }
    if (v.includes("closeOrderHistory")) {
      el.addEventListener("click", (e) => { e.preventDefault(); closeOrderHistory(); });
      el.removeAttribute("onclick");
      return;
    }
    if (v.includes("fillFromLastOrder")) {
      el.addEventListener("click", (e) => { e.preventDefault(); fillFromLastOrder(); });
      el.removeAttribute("onclick");
      return;
    }
  });
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  showHome();
  loadStores();
  bindDelegatedClicks();
  rebindInlineButtons();

  // пересчёт доставки при смене района
  document.getElementById("district")
    ?.addEventListener("change", updateCart);

  // показать карту Fast Bank при выборе перевода
  const paymentSelect = document.getElementById("payment");
  const cardInfo = document.getElementById("card-info");

  if (paymentSelect && cardInfo) {
    paymentSelect.addEventListener("change", () => {
      cardInfo.style.display =
        paymentSelect.value.includes("Перевод")
          ? "block"
          : "none";
    });
  }

  // поиск (если есть поле)
  const si = document.getElementById("searchInput");
  if (si && !si.__bound) {
    si.__bound = true;
    si.addEventListener("input", applySearch);
  }
});

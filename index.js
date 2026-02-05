/* =========================================================
   НАСТРОЙКИ
========================================================= */

// GitHub Pages base path (например, /meronq/)
const BASE_PATH = location.pathname.endsWith("/")
  ? location.pathname
  : location.pathname.replace(/\/[^/]*$/, "/");

// Список магазинов
const STORES_INDEX_URL = `${BASE_PATH}stores/index.json`;

// Worker (KV + Telegram)
const WORKER_BASE_URL = "https://meronq.edulik844.workers.dev";
const WORKER_ORDERS_PATH = "/orders";
const WORKER_STATUS_PATH = "/order-status";

// Ключ для запросов сайта -> Worker (должен совпадать с env.API_KEY в Worker)
const API_KEY = "meronq_Secret_2026!";

// WhatsApp номер для клиента (куда отправлять текст клиенту)
const WHATSAPP_NUMBER = "37443797727";

// минимальная сумма товаров
const MIN_ITEMS_TOTAL = 3000;

// Приводим относительные пути к GitHub Pages (/meronq/...)
function assetUrl(p) {
  if (!p) return "";
  const s = String(p);
  if (/^(https?:)?\/\//.test(s) || s.startsWith("data:")) return s;
  if (s.startsWith(BASE_PATH)) return s;
  const clean = s.startsWith("/") ? s.slice(1) : s;
  return `${BASE_PATH}${clean}`;
}

// статусы
const STATUS_LABELS = {
  new: "🆕 Новый заказ",
  payment_confirmed: "✅ Оплата подтверждена",
  preparing: "🧺 Собираем заказ",
  assembled: "📦 Заказ собран",
  picked: "🛵 Курьер забрал заказ",
  on_the_way: "🚗 В пути",
  delivered: "🎉 Доставлено",
};

/* =========================================================
   ГЛОБАЛЬНЫЕ ДАННЫЕ
========================================================= */
let stores = []; // список магазинов из stores/index.json
let currentStoreId = null;
let currentCategory = null;

// carts: { [storeId]: { [productId]: {id,name,price,qty,storeId,storeName,unitPrice,totalPrice,storeKey} } }
let carts = JSON.parse(localStorage.getItem("carts") || "{}");

// history
let orderHistory = JSON.parse(localStorage.getItem("orderHistory") || "[]");

// polling
let statusPollTimer = null;

/* =========================================================
   УТИЛИТЫ
========================================================= */
function saveCarts() {
  localStorage.setItem("carts", JSON.stringify(carts));
}

function money(n) {
  const x = Number(n || 0);
  return Math.round(x).toString();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function goHome() {
  document.getElementById("home-page")?.classList.remove("hidden");
  document.getElementById("store-page")?.classList.add("hidden");
  currentStoreId = null;
  currentCategory = null;
  window.location.hash = "#shops";
}

function goBack() {
  // если был список товаров — вернём категории
  if (currentCategory) {
    currentCategory = null;
    renderCategories(currentStoreId);
    return;
  }
  goHome();
}

function toggleTheme() {
  document.body.classList.toggle("light-theme");
}

/* =========================================================
   ЗАГРУЗКА МАГАЗИНОВ
========================================================= */
async function loadStores() {
  const loading = document.getElementById("loading-shops");
  if (loading) loading.style.display = "block";

  const r = await fetch(STORES_INDEX_URL, { cache: "no-store" });
  if (!r.ok) throw new Error("Не удалось загрузить stores/index.json");

  const data = await r.json();
  const arr = Array.isArray(data?.stores) ? data.stores : [];
  stores = arr
    .filter(s => s && s.enabled)
    .map(s => ({
      id: s.id,
      name: s.name,
      logo: s.logo || "",
      workingHours: s.workingHours || null,
    }));

  renderShops();
  if (loading) loading.style.display = "none";
}

function renderShops() {
  const list = document.getElementById("shops-list");
  if (!list) return;

  list.innerHTML = "";

  for (const s of stores) {
    const div = document.createElement("div");
    div.className = "card";
    div.onclick = () => openStore(s.id);

    div.innerHTML = s.logo
      ? `<img src="${assetUrl(s.logo)}" alt="${escapeHtml(s.name)}"
              style="max-width: 120px; max-height: 80px; object-fit: contain; margin-bottom: 10px;"
              onerror="this.style.display='none'">
         <div>${escapeHtml(s.name)}</div>`
      : `<span class="icon">🏬</span><div>${escapeHtml(s.name)}</div>`;

    list.appendChild(div);
  }
}

/* =========================================================
   МЕНЮ (CSV) + КАТЕГОРИИ
========================================================= */
async function loadStoreMenuCSV(store) {
  if (!store.menu) {
    return { ok: false, items: [] };
  }

  const url = assetUrl(store.menu);

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return { ok: false, items: [] };
    }

    const text = await r.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 && /category/i.test(lines[i])) continue;

      const parts = lines[i].split(",").map(x => x.trim());
      if (parts.length < 3) continue;

      rows.push({
        category: parts[0],
        name: parts[1],
        price: Number(parts[2]) || 0
      });
    }

    return { ok: true, items: rows };

  } catch {
    return { ok: false, items: [] };
  }
}


function buildCategories(menuRows) {
  const map = new Map();
  for (const it of menuRows) {
    if (!map.has(it.category)) map.set(it.category, []);
    map.get(it.category).push(it);
  }
  return map;
}

/* =========================================================
   ОТРИСОВКА СТРАНИЦЫ МАГАЗИНА
========================================================= */
let currentMenu = [];       // массив товаров текущего магазина
let currentCats = new Map();// category -> items

async function openStore(storeId) {
  currentStoreId = storeId;
  currentCategory = null;

  document.getElementById("home-page")?.classList.add("hidden");
  document.getElementById("store-page")?.classList.remove("hidden");

  const store = stores.find(s => s.id === storeId);
  document.getElementById("store-title").innerText = store ? store.name : "";

  // load menu
  try {
    const result = await loadStoreMenuCSV(store);

if (!result.ok || result.items.length === 0) {
  document.getElementById("store-products").innerHTML =
    `<div class="loading">❌ Меню временно недоступно</div>`;
  return;
}

currentMenu = result.items;
currentCats = buildCategories(currentMenu);
renderCategories(store.id);

  } catch (e) {
    console.error(e);
    document.getElementById("categories-block")?.classList.add("hidden");
    document.getElementById("store-products").innerHTML =
      `<div class="loading">Не удалось загрузить меню магазина.</div>`;
  }
}

function renderCategories(storeId) {
  const block = document.getElementById("categories-block");
  const list = document.getElementById("categories-list");
  const productsEl = document.getElementById("store-products");
  if (!block || !list || !productsEl) return;

  productsEl.innerHTML = "";
  list.innerHTML = "";

  block.classList.remove("hidden");

  for (const [cat] of currentCats.entries()) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<span class="icon">🗂️</span><div>${escapeHtml(cat)}</div>`;
    div.onclick = () => openCategory(cat);
    list.appendChild(div);
  }
}

function openCategory(cat) {
  currentCategory = cat;
  document.getElementById("categories-block")?.classList.add("hidden");
  renderProducts(cat);
}

function renderProducts(cat) {
  const productsEl = document.getElementById("store-products");
  if (!productsEl) return;

  const store = stores.find(s => s.id === currentStoreId);
  const storeName = store?.name || currentStoreId;

  const items = currentCats.get(cat) || [];
  productsEl.innerHTML = "";

  for (const it of items) {
    const productId = `${currentStoreId}::${cat}::${it.name}`;

    const qty = getQty(currentStoreId, productId);

    const row = document.createElement("div");
    row.className = "product";

    row.innerHTML = `
      <div style="display:flex;gap:14px;align-items:center;">
        <img src="${assetUrl(it.photo)}" alt="${escapeHtml(it.name)}" onerror="this.style.display='none'">
        <div>
          <h4>${escapeHtml(it.name)}</h4>
          <p>${escapeHtml(cat)} • ${money(it.price)} AMD</p>
        </div>
      </div>

      <div class="qty-controls">
        <button onclick="event.stopPropagation(); decItem('${escapeHtml(currentStoreId)}','${escapeHtml(productId)}','${escapeHtml(it.name)}',${Number(it.price) || 0},'${escapeHtml(storeName)}')">−</button>
        <div class="qty-number" id="qty-${btoa(productId).replace(/=/g,'')}">${qty}</div>
        <button onclick="event.stopPropagation(); incItem('${escapeHtml(currentStoreId)}','${escapeHtml(productId)}','${escapeHtml(it.name)}',${Number(it.price) || 0},'${escapeHtml(storeName)}')">+</button>
      </div>
    `;

    productsEl.appendChild(row);
  }
}

/* =========================================================
   КОРЗИНА
========================================================= */
function getQty(storeId, productId) {
  const storeCart = carts[storeId] || {};
  return storeCart[productId]?.qty || 0;
}

function setQtyUI(productId, qty) {
  const id = `qty-${btoa(productId).replace(/=/g, "")}`;
  const el = document.getElementById(id);
  if (el) el.innerText = String(qty);
}

function incItem(storeId, productId, name, unitPrice, storeName) {
  carts[storeId] = carts[storeId] || {};
  const storeCart = carts[storeId];

  const existing = storeCart[productId];
  const qty = (existing?.qty || 0) + 1;

  storeCart[productId] = {
    id: productId,
    name,
    storeId,
    storeKey: storeId,
    storeName,
    unitPrice: Number(unitPrice) || 0,
    qty,
    totalPrice: (Number(unitPrice) || 0) * qty,
  };

  saveCarts();
  setQtyUI(productId, qty);
  renderGlobalCart();
  pulseCart();
}

function decItem(storeId, productId, name, unitPrice, storeName) {
  carts[storeId] = carts[storeId] || {};
  const storeCart = carts[storeId];

  const existing = storeCart[productId];
  const qty = (existing?.qty || 0) - 1;

  if (qty <= 0) {
    delete storeCart[productId];
  } else {
    storeCart[productId] = {
      id: productId,
      name,
      storeId,
      storeKey: storeId,
      storeName,
      unitPrice: Number(unitPrice) || 0,
      qty,
      totalPrice: (Number(unitPrice) || 0) * qty,
    };
  }

  saveCarts();
  setQtyUI(productId, Math.max(qty, 0));
  renderGlobalCart();
}

function buildProductsFromCarts(cartsObj, storesArr) {
  const result = [];
  for (const [storeId, storeCart] of Object.entries(cartsObj || {})) {
    const store = (storesArr || []).find(s => s.id === storeId);
    const storeName = store?.name || storeId;

    for (const item of Object.values(storeCart || {})) {
      const qty = Number(item.qty || 0);
      if (!qty) continue;

      const unit = Number(item.unitPrice || item.price || 0);
      result.push({
        storeKey: storeId,
        storeName,
        id: item.id,
        name: item.name,
        quantity: qty,
        unitPrice: unit,
        totalPrice: unit * qty,
      });
    }
  }
  return result;
}

// доставка по районам (пример: использует текст из select)
function calcDelivery(district) {
  const s = String(district || "");
  if (s.includes("Артик")) return 500;
  if (s.includes("Арич")) return 700;
  if (s.includes("Нор-Кянк")) return 1000;
  if (s.includes("Пемзашен")) return 1000;
  return 0;
}

function calcTotals(products, district) {
  const itemsTotal = (products || []).reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0);
  const delivery = calcDelivery(district);
  const grandTotal = itemsTotal + delivery;
  return { itemsTotal, delivery, grandTotal };
}

function renderGlobalCart() {
  const itemsEl = document.getElementById("global-cart-items");
  const totalEl = document.getElementById("global-cart-total");
  const delEl = document.getElementById("delivery-total");
  const grandEl = document.getElementById("grand-total");
  if (!itemsEl || !totalEl || !delEl || !grandEl) return;

  const products = buildProductsFromCarts(carts, stores);
  if (!products.length) {
    itemsEl.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Корзина пуста</p>`;
    totalEl.innerText = "Товары: 0 AMD";
    delEl.innerText = "Доставка: 0 AMD";
    grandEl.innerText = "Итого: 0 AMD";
    return;
  }

  itemsEl.innerHTML = "";
  for (const p of products) {
    const row = document.createElement("div");
    row.className = "cart-item";

    row.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:2px;">
        <div><strong>${escapeHtml(p.name)}</strong> × ${p.quantity}</div>
        <span>${escapeHtml(p.storeName)} • ${money(p.unitPrice)} AMD</span>
      </div>
      <div style="margin-left:auto;font-weight:600;">${money(p.totalPrice)} AMD</div>
    `;

    itemsEl.appendChild(row);
  }

  // totals from district
  const district = document.getElementById("district")?.value || "";
  const totals = calcTotals(products, district);

  totalEl.innerText = `Товары: ${money(totals.itemsTotal)} AMD`;
  delEl.innerText = `Доставка: ${money(totals.delivery)} AMD`;
  grandEl.innerText = `Итого: ${money(totals.grandTotal)} AMD`;
}

function pulseCart() {
  const el = document.querySelector(".floating-cart");
  if (!el) return;
  el.classList.add("pulse");
  setTimeout(() => el.classList.remove("pulse"), 500);
}

/* =========================================================
   ИСТОРИЯ ЗАКАЗОВ
========================================================= */
function saveOrderToHistory(entry) {
  orderHistory.unshift(entry);
  orderHistory = orderHistory.slice(0, 50);
  localStorage.setItem("orderHistory", JSON.stringify(orderHistory));
}

function showOrderHistory() {
  let html = `<div class="section"><h3>📱 История заказов</h3>`;
  if (!orderHistory.length) {
    html += `<div class="loading">История пуста</div></div>`;
  } else {
    html += `<div class="cart" style="max-width:800px;">`;
    for (const o of orderHistory) {
      html += `
        <div style="padding:12px;border-bottom:1px solid rgba(0,0,0,0.08);">
          <div style="font-weight:700;">#${escapeHtml(o.orderId)} • ${escapeHtml(o.status || "new")}</div>
          <div style="color:var(--text-muted);font-size:13px;">${escapeHtml(o.date)}</div>
          <div style="margin-top:6px;">${escapeHtml(o.address)} • ${escapeHtml(o.district)} • ${escapeHtml(o.payment)}</div>
          <div style="margin-top:6px;font-weight:700;">Итого: ${money(o.total)} AMD</div>
        </div>
      `;
    }
    html += `</div></div>`;
  }

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(`
      <html><head><meta charset="utf-8"><title>История заказов</title></head>
      <body style="font-family:Inter,Arial,sans-serif;background:#f7f7f9;margin:0;padding:0;">
      ${html}
      </body></html>
    `);
    w.document.close();
  }
}

function fillFromLastOrder() {
  const last = orderHistory[0];
  if (!last) return;
  document.getElementById("name").value = last.name || "";
  document.getElementById("phone").value = last.phone || "";
  document.getElementById("address").value = last.address || "";
  document.getElementById("district").value = last.district || "";
  document.getElementById("payment").value = last.payment || "Наличные курьеру";
}

/* =========================================================
   WORKER API
========================================================= */
async function createOrderInWorker(payload) {
  const r = await fetch(`${WORKER_BASE_URL}${WORKER_ORDERS_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok || !data?.orderId) {
    throw new Error(data?.error || `Worker error: ${r.status}`);
  }
  return data.orderId;
}

async function fetchOrderStatus(orderId) {
  const r = await fetch(`${WORKER_BASE_URL}${WORKER_STATUS_PATH}?id=${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: { "x-api-key": API_KEY },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) return null;
  return data;
}

function stopStatusPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = null;
}

function startStatusPolling(orderId) {
  stopStatusPolling();
  updateStatusUI(orderId);
  statusPollTimer = setInterval(() => updateStatusUI(orderId), 5000);
}

async function updateStatusUI(orderId) {
  const data = await fetchOrderStatus(orderId);
  if (!data) return;

  const label = STATUS_LABELS[data.status] || data.status;

  let el = document.getElementById("order-status");
  if (!el) {
    el = document.createElement("div");
    el.id = "order-status";
    el.style.cssText =
      "margin-top:10px;padding:10px;border-radius:10px;" +
      "background:#2ecc71;color:#0f1115;font-weight:700;text-align:center;";
    document.querySelector("#grand-total")?.after(el);
  }

  el.innerText = `Статус заказа #${orderId}: ${label}`;

  if (data.status === "delivered") {
    stopStatusPolling();
    localStorage.removeItem("activeOrderId");
  }
}

/* =========================================================
   ОФОРМЛЕНИЕ ЗАКАЗА
========================================================= */
async function placeOrder() {
  const name = document.getElementById("name")?.value.trim();
  const phone = document.getElementById("phone")?.value.trim();
  const address = document.getElementById("address")?.value.trim();
  const district = document.getElementById("district")?.value;
  const payment = document.getElementById("payment")?.value;
  const comment = document.getElementById("comment")?.value.trim();

  if (!name || !phone || !address || !district) {
    alert("Заполните имя, телефон, адрес и район.");
    return;
  }

  const products = buildProductsFromCarts(carts, stores);
  if (!products.length) {
    alert("Корзина пуста. Добавьте товары.");
    return;
  }

  const totals = calcTotals(products, district);
  if (totals.itemsTotal < MIN_ITEMS_TOTAL) {
    alert(`Минимальная сумма товаров ${MIN_ITEMS_TOTAL} AMD.\nСейчас: ${totals.itemsTotal} AMD`);
    return;
  }

  const payload = {
    createdAt: new Date().toISOString(),
    name,
    phone,
    address,
    district,
    payment,
    comment,
    carts,
    products,
    totals,
  };

  try {
    // 1) создать заказ в worker (KV)
    const orderId = await createOrderInWorker(payload);

    // 2) сохранить историю + запустить синхронизацию статуса
    saveOrderToHistory({
      orderId,
      date: payload.createdAt,
      name,
      phone,
      address,
      district,
      payment,
      carts: JSON.parse(JSON.stringify(carts)),
      total: totals.grandTotal,
      status: "new",
    });

    localStorage.setItem("activeOrderId", orderId);
    startStatusPolling(orderId);

    // 3) WhatsApp клиенту (если нужно)
    const waText =
      `🛒 Заказ принят!\n` +
      `Номер: ${orderId}\n` +
      `Оплата: ${payment}\n` +
      `Итого: ${totals.grandTotal} AMD\n` +
      `Адрес: ${address}\n` +
      `Район: ${district}\n\n` +
      `Статус будет обновляться.`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`, "_blank");

    alert(`✅ Заказ отправлен!\nНомер: ${orderId}\nСтатус будет обновляться автоматически.`);

    // 4) очистить корзину
    carts = {};
    saveCarts();
    renderGlobalCart();

  } catch (e) {
    console.error(e);
    alert("❌ Не удалось отправить заказ.\n\n" + (e?.message || ""));
  }
}

/* =========================================================
   ПОИСК
========================================================= */
function setupSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!currentStoreId || !currentCategory) return;

    const items = (currentCats.get(currentCategory) || []);
    const filtered = q ? items.filter(x => x.name.toLowerCase().includes(q)) : items;

    const productsEl = document.getElementById("store-products");
    if (!productsEl) return;
    productsEl.innerHTML = "";

    const store = stores.find(s => s.id === currentStoreId);
    const storeName = store?.name || currentStoreId;

    for (const it of filtered) {
      const productId = `${currentStoreId}::${currentCategory}::${it.name}`;
      const qty = getQty(currentStoreId, productId);

      const row = document.createElement("div");
      row.className = "product";
      row.innerHTML = `
        <div style="display:flex;gap:14px;align-items:center;">
          <img src="${assetUrl(it.photo)}" alt="${escapeHtml(it.name)}" onerror="this.style.display='none'">
          <div>
            <h4>${escapeHtml(it.name)}</h4>
            <p>${escapeHtml(currentCategory)} • ${money(it.price)} AMD</p>
          </div>
        </div>

        <div class="qty-controls">
          <button onclick="event.stopPropagation(); decItem('${escapeHtml(currentStoreId)}','${escapeHtml(productId)}','${escapeHtml(it.name)}',${Number(it.price) || 0},'${escapeHtml(storeName)}')">−</button>
          <div class="qty-number" id="qty-${btoa(productId).replace(/=/g,'')}">${qty}</div>
          <button onclick="event.stopPropagation(); incItem('${escapeHtml(currentStoreId)}','${escapeHtml(productId)}','${escapeHtml(it.name)}',${Number(it.price) || 0},'${escapeHtml(storeName)}')">+</button>
        </div>
      `;
      productsEl.appendChild(row);
    }
  });
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadStores();
  } catch (e) {
    console.error(e);
    const loading = document.getElementById("loading-shops");
    if (loading) loading.innerText = "Не удалось загрузить магазины.";
  }

  renderGlobalCart();
  setupSearch();

  const activeOrderId = localStorage.getItem("activeOrderId");
  if (activeOrderId) startStatusPolling(activeOrderId);
});

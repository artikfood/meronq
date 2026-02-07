/* =========================================================
   MERONQ / ARTIK FOOD — site.js (STABLE ARCHITECTURE)
   ✅ Магазин → Категории → Товары категории
   ✅ Корзина (+/−) с числом между кнопками
   ✅ Поиск по товарам (внутри выбранного магазина)
   ✅ Заказ на Worker (/orders) + x-api-key
   ✅ История заказов (modal) + “Данные из последнего заказа”
   ✅ Показ карты только при “Перевод”
   ⚠️ НЕ ТРОГАЙ блоки "CORE". Меняй только CONFIG и тексты.
========================================================= */

/* ===================== CONFIG (МОЖНО МЕНЯТЬ) ===================== */
const CONFIG = {
  basePath: window.location.pathname.includes("/meronq/") ? "/meronq/" : "/",
  storesIndexCandidates: [
    "stores/index.json", // основной путь
    "index.json"         // запасной
  ],
  workerOrdersUrl: "https://meronq.edulik844.workers.dev/orders",
  apiKey: "meronq_Secret_2026!",
  imageExtensionsTry: ["jpg", "jpeg", "png", "webp"],
  historyLimit: 30,
};

const LS_KEYS = {
  last: "meronq_last_order_v1",
  history: "meronq_order_history_v1",
};

/* ===================== CORE (НЕ ТРОГАТЬ) ===================== */
const $ = (id) => document.getElementById(id);

const state = {
  stores: {},                 // storeId -> store meta
  cart: {},                   // storeId -> { productName -> { qty, price } }
  currentStoreId: null,
  currentCategories: {},      // category -> products[]
  currentCategory: null,
  searchQuery: "",
};

/* ---------------- helpers ---------------- */
function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function assetUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return CONFIG.basePath + clean;
}

function formatAmd(n) {
  return `${Number(n || 0).toLocaleString()} AMD`;
}

function computeDelivery(district) {
  if (district === "Артик") return 500;
  if (district === "Арич") return 700;
  if (district === "Нор-Кянк") return 1000;
  if (district === "Пемзашен") return 1000;
  return 0;
}

// Для URL (важно для кириллицы/пробелов в названиях)
function encFileName(name) {
  // НЕ делаем slug принудительно, чтобы у тебя работало “как есть”.
  // Просто кодируем URL-safe: пробел -> %20, кириллица -> %D0...
  return encodeURIComponent(String(name || "").trim());
}

/* ===================== NAV / PAGES ===================== */
function showHome() {
  $("home-page")?.classList.remove("hidden");
  $("store-page")?.classList.add("hidden");
  window.scrollTo(0, 0);
}
function showStore() {
  $("home-page")?.classList.add("hidden");
  $("store-page")?.classList.remove("hidden");
  window.scrollTo(0, 0);
}
function goHome() { showHome(); }
function goBack() { showHome(); }

// Тема
function toggleTheme() {
  document.body.classList.toggle("light-theme");
}

// Заглушки если они есть в HTML
function submitReview() { alert("Отзывы — скоро"); }

/* ===================== HISTORY MODAL ===================== */
function openHistoryModal() {
  const modal = $("history-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}
function closeOrderHistory() {
  const modal = $("history-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
}

function getHistory() {
  return safeParse(localStorage.getItem(LS_KEYS.history), []);
}
function saveLastOrder(orderData, serverResult) {
  const record = {
    id: serverResult?.orderId || null,
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

  localStorage.setItem(LS_KEYS.last, JSON.stringify(record));

  const history = getHistory();
  history.unshift(record);
  localStorage.setItem(
    LS_KEYS.history,
    JSON.stringify(history.slice(0, CONFIG.historyLimit))
  );
}

function renderHistoryList() {
  const list = $("history-list");
  if (!list) return;

  const history = getHistory();
  if (!history.length) {
    list.innerHTML = `<div style="padding:16px;color:var(--text-muted);text-align:center">История пуста</div>`;
    return;
  }

  list.innerHTML = history.map((h, idx) => {
    const dt = new Date(h.at);
    const nice = isNaN(dt.getTime()) ? h.at : dt.toLocaleString();
    const grand = h?.totals?.grandTotal;

    return `
      <div style="
        border:1px solid var(--border-glass);
        background:linear-gradient(180deg,var(--bg-glass),rgba(255,255,255,0.02));
        border-radius:16px; padding:12px; margin-bottom:10px;
      ">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="font-weight:800;color:var(--text-main)">
            ${h.id ? `Заказ #${h.id}` : "Заказ"}
          </div>
          <div style="color:var(--text-muted);font-size:13px">${nice}</div>
        </div>

        <div style="margin-top:6px;color:var(--text-muted);font-size:13px">
          👤 ${h.customer?.name || ""} • 📞 ${h.customer?.phone || ""}
        </div>
        <div style="margin-top:4px;color:var(--text-muted);font-size:13px">
          📍 ${h.customer?.address || ""} • 🏙 ${h.customer?.district || ""} • 💳 ${h.customer?.payment || ""}
        </div>

        ${grand != null ? `<div style="margin-top:8px;font-weight:800;color:var(--accent-gold)">Итого: ${Number(grand).toLocaleString()} AMD</div>` : ""}

        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px">
          <button onclick="useHistoryOrder(${idx})" style="
            padding:9px 12px;border-radius:999px;
            border:1px solid var(--border-glass);
            background:var(--bg-glass); color:var(--text-main);
            cursor:pointer;font-weight:700
          ">Заполнить форму</button>
        </div>
      </div>
    `;
  }).join("");
}

function showOrderHistory() {
  renderHistoryList();
  openHistoryModal();
}

function clearOrderHistory() {
  localStorage.removeItem(LS_KEYS.history);
  renderHistoryList();
}

function fillFromLastOrder() {
  const rec = safeParse(localStorage.getItem(LS_KEYS.last), null);
  if (!rec) return alert("Нет данных последнего заказа");

  const c = rec.customer || {};
  const setVal = (id, val) => {
    const el = $(id);
    if (el) el.value = val ?? "";
  };

  setVal("name", c.name);
  setVal("phone", c.phone);
  setVal("address", c.address);
  setVal("district", c.district);
  setVal("payment", c.payment);
  setVal("comment", c.comment);

  syncCardInfoVisibility();
  $("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

function useHistoryOrder(index) {
  const history = getHistory();
  const rec = history[index];
  if (!rec) return;

  const c = rec.customer || {};
  const setVal = (id, val) => {
    const el = $(id);
    if (el) el.value = val ?? "";
  };

  setVal("name", c.name);
  setVal("phone", c.phone);
  setVal("address", c.address);
  setVal("district", c.district);
  setVal("payment", c.payment);
  setVal("comment", c.comment);

  syncCardInfoVisibility();
  closeOrderHistory();
  $("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

/* ===================== PAYMENT CARD VISIBILITY ===================== */
function syncCardInfoVisibility() {
  const payment = $("payment");
  const cardInfo = $("card-info");
  if (!payment || !cardInfo) return;

  const v = String(payment.value || "").toLowerCase();
  cardInfo.style.display = v.includes("перевод") ? "block" : "none";
}

/* ===================== STORES LOAD ===================== */
async function fetchStoresIndex() {
  let lastErr = null;

  for (const rel of CONFIG.storesIndexCandidates) {
    try {
      const url = assetUrl(rel);
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw (lastErr || new Error("Не удалось загрузить index.json"));
}

async function loadStores() {
  const container = $("shops-list");
  const loading = $("loading-shops");
  if (!container) return;

  try {
    const data = await fetchStoresIndex();

    if (loading) loading.style.display = "none";
    container.innerHTML = "";

    (data.stores || []).forEach((store) => {
      if (!store?.enabled) return;

      state.stores[store.id] = store;

      const card = document.createElement("div");
      card.className = "card";
      card.onclick = () => openStore(store.id);

      card.innerHTML = `
        <span class="icon">🏪</span>
        <div>${store.name}</div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
          🕙 ${store.workingHours?.open || "09:00"} - ${store.workingHours?.close || "22:00"}
        </div>
      `;
      container.appendChild(card);
    });

    if (!container.children.length) {
      container.innerHTML = `<div class="loading">Магазины не найдены</div>`;
    }

  } catch (e) {
    console.error("loadStores error:", e);
    if (loading) loading.innerHTML = `<div style="color:#ff6b6b;">❌ ${e.message}</div>`;
  }
}

/* ===================== STORE OPEN + CSV PARSE ===================== */
async function openStore(storeId) {
  const store = state.stores[storeId];
  if (!store) return;

  state.currentStoreId = storeId;
  state.currentCategory = null;
  state.searchQuery = "";

  showStore();

  const title = $("store-title");
  if (title) title.textContent = store.name;

  const productsBox = $("store-products");
  const categoriesBlock = $("categories-block");
  const categoriesList = $("categories-list");

  if (productsBox) productsBox.innerHTML = "";
  if (categoriesList) categoriesList.innerHTML = "";
  if (categoriesBlock) categoriesBlock.classList.add("hidden");

  if (productsBox) productsBox.innerHTML = `<div class="loading">Загрузка меню...</div>`;

  try {
    const r = await fetch(assetUrl(store.menu), { cache: "no-store" });
    if (!r.ok) throw new Error(`Меню не найдено (${r.status})`);
    const csv = await r.text();

    const categories = parseCsvToCategories(csv);
    state.currentCategories = categories;

    renderCategoriesList(Object.keys(categories).sort());
    if (categoriesBlock) categoriesBlock.classList.remove("hidden");

    // По умолчанию показываем только категории, а список товаров пуст
    if (productsBox) productsBox.innerHTML = `<div class="loading">Выберите категорию</div>`;

  } catch (e) {
    console.error("openStore menu error:", e);
    if (productsBox) productsBox.innerHTML = `<div class="loading" style="color:#ff6b6b;">❌ ${e.message}</div>`;
  }
}

function parseCsvToCategories(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length <= 1) return {};

  const categories = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map(s => (s || "").replace(/^"|"$/g, "").trim());

    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const priceRaw = cols[3] || "0";
    const imageRaw = cols[4] || ""; // можно пусто

    if (!name) continue;

    const price = parseInt(String(priceRaw).split("/")[0].replace(/[^\d]/g, ""), 10) || 0;

    (categories[category] ||= []).push({
      category,
      name,
      desc,
      price,
      image: imageRaw,
    });
  }
  return categories;
}

/* ===================== CATEGORIES UI ===================== */
function renderCategoriesList(categories) {
  const list = $("categories-list");
  if (!list) return;

  list.innerHTML = "";

  categories.forEach((cat) => {
    const d = document.createElement("div");
    d.className = "card";
    d.onclick = () => openCategory(cat);
    d.innerHTML = `<span class="icon">📂</span><div>${cat}</div>`;
    list.appendChild(d);
  });
}

function openCategory(category) {
  state.currentCategory = category;
  renderProductsForCurrent();
}

/* ===================== SEARCH ===================== */
function attachSearch() {
  const input = $("searchInput");
  if (!input) return;

  input.addEventListener("input", () => {
    state.searchQuery = String(input.value || "").trim().toLowerCase();
    renderProductsForCurrent();
  });
}

/* ===================== PRODUCTS RENDER ===================== */
function productImageUrl(storeId, product) {
  // 1) Если в CSV указан файл изображения — используем его
  if (product.image) {
    // допускаем что пользователь пишет "photo.jpg" или "folder/photo.png"
    // если просто имя — кладём в stores/<id>/images/
    const raw = String(product.image).trim();
    if (raw.includes("/") || raw.includes(".")) {
      return assetUrl(raw.startsWith("stores/") ? raw : `stores/${storeId}/images/${raw}`);
    }
  }

  // 2) Иначе пробуем по названию блюда (как у тебя сейчас)
  // Важно: кодируем имя для URL
  const base = `stores/${storeId}/images/${encFileName(product.name)}`;
  // Вернём “виртуальный” путь без расширения — расширения попробуем через onerror
  return assetUrl(base);
}

function renderProductsForCurrent() {
  const storeId = state.currentStoreId;
  const productsBox = $("store-products");
  if (!storeId || !productsBox) return;

  const cat = state.currentCategory;
  if (!cat) {
    productsBox.innerHTML = `<div class="loading">Выберите категорию</div>`;
    return;
  }

  let products = state.currentCategories?.[cat] || [];

  // поиск внутри категории
  const q = state.searchQuery;
  if (q) {
    products = products.filter(p =>
      String(p.name || "").toLowerCase().includes(q) ||
      String(p.desc || "").toLowerCase().includes(q)
    );
  }

  if (!products.length) {
    productsBox.innerHTML = `<div class="loading">Ничего не найдено</div>`;
    return;
  }

  productsBox.innerHTML = "";

  products.forEach((p) => {
    const row = document.createElement("div");
    row.className = "product";

    const qty = getQty(storeId, p.name);
    const imgBase = productImageUrl(storeId, p); // без расширения если по имени

    // сделаем try jpg->png->webp, не ломая ничего
    const tries = CONFIG.imageExtensionsTry.map(ext => `${imgBase}.${ext}`);
    const fallbackSvg =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='26'%3E%F0%9F%93%A6%3C/text%3E%3C/svg%3E";

    // стартуем с .jpg по умолчанию
    const initial = tries[0] || fallbackSvg;

    const safeName = p.name.replace(/'/g, "\\'");

    row.innerHTML = `
      <img
        src="${initial}"
        alt="${p.name}"
        style="width:80px;height:80px;object-fit:cover;border-radius:14px"
        data-try="0"
        onerror="
          const arr = ${JSON.stringify(tries)};
          let i = Number(this.dataset.try || 0) + 1;
          this.dataset.try = String(i);
          if (arr[i]) { this.src = arr[i]; }
          else { this.src='${fallbackSvg}'; }
        "
      />
      <div style="flex:1;min-width:0">
        <h4 style="margin:0">${p.name}</h4>
        ${p.desc ? `<p style="margin:6px 0 0;color:var(--text-muted)">${p.desc}</p>` : ""}
        <p style="margin:6px 0 0;font-weight:700">${formatAmd(p.price)}</p>
      </div>
      <div class="qty-controls">
        <button onclick="changeQty('${storeId}','${safeName}',-1)">−</button>
        <span class="qty-number">${qty}</span>
        <button onclick="addToCart('${storeId}','${safeName}',${p.price})">+</button>
      </div>
    `;
    productsBox.appendChild(row);
  });

  updateCartDisplay();
}

/* ===================== CART ===================== */
function getQty(storeId, name) {
  return state.cart?.[storeId]?.[name]?.qty || 0;
}

function addToCart(storeId, name, price) {
  state.cart[storeId] ||= {};
  state.cart[storeId][name] ||= { qty: 0, price: Number(price || 0) };
  state.cart[storeId][name].qty += 1;
  updateCartDisplay();
}

function changeQty(storeId, name, delta) {
  const it = state.cart?.[storeId]?.[name];
  if (!it) return;

  it.qty += delta;
  if (it.qty <= 0) {
    delete state.cart[storeId][name];
    if (Object.keys(state.cart[storeId]).length === 0) delete state.cart[storeId];
  }
  updateCartDisplay();
}

function updateCartDisplay() {
  const cartBox = $("global-cart-items");
  const itemsTotalEl = $("global-cart-total");
  const deliveryEl = $("delivery-total");
  const grandEl = $("grand-total");
  if (!cartBox) return;

  cartBox.innerHTML = "";

  let itemsTotal = 0;
  let totalItems = 0;

  for (const storeId of Object.keys(state.cart)) {
    const store = state.stores[storeId] || { name: storeId };

    const header = document.createElement("div");
    header.style.margin = "12px 0 6px";
    header.style.fontWeight = "800";
    header.style.color = "var(--accent-gold)";
    header.textContent = store.name;
    cartBox.appendChild(header);

    for (const name of Object.keys(state.cart[storeId])) {
      const it = state.cart[storeId][name];
      totalItems += it.qty;
      itemsTotal += it.qty * it.price;

      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div style="flex:1;text-align:left;min-width:0">
          <div style="font-weight:700">${name}</div>
          <span>${formatAmd(it.price)} × ${it.qty} = ${formatAmd(it.price * it.qty)}</span>
        </div>
        <div class="qty-controls">
          <button onclick="changeQty('${storeId}','${name.replace(/'/g,"\\'")}',-1)">−</button>
          <span class="qty-number">${it.qty}</span>
          <button onclick="addToCart('${storeId}','${name.replace(/'/g,"\\'")}',${it.price})">+</button>
        </div>
      `;
      cartBox.appendChild(row);
    }
  }

  if (totalItems === 0) {
    cartBox.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Корзина пуста</p>`;
  }

  const district = $("district")?.value || "";
  const delivery = computeDelivery(district);
  const grand = itemsTotal + delivery;

  if (itemsTotalEl) itemsTotalEl.textContent = `Товары: ${formatAmd(itemsTotal)}`;
  if (deliveryEl) deliveryEl.textContent = `Доставка: ${formatAmd(delivery)}`;
  if (grandEl) grandEl.textContent = `Итого: ${formatAmd(grand)}`;
}

/* ===================== ORDER SUBMIT ===================== */
async function placeOrder() {
  const name = $("name")?.value.trim();
  const phone = $("phone")?.value.trim();
  const address = $("address")?.value.trim();
  const district = $("district")?.value || "";
  const payment = $("payment")?.value || "";
  const comment = $("comment")?.value.trim() || "";

  if (!name || !phone || !address) return alert("Заполни имя, телефон и адрес");
  if (Object.keys(state.cart).length === 0) return alert("Корзина пуста");

  const products = [];
  for (const storeId of Object.keys(state.cart)) {
    const store = state.stores[storeId];
    for (const pname of Object.keys(state.cart[storeId])) {
      const it = state.cart[storeId][pname];
      products.push({
        storeKey: storeId,
        storeName: store?.name || storeId,
        name: pname,
        quantity: it.qty,
        unitPrice: it.price,
        totalPrice: it.qty * it.price,
      });
    }
  }

  const itemsTotal = products.reduce((s, p) => s + (Number(p.totalPrice) || 0), 0);
  const delivery = computeDelivery(district);
  const grandTotal = itemsTotal + delivery;

  const orderData = {
    name, phone, address, district, payment, comment,
    products,
    totals: { itemsTotal, delivery, grandTotal },
  };

  // UI: кнопка "ОТПРАВЛЯЕМ..."
  const btn = document.querySelector(".btn-order, .order-form button");
  const oldTxt = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "ОТПРАВЛЯЕМ..."; }

  try {
    const r = await fetch(CONFIG.workerOrdersUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": CONFIG.apiKey },
      body: JSON.stringify(orderData),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    // ✅ сохраняем последний заказ + историю
    saveLastOrder(orderData, j);

    alert("✅ Заказ отправлен!");
    state.cart = {};
    updateCartDisplay();
    showHome();

  } catch (e) {
    console.error("placeOrder error:", e);
    alert("❌ Ошибка заказа: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldTxt || "📲 Отправить заказ"; }
  }
}

/* ===================== INIT ===================== */
document.addEventListener("DOMContentLoaded", () => {
  showHome();
  loadStores();
  attachSearch();

  // доставка пересчитывается при смене района
  $("district")?.addEventListener("change", () => {
    updateCartDisplay();
  });

  // показ карты при “Перевод”
  $("payment")?.addEventListener("change", syncCardInfoVisibility);
  syncCardInfoVisibility();

  // чтобы модалка истории точно была закрыта при старте
  closeOrderHistory();
});

/* ===================== EXPOSE to HTML (НЕ ТРОГАТЬ) ===================== */
window.openStore = openStore;
window.openCategory = openCategory;
window.addToCart = addToCart;
window.changeQty = changeQty;

window.goHome = goHome;
window.goBack = goBack;
window.toggleTheme = toggleTheme;

window.placeOrder = placeOrder;
window.showOrderHistory = showOrderHistory;
window.closeOrderHistory = closeOrderHistory;
window.clearOrderHistory = clearOrderHistory;
window.fillFromLastOrder = fillFromLastOrder;
window.useHistoryOrder = useHistoryOrder;

window.submitReview = submitReview;

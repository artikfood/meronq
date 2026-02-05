/* =========================================================
   НАСТРОЙКИ
========================================================= */

// GitHub Pages base path (/meronq/)
const BASE_PATH = location.pathname.endsWith("/")
  ? location.pathname
  : location.pathname.replace(/\/[^/]*$/, "/");

// магазины
const STORES_INDEX_URL = `${BASE_PATH}stores/index.json`;

// Worker
const WORKER_BASE_URL = "https://meronq.edulik844.workers.dev";
const WORKER_ORDERS_PATH = "/orders";
const WORKER_STATUS_PATH = "/order-status";

// WhatsApp номер для клиента
const WHATSAPP_NUMBER = "37443797727";


// минимальная сумма товаров
const MIN_ITEMS_TOTAL = 3000;

// статусы
const STATUS_LABELS = {
  new: "🆕 Новый заказ",
  payment_confirmed: "✅ Оплата подтверждена",
  preparing: "🧺 Собираем заказ",
  assembled: "📦 Заказ собран",
  picked: "🛵 Забрать заказ",
  on_the_way: "🚗 В пути",
  delivered: "🎉 Доставлено",
};

/* =========================================================
   ГЛОБАЛЬНЫЕ ДАННЫЕ
========================================================= */
let stores = {};      // { storeKey: { name, logo, workingHours, products[], categories{} } }
let carts = {};       // { storeKey: { productName: qty } }
let currentStore = null;
let currentCategory = null;

let statusPollTimer = null;

/* =========================================================
   УТИЛИТЫ
========================================================= */
function jsSafe(str) { return encodeURIComponent(String(str)); }
function decodeSafe(str) { try { return decodeURIComponent(str); } catch { return String(str); } }

function qtyId(storeKey, productName) {
  return `qty_${storeKey}_${btoa(unescape(encodeURIComponent(productName))).replace(/=+$/,'')}`;
}

function parsePriceToNumber(priceText) {
  const s = String(priceText ?? "").trim();
  if (!s) return 0;
  const first = s.split("/")[0].trim();
  const n = Number(String(first).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getProductImage(photo) {
  if (!photo) {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='40'%3E%F0%9F%93%A6%3C/text%3E%3C/svg%3E";
  }
  return photo;
}

/* =========================================================
   НАВИГАЦИЯ
========================================================= */
function hideAllPages() {
  document.getElementById("home-page")?.classList.add("hidden");
  document.getElementById("store-page")?.classList.add("hidden");
}

function goHome() {
  currentStore = null;
  currentCategory = null;
  hideAllPages();
  document.getElementById("home-page")?.classList.remove("hidden");
}

function goBack() {
  if (!currentStore) return goHome();
  if (currentCategory) {
    currentCategory = null;
    openStore(currentStore);
    return;
  }
  goHome();
}

/* =========================================================
   ЗАГРУЗКА МАГАЗИНОВ / МЕНЮ
========================================================= */
async function loadStores() {
  const loading = document.getElementById("loading-shops");
  const listEl = document.getElementById("shops-list");
  if (loading) loading.style.display = "block";
  if (listEl) listEl.innerHTML = "";

  let indexData;
  try {
    const r = await fetch(STORES_INDEX_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("Не удалось загрузить stores/index.json");
    indexData = await r.json();
  } catch (e) {
    console.error(e);
    if (loading) loading.innerText = "Ошибка загрузки магазинов.";
    return;
  }

  stores = {};
  for (const s of (indexData.stores || [])) {
    if (!s?.id) continue;
    if (s.enabled === false) continue;
    stores[s.id] = {
      key: s.id,
      name: s.name || s.id,
      logo: s.logo || "",
      workingHours: s.workingHours || null,
      products: [],
      categories: {},
    };
  }

  const keys = Object.keys(stores);
  await Promise.all(keys.map(k => loadStoreMenuCSV(k)));

  renderStores();
  renderGlobalCart();

  if (loading) loading.style.display = "none";
}

async function loadStoreMenuCSV(storeKey) {
  const url = `${BASE_PATH}stores/${storeKey}/menu.csv`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Нет menu.csv: ${url}`);
    const text = await r.text();

    const rows = text.split("\n");
    const products = [];
    rows.forEach(row => {
      const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (cols.length < 3) return;

      const category = (cols[0] || "").trim().replace(/^"|"$/g, "");
      const desc = (cols[1] || "").trim().replace(/^"|"$/g, "");
      const name = (cols[2] || "").trim().replace(/^"|"$/g, "");
      const priceText = (cols[4] || "0").trim().replace(/^"|"$/g, "");

      if (!category || !name) return;

      products.push({
        category,
        name,
        description: desc,
        priceText,
        price: parsePriceToNumber(priceText),
        photo: `stores/${storeKey}/images/${encodeURIComponent(name)}.jpg`,
      });
    });

    stores[storeKey].products = products;

    const cats = {};
    products.forEach(p => {
      if (!cats[p.category]) cats[p.category] = { icon: "📦" };
    });
    stores[storeKey].categories = cats;
  } catch (e) {
    console.warn(e);
    stores[storeKey].products = [];
    stores[storeKey].categories = {};
  }
}

/* =========================================================
   РЕНДЕР МАГАЗИНОВ / КАТЕГОРИЙ / ТОВАРОВ
========================================================= */
function isStoreOpen(workingHours) {
  if (!workingHours?.open || !workingHours?.close) return null;
  try {
    const now = new Date();
    const [oh, om] = workingHours.open.split(":").map(Number);
    const [ch, cm] = workingHours.close.split(":").map(Number);
    const openM = oh * 60 + om;
    const closeM = ch * 60 + cm;
    const nowM = now.getHours() * 60 + now.getMinutes();
    if (closeM >= openM) return nowM >= openM && nowM <= closeM;
    return nowM >= openM || nowM <= closeM; // через полночь
  } catch { return null; }
}

function renderStores() {
  const container = document.getElementById("shops-list");
  if (!container) return;
  container.innerHTML = "";

  Object.keys(stores).forEach(key => {
    const s = stores[key];
    const openState = isStoreOpen(s.workingHours);

    const statusBadge =
      openState === null ? "" :
      openState ? `<div style="margin-top:8px; font-size:12px; color:#0f1115; background: linear-gradient(135deg,#2ecc71,#6df0a0); padding:6px 10px; border-radius:999px; display:inline-block; font-weight:700;">Открыто</div>`
                : `<div style="margin-top:8px; font-size:12px; color: var(--text-main); background: var(--bg-card); border: 1px solid var(--border-glass); padding:6px 10px; border-radius:999px; display:inline-block; font-weight:700;">Закрыто</div>`;

    const hoursText = s.workingHours?.open && s.workingHours?.close
      ? `<div style="margin-top:8px; font-size:12px; color: var(--text-muted);">${s.workingHours.open} - ${s.workingHours.close}</div>`
      : "";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = s.logo
      ? `<img src="${s.logo}" alt="${s.name}" style="max-width: 120px; max-height: 80px; object-fit: contain; margin-bottom: 10px;" onerror="this.style.display='none'">
         <div>${s.name}</div>${statusBadge}${hoursText}`
      : `<div>${s.name}</div>${statusBadge}${hoursText}`;

    div.onclick = () => openStore(key);
    container.appendChild(div);
  });
}

function openStore(storeKey) {
  currentStore = storeKey;
  currentCategory = null;

  hideAllPages();
  document.getElementById("store-page")?.classList.remove("hidden");
  const title = document.getElementById("store-title");
  if (title) title.innerText = stores[storeKey]?.name || storeKey;

  const hasCats = stores[storeKey]?.categories && Object.keys(stores[storeKey].categories).length > 0;
  const catsBlock = document.getElementById("categories-block");
  if (catsBlock) {
    if (hasCats) {
      catsBlock.classList.remove("hidden");
      renderCategories(storeKey);
    } else {
      catsBlock.classList.add("hidden");
    }
  }

  renderProducts(storeKey, null);
}

function renderCategories(storeKey) {
  const container = document.getElementById("categories-list");
  if (!container) return;
  container.innerHTML = "";

  Object.keys(stores[storeKey].categories).forEach(catName => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<span class="icon">${stores[storeKey].categories[catName].icon}</span><div>${catName}</div>`;
    div.onclick = () => {
      currentCategory = catName;
      document.getElementById("categories-block")?.classList.add("hidden");
      renderProducts(storeKey, catName);
    };
    container.appendChild(div);
  });
}

function renderProducts(storeKey, filterCategory = null) {
  const container = document.getElementById("store-products");
  if (!container) return;
  container.innerHTML = "";

  const backBtn = document.createElement("button");
  backBtn.className = "back-btn";
  backBtn.innerText = "← Назад";
  backBtn.onclick = () => {
    if (filterCategory) {
      currentCategory = null;
      openStore(storeKey);
    } else {
      goHome();
    }
  };
  container.appendChild(backBtn);

  const products = filterCategory
    ? stores[storeKey].products.filter(p => p.category === filterCategory)
    : stores[storeKey].products;

  products.forEach(product => {
    const div = document.createElement("div");
    div.className = "product";

    const safeName = jsSafe(product.name);
    const imageSrc = getProductImage(product.photo);

    div.innerHTML = `
      <div style="display:flex; gap:12px; align-items:center; flex:1;">
        <img src="${imageSrc}" alt="${product.name}" style="cursor:pointer;"
             onclick="showImageModal('${imageSrc}', '${safeName}')"
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'%3E%3Crect width=\\'80\\' height=\\'80\\' fill=\\'%23333\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'40\\'%3E📦%3C/text%3E%3C/svg%3E'">
        <div style="flex:1;">
          <h4>${product.name}</h4>
          <p style="color: var(--accent-gold); font-weight: 600;">${product.priceText ?? product.price} AMD</p>
          ${product.description ? `<p style="font-size:12px; color: var(--text-muted);">${product.description}</p>` : ""}
        </div>
      </div>

      <div class="qty-controls" onclick="event.stopPropagation()">
        <button onclick="changeQty('${storeKey}', '${safeName}', -1)">−</button>
        <span class="qty-number" id="${qtyId(storeKey, product.name)}">0</span>
        <button onclick="changeQty('${storeKey}', '${safeName}', 1)">+</button>
      </div>
    `;

    container.appendChild(div);

    const existing = carts?.[storeKey]?.[product.name] || 0;
    const el = document.getElementById(qtyId(storeKey, product.name));
    if (el) el.innerText = existing;
  });
}

/* =========================================================
   КОРЗИНА (общая)
========================================================= */
function changeQty(storeKey, productNameSafe, delta) {
  const productName = decodeSafe(productNameSafe);

  if (!carts[storeKey]) carts[storeKey] = {};
  if (!carts[storeKey][productName]) carts[storeKey][productName] = 0;

  carts[storeKey][productName] += delta;
  if (carts[storeKey][productName] < 0) carts[storeKey][productName] = 0;

  const el = document.getElementById(qtyId(storeKey, productName));
  if (el) el.innerText = carts[storeKey][productName];

  if (delta > 0) {
    const cartBtn = document.querySelector(".floating-cart");
    cartBtn?.classList.add("pulse");
    setTimeout(() => cartBtn?.classList.remove("pulse"), 500);
  }

  renderGlobalCart();
}

function removeFromCart(storeKey, productNameSafe) {
  const productName = decodeSafe(productNameSafe);

  if (carts[storeKey] && carts[storeKey][productName]) {
    carts[storeKey][productName] = 0;
    const qtyEl = document.getElementById(qtyId(storeKey, productName));
    if (qtyEl) qtyEl.innerText = 0;
    renderGlobalCart();
  }
}

function buildProductsFromCarts(cartsObj, storesObj) {
  const products = [];
  Object.keys(cartsObj || {}).forEach(storeKey => {
    Object.keys(cartsObj[storeKey] || {}).forEach(productName => {
      const qty = cartsObj[storeKey][productName];
      if (!qty || qty <= 0) return;

      const product = storesObj?.[storeKey]?.products?.find(p => p.name === productName);
      const unitPrice = product?.price || 0;
      const storeName = storesObj?.[storeKey]?.name || storeKey;

      products.push({
        storeKey,
        storeName,
        name: productName,
        quantity: qty,
        unitPrice,
        totalPrice: unitPrice * qty,
      });
    });
  });
  return products;
}

function getDeliveryPrice(district) {
  if (district === "Артик") return 500;
  if (district === "Арич") return 700;
  if (district === "Нор-Кянк") return 1000;
  if (district === "Пемзашен") return 1000;
  return 0;
}

function calcTotals(products, district) {
  const itemsTotal = products.reduce((s, p) => s + (p.totalPrice || 0), 0);
  const delivery = getDeliveryPrice(district);
  return { itemsTotal, delivery, grandTotal: itemsTotal + delivery };
}

function renderGlobalCart() {
  const cartDiv = document.getElementById("global-cart-items");
  const totalDiv = document.getElementById("global-cart-total");
  const deliveryDiv = document.getElementById("delivery-total");
  const grandTotalDiv = document.getElementById("grand-total");

  if (!cartDiv || !totalDiv || !deliveryDiv || !grandTotalDiv) return;

  cartDiv.innerHTML = "";

  let total = 0;
  let hasItems = false;

  Object.keys(carts).forEach(storeKey => {
    Object.keys(carts[storeKey] || {}).forEach(productName => {
      const qty = carts[storeKey][productName];
      if (qty > 0) {
        hasItems = true;

        const product = stores?.[storeKey]?.products?.find(p => p.name === productName);
        if (!product) return;

        const price = (product.price || 0) * qty;
        total += price;

        const item = document.createElement("div");
        item.className = "cart-item";
        item.innerHTML = `
          <div>
            ${productName} × ${qty}
            <div style="font-size:12px; color: var(--text-muted);">${stores[storeKey].name}</div>
          </div>
          <span>${price} AMD</span>
          <button onclick="removeFromCart('${storeKey}', '${jsSafe(productName)}')">✕</button>
        `;
        cartDiv.appendChild(item);
      }
    });
  });

  if (!hasItems) {
    cartDiv.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Корзина пуста</p>';
  }

  totalDiv.innerText = `Товары: ${total} AMD`;

  const district = document.getElementById("district")?.value || "";
  const delivery = getDeliveryPrice(district);

  deliveryDiv.innerText = `Доставка: ${delivery} AMD`;
  grandTotalDiv.innerText = `Итого: ${total + delivery} AMD`;
}

/* =========================================================
   WORKER SYNC (KV)
========================================================= */
async function createOrderInWorker(orderPayload) {
  const r = await fetch(WORKER_BASE_URL + WORKER_ORDERS_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(orderPayload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok || !data?.orderId) {
    throw new Error(data?.error || `Worker error: ${r.status}`);
  }
  return data.orderId;
}

async function fetchOrderStatus(orderId) {
  const url = `${WORKER_BASE_URL + WORKER_STATUS_PATH}?id=${encodeURIComponent(orderId)}`;
  const r = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": API_KEY },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) throw new Error(data?.error || `Status error: ${r.status}`);
  return data;
}

function getActiveOrderId() { return localStorage.getItem("activeOrderId") || ""; }
function setActiveOrderId(orderId) { localStorage.setItem("activeOrderId", orderId); }
function clearActiveOrderId() { localStorage.removeItem("activeOrderId"); }

function startStatusPolling(orderId) {
  stopStatusPolling();
  setActiveOrderId(orderId);

  updateStatusUI(orderId).catch(() => {});
  statusPollTimer = setInterval(() => updateStatusUI(orderId).catch(() => {}), 5000);
}

function stopStatusPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = null;
}

async function updateStatusUI(orderId) {
  const data = await fetchOrderStatus(orderId);
  const status = data.status || "new";
  const label = STATUS_LABELS[status] || status;

  // бейдж статуса под итогом
  const gt = document.getElementById("grand-total");
  if (gt) {
    let badge = document.getElementById("order-status-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "order-status-badge";
      badge.style.cssText =
        "margin-top:10px; text-align:center; font-weight:700; color: var(--accent-gold);";
      gt.parentElement?.appendChild(badge);
    }
    badge.textContent = `Статус заказа #${orderId}: ${label}`;
  }

  touchOrderInHistory(orderId, {
    status,
    updatedAt: data.updatedAt || new Date().toISOString(),
  });

  if (status === "delivered") {
    stopStatusPolling();
    clearActiveOrderId();
  }
}

/* =========================================================
   ОФОРМЛЕНИЕ ЗАКАЗА (создать в worker + WhatsApp для клиента)
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
    payment,    // "Наличные курьеру" / "Перевод на карту" (как у тебя в select)
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
    startStatusPolling(orderId);

    // 3) WhatsApp клиенту (можешь убрать, если не нужно)
    const waText =
      `🛒 Заказ принят!\n` +
      `Номер: ${orderId}\n` +
      `Оплата: ${payment}\n` +
      `Итого: ${totals.grandTotal} AMD\n` +
      `Адрес: ${address}\n` +
      `Район: ${district}\n\n` +
      `Статус будет обновляться.`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`, "_blank");

    createConfetti();
    alert(`✅ Заказ отправлен!\nНомер: ${orderId}\nСтатус будет обновляться автоматически.`);

    // 4) очистить корзину на сайте
    carts = {};
    renderGlobalCart();

  } catch (e) {
    console.error(e);
    alert("❌ Не удалось отправить заказ.\n\n" + (e?.message || ""));
  }
}

/* =========================================================
   ИСТОРИЯ ЗАКАЗОВ
========================================================= */
function getOrderHistory() {
  return JSON.parse(localStorage.getItem("orderHistory") || "[]");
}
function saveOrderHistory(history) {
  localStorage.setItem("orderHistory", JSON.stringify(history));
}
function saveOrderToHistory(order) {
  let history = getOrderHistory();
  history.unshift(order);
  if (history.length > 20) history = history.slice(0, 20);
  saveOrderHistory(history);
}
function touchOrderInHistory(orderId, patch) {
  const history = getOrderHistory();
  const idx = history.findIndex(o => o.orderId === orderId);
  if (idx === -1) return;
  history[idx] = { ...history[idx], ...patch };
  saveOrderHistory(history);
}

function showOrderHistory() {
  const history = getOrderHistory();
  if (!history.length) {
    alert("История заказов пуста");
    return;
  }

  let html = '<div style="max-width: 650px; margin: 20px auto; padding: 20px; background: var(--bg-glass); border-radius: 16px; border: 1px solid var(--border-glass); position: relative;">';
  html += '<button onclick="document.getElementById(\'history-modal\').remove();" style="position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-card); border: 1px solid var(--border-glass); color: var(--text-main); font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">✕</button>';
  html += '<h3 style="color: var(--accent-gold); margin-top: 0;">📱 История заказов</h3>';

  history.forEach((order, index) => {
    const date = new Date(order.date);
    const dateStr = date.toLocaleDateString("ru-RU") + " " + date.toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"});
    const statusText = STATUS_LABELS[order.status] || order.status || "";

    html += `<div style="padding: 12px; margin-bottom: 10px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-glass);">`;
    html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">`;
    html += `<div style="font-size: 12px; color: var(--text-muted);">${dateStr}<div style="margin-top:6px; font-weight:700; color: var(--accent-gold);">#${order.orderId || "-"}</div></div>`;
    html += `<div style="text-align:right;"><div style="font-weight: 700; color: var(--accent-gold);">${order.total} AMD</div><div style="font-size:12px; color: var(--text-muted); margin-top:6px;">${statusText}</div></div>`;
    html += `</div>`;

    html += `<div style="font-size: 13px; color: var(--text-muted); margin-top: 10px;">${order.address}</div>`;
    html += `<button onclick="repeatOrder(${index}); document.getElementById('history-modal').remove();" style="width: 100%; padding: 8px; background: linear-gradient(135deg, #2ecc71, #6df0a0); color: #0f1115; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; margin-top: 10px;">⚡ Повторить заказ</button>`;
    if (order.orderId) {
      html += `<button onclick="startStatusPolling('${order.orderId}'); document.getElementById('history-modal').remove();" style="width: 100%; padding: 8px; background: var(--bg-glass); color: var(--text-main); border: 1px solid var(--border-glass); border-radius: 8px; cursor: pointer; font-weight: 700; margin-top: 10px;">🔄 Следить за статусом</button>`;
    }
    html += `</div>`;
  });

  html += '<button onclick="document.getElementById(\'history-modal\').remove();" style="width: 100%; padding: 12px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-glass); border-radius: 8px; cursor: pointer; margin-top: 10px;">Закрыть</button>';
  html += "</div>";

  const modal = document.createElement("div");
  modal.id = "history-modal";
  modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; overflow: auto; padding: 20px;";
  modal.innerHTML = html;
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

  document.body.appendChild(modal);
}

function repeatOrder(index) {
  const history = getOrderHistory();
  const order = history[index];
  if (!order?.carts) return;

  carts = JSON.parse(JSON.stringify(order.carts));
  renderGlobalCart();
  alert("✅ Корзина восстановлена из истории. Проверьте корзину и оформляйте заказ.");
}

function fillFromLastOrder() {
  const history = getOrderHistory();
  if (!history.length) { alert("Нет сохранённых заказов."); return; }
  const last = history[0];

  document.getElementById("name").value = last.name || "";
  document.getElementById("phone").value = last.phone || "";
  document.getElementById("address").value = last.address || "";
  document.getElementById("district").value = last.district || "";
  renderGlobalCart();
}

/* =========================================================
   ОТЗЫВЫ
========================================================= */
let currentRating = 0;

function saveReviews(reviews) { localStorage.setItem("reviews", JSON.stringify(reviews)); }
function loadReviews() { return JSON.parse(localStorage.getItem("reviews") || "[]"); }

function renderReviews() {
  const container = document.getElementById("reviews-list");
  if (!container) return;
  container.innerHTML = "";

  const reviews = loadReviews();
  if (!reviews.length) {
    container.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Пока нет отзывов</p>';
    return;
  }

  reviews.forEach(review => {
    const date = new Date(review.date);
    const dateStr = date.toLocaleDateString("ru-RU") + " " + date.toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"});

    let starsHTML = "";
    for (let i = 1; i <= 5; i++) {
      starsHTML += i <= (review.rating || 0)
        ? "<span style='color: #f9ca24;'>★</span>"
        : "<span style='color: var(--text-muted);'>☆</span>";
    }

    const div = document.createElement("div");
    div.style.cssText = "padding: 14px; margin-bottom: 12px; background: var(--bg-glass); border-radius: 14px; border: 1px solid var(--border-glass);";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <div>
          <div style="font-weight:700; color: var(--text-main);">${review.name || "Гость"}</div>
          <div style="font-size:20px; margin-top:4px;">${starsHTML}</div>
        </div>
        <div style="font-size:12px; color: var(--text-muted);">${dateStr}</div>
      </div>
      ${review.comment ? `<div style="color: var(--text-main); margin-top: 12px; line-height: 1.5;">${review.comment}</div>` : ""}
    `;
    container.appendChild(div);
  });
}

function setRating(r) {
  currentRating = r;
  const stars = document.querySelectorAll("#star-rating .star");
  stars.forEach(star => {
    const val = Number(star.getAttribute("data-rating"));
    star.textContent = val <= r ? "★" : "☆";
    star.style.color = val <= r ? "#f9ca24" : "var(--text-muted)";
  });
  const txt = document.getElementById("rating-text");
  if (txt) txt.textContent = r ? `Ваша оценка: ${r}/5` : "Нажмите на звёзды";
}

function submitReview() {
  if (!currentRating) { alert("Поставьте оценку звёздами 🙂"); return; }
  const name = document.getElementById("review-name")?.value.trim() || "Гость";
  const comment = document.getElementById("review-comment")?.value.trim();

  const reviews = loadReviews();
  reviews.unshift({ name, comment, rating: currentRating, date: new Date().toISOString() });
  if (reviews.length > 30) reviews.length = 30;
  saveReviews(reviews);

  document.getElementById("review-name").value = "";
  document.getElementById("review-comment").value = "";
  setRating(0);

  renderReviews();
  alert("✅ Спасибо! Отзыв сохранён.");
}

/* =========================================================
   ТЕМА
========================================================= */
function toggleTheme() {
  document.body.classList.toggle("light-theme");
  const icon = document.querySelector(".theme-toggle");
  if (!icon) return;
  icon.innerText = document.body.classList.contains("light-theme") ? "☀️" : "🌙";
}

/* =========================================================
   КОНФЕТТИ
========================================================= */
function createConfetti() {
  for (let i = 0; i < 70; i++) {
    const conf = document.createElement("div");
    conf.className = "confetti";
    conf.style.left = Math.random() * 100 + "vw";
    conf.style.transform = `translateY(-10px) rotate(${Math.random() * 360}deg)`;
    conf.style.animationDuration = (2.5 + Math.random() * 1.5) + "s";
    document.body.appendChild(conf);
    setTimeout(() => conf.remove(), 3500);
  }
}

/* =========================================================
   МОДАЛКА КАРТИНКИ
========================================================= */
function showImageModal(src, nameSafe) {
  const name = decodeSafe(nameSafe);

  const modal = document.createElement("div");
  modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 100000; display:flex; align-items:center; justify-content:center; padding: 16px;";
  modal.innerHTML = `
    <div style="max-width: 520px; width: 100%; background: var(--bg-glass); border: 1px solid var(--border-glass); border-radius: 18px; padding: 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom: 10px;">
        <div style="font-weight:700; color: var(--accent-gold);">${name}</div>
        <button style="width:34px; height:34px; border-radius:50%; border:1px solid var(--border-glass); background: var(--bg-card); color: var(--text-main); cursor:pointer;">✕</button>
      </div>
      <img src="${src}" alt="${name}" style="width:100%; border-radius: 14px; display:block;" onerror="this.style.display='none'">
    </div>
  `;
  modal.querySelector("button").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

/* =========================================================
   ПОИСК
========================================================= */
function initSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();

    if (!query) {
      if (currentStore) openStore(currentStore);
      else goHome();
      return;
    }

    hideAllPages();
    document.getElementById("store-page")?.classList.remove("hidden");
    document.getElementById("store-title").innerText = "Результаты поиска";
    document.getElementById("categories-block")?.classList.add("hidden");

    const container = document.getElementById("store-products");
    container.innerHTML = "";

    const backBtn = document.createElement("button");
    backBtn.className = "back-btn";
    backBtn.innerText = "← Назад";
    backBtn.onclick = () => {
      searchInput.value = "";
      if (currentStore) openStore(currentStore);
      else goHome();
    };
    container.appendChild(backBtn);

    let found = 0;
    Object.keys(stores).forEach(storeKey => {
      stores[storeKey].products.forEach(product => {
        if (product.name.toLowerCase().includes(query)) {
          found++;
          const div = document.createElement("div");
          div.className = "product";

          const safeName = jsSafe(product.name);
          const imageSrc = getProductImage(product.photo);

          div.innerHTML = `
            <div style="display:flex; gap:12px; align-items:center; flex:1;">
              <img src="${imageSrc}" alt="${product.name}" style="cursor:pointer;"
                   onclick="showImageModal('${imageSrc}', '${safeName}')"
                   onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'%3E%3Crect width=\\'80\\' height=\\'80\\' fill=\\'%23333\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'40\\'%3E📦%3C/text%3E%3C/svg%3E'">
              <div style="flex:1;">
                <h4>${product.name}</h4>
                <p style="color: var(--accent-gold); font-weight: 600;">${product.priceText ?? product.price} AMD</p>
                <p style="font-size:12px; color: var(--text-muted);">${stores[storeKey].name}</p>
              </div>
            </div>
            <div class="qty-controls" onclick="event.stopPropagation()">
              <button onclick="changeQty('${storeKey}', '${safeName}', -1)">−</button>
              <span class="qty-number" id="${qtyId(storeKey, product.name)}">0</span>
              <button onclick="changeQty('${storeKey}', '${safeName}', 1)">+</button>
            </div>
          `;
          container.appendChild(div);

          const existing = carts?.[storeKey]?.[product.name] || 0;
          const el = document.getElementById(qtyId(storeKey, product.name));
          if (el) el.innerText = existing;
        }
      });
    });

    if (!found) {
      const p = document.createElement("p");
      p.style.cssText = "text-align:center; color: var(--text-muted); margin-top: 40px;";
      p.innerText = "Ничего не найдено";
      container.appendChild(p);
    }
  });
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  // expose globally for inline onclick
  window.goHome = goHome;
  window.goBack = goBack;
  window.openStore = openStore;
  window.changeQty = changeQty;
  window.removeFromCart = removeFromCart;
  window.placeOrder = placeOrder;
  window.showOrderHistory = showOrderHistory;
  window.repeatOrder = repeatOrder;
  window.fillFromLastOrder = fillFromLastOrder;
  window.toggleTheme = toggleTheme;
  window.showImageModal = showImageModal;
  window.submitReview = submitReview;

  // отзывы (звёзды)
  document.querySelectorAll("#star-rating .star").forEach(star => {
    star.addEventListener("click", () => setRating(Number(star.getAttribute("data-rating"))));
  });
  renderReviews();

  // доставка пересчёт
  document.getElementById("district")?.addEventListener("change", renderGlobalCart);

  initSearch();
  await loadStores();

  // если есть активный заказ — продолжить слежение
  const activeId = getActiveOrderId();
  if (activeId) startStatusPolling(activeId);
});

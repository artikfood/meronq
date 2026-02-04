/* ============================================
   НАСТРОЙКИ
============================================ */
const STORES_INDEX_URL = "stores/index.json";

// Worker endpoint (у тебя он уже есть)
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

// Карта для оплаты (как у тебя было)
const CARD_NUMBER = "4355053925562086";

// WhatsApp (как у тебя было)
const WHATSAPP_NUMBER = "37443797727";

/* ============================================
   ГЛОБАЛЬНЫЕ ДАННЫЕ (не меняем логику)
============================================ */
let stores = {};           // { storeKey: {name, logo, workingHours, products:[], categories:{...}} }
let carts = {};            // { storeKey: { productName: qty } }
let currentStore = null;
let currentCategory = null;

/* ============================================
   УТИЛИТЫ
============================================ */
function jsSafe(str) {
  return encodeURIComponent(String(str));
}
function decodeSafe(str) {
  try { return decodeURIComponent(str); } catch { return String(str); }
}
function qtyId(storeKey, productName) {
  // Чтобы ID был стабильный даже с пробелами/слешами
  return `qty_${storeKey}_${btoa(unescape(encodeURIComponent(productName))).replace(/=+$/,'')}`;
}

function getProductImage(photo) {
  if (!photo) {
    // простой плейсхолдер
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='40'%3E%F0%9F%93%A6%3C/text%3E%3C/svg%3E";
  }
  return photo;
}

function parsePriceToNumber(priceText) {
  // Чтобы totals не ломались, если в CSV "950/1250"
  const s = String(priceText ?? "").trim();
  if (!s) return 0;
  const first = s.split("/")[0].trim();
  const n = Number(String(first).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* ============================================
   НАВИГАЦИЯ
============================================ */
function hideAllPages() {
  document.getElementById("home-page").classList.add("hidden");
  document.getElementById("store-page").classList.add("hidden");
}
function goHome() {
  currentStore = null;
  currentCategory = null;
  hideAllPages();
  document.getElementById("home-page").classList.remove("hidden");
  // не ломаем якоря — просто остаёмся на главной
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

/* ============================================
   ЗАГРУЗКА МАГАЗИНОВ И МЕНЮ (из GitHub папки)
============================================ */
async function loadStores() {
  const loading = document.getElementById("loading-shops");
  const listEl = document.getElementById("shops-list");
  loading.style.display = "block";
  listEl.innerHTML = "";

  let indexData;
  try {
    const r = await fetch(STORES_INDEX_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("Не удалось загрузить stores/index.json");
    indexData = await r.json();
  } catch (e) {
    loading.innerText = "Ошибка загрузки магазинов.";
    console.error(e);
    return;
  }

  // собираем stores
  stores = {};
  for (const s of (indexData.stores || [])) {
    if (!s || !s.id) continue;
    if (s.enabled === false) continue;

    stores[s.id] = {
      key: s.id,
      name: s.name || s.id,
      logo: s.logo || "",
      workingHours: s.workingHours || null,
      products: [],
      categories: {} // { catName: { icon } }
    };
  }

  // грузим меню каждого магазина (menu.csv)
  const storeKeys = Object.keys(stores);
  await Promise.all(storeKeys.map(k => loadStoreMenuCSV(k)));

  renderStores();
  renderGlobalCart();
  loading.style.display = "none";
}

async function loadStoreMenuCSV(storeKey) {
  const url = `stores/${storeKey}/menu.csv`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Нет menu.csv: ${url}`);
    const text = await r.text();

    const rows = text.split("\n");
    const products = [];

    rows.forEach(row => {
      // Категория(0), Описание(1), Название(2), Пусто(3), Цена(4)
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
        priceText: priceText,                 // для вывода
        price: parsePriceToNumber(priceText), // для подсчётов (логика корзины не ломается)
        photo: `stores/${storeKey}/images/${encodeURIComponent(name)}.jpg` // опционально
      });
    });

    stores[storeKey].products = products;

    // категории (иконки простые, можно расширять без изменения логики)
    const cats = {};
    products.forEach(p => {
      if (!cats[p.category]) cats[p.category] = { icon: "📦" };
    });
    stores[storeKey].categories = cats;
  } catch (e) {
    console.warn(e);
    // даже если меню не загрузилось — магазин останется, просто будет пусто
    stores[storeKey].products = [];
    stores[storeKey].categories = {};
  }
}

/* ============================================
   РЕНДЕР МАГАЗИНОВ / КАТЕГОРИЙ / ТОВАРОВ
============================================ */
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
    // если магазин закрывается после полуночи
    return nowM >= openM || nowM <= closeM;
  } catch {
    return null;
  }
}

function renderStores() {
  const container = document.getElementById("shops-list");
  container.innerHTML = "";

  Object.keys(stores).forEach(key => {
    const s = stores[key];

    const openState = isStoreOpen(s.workingHours);
    const statusBadge = openState === null
      ? ""
      : openState
        ? `<div style="margin-top:8px; font-size:12px; color:#0f1115; background: linear-gradient(135deg,#2ecc71,#6df0a0); padding:6px 10px; border-radius:999px; display:inline-block; font-weight:700;">Открыто</div>`
        : `<div style="margin-top:8px; font-size:12px; color: var(--text-main); background: var(--bg-card); border: 1px solid var(--border-glass); padding:6px 10px; border-radius:999px; display:inline-block; font-weight:700;">Закрыто</div>`;

    const workingHoursText = s.workingHours?.open && s.workingHours?.close
      ? `<div style="margin-top:8px; font-size:12px; color: var(--text-muted);">${s.workingHours.open} - ${s.workingHours.close}</div>`
      : "";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = s.logo
      ? `<img src="${s.logo}" alt="${s.name}" style="max-width: 120px; max-height: 80px; object-fit: contain; margin-bottom: 10px;" onerror="this.style.display='none'">
         <div>${s.name}</div>
         ${statusBadge}
         ${workingHoursText}`
      : `<div>${s.name}</div>
         ${statusBadge}
         ${workingHoursText}`;
    div.onclick = () => openStore(key);

    container.appendChild(div);
  });
}

function openStore(storeKey) {
  currentStore = storeKey;
  currentCategory = null;

  hideAllPages();
  document.getElementById("store-page").classList.remove("hidden");
  document.getElementById("store-title").innerText = stores[storeKey].name;

  // категории
  const hasCats = stores[storeKey].categories && Object.keys(stores[storeKey].categories).length > 0;
  if (hasCats) {
    document.getElementById("categories-block").classList.remove("hidden");
    renderCategories(storeKey);
  } else {
    document.getElementById("categories-block").classList.add("hidden");
  }

  renderProducts(storeKey, null);

  document.getElementById("store-cart").classList.remove("hidden");
  renderStoreCart(storeKey);
}

function renderCategories(storeKey) {
  const container = document.getElementById("categories-list");
  container.innerHTML = "";

  Object.keys(stores[storeKey].categories).forEach(catName => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <span class="icon">${stores[storeKey].categories[catName].icon}</span>
      <div>${catName}</div>
    `;
    div.onclick = () => {
      currentCategory = catName;
      document.getElementById("categories-block").classList.add("hidden");
      renderProducts(storeKey, catName);
    };
    container.appendChild(div);
  });
}

function renderProducts(storeKey, filterCategory = null) {
  const container = document.getElementById("store-products");
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
        <img src="${imageSrc}"
             alt="${product.name}"
             onclick="showImageModal('${imageSrc}', '${jsSafe(product.name)}')"
             style="cursor:pointer;"
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

/* ============================================
   КОРЗИНА (логика как у тебя)
============================================ */
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
    cartBtn.classList.add("pulse");
    setTimeout(() => cartBtn.classList.remove("pulse"), 500);
  }

  renderStoreCart(storeKey);
  renderGlobalCart();
}

function removeFromCart(storeKey, productNameSafe) {
  const productName = decodeSafe(productNameSafe);

  if (carts[storeKey] && carts[storeKey][productName]) {
    carts[storeKey][productName] = 0;
    const qtyEl = document.getElementById(qtyId(storeKey, productName));
    if (qtyEl) qtyEl.innerText = 0;
    renderStoreCart(storeKey);
    renderGlobalCart();
  }
}

function renderStoreCart(storeKey) {
  const cartDiv = document.getElementById("store-cart-items");
  const totalDiv = document.getElementById("store-cart-total");
  cartDiv.innerHTML = "";

  let total = 0;

  if (carts[storeKey]) {
    Object.keys(carts[storeKey]).forEach(productName => {
      const qty = carts[storeKey][productName];
      if (qty > 0) {
        const product = stores[storeKey].products.find(p => p.name === productName);
        if (!product) return;

        const price = (product.price || 0) * qty;
        total += price;

        const item = document.createElement("div");
        item.className = "cart-item";
        item.innerHTML = `
          <div>${productName} × ${qty}</div>
          <span>${price} AMD</span>
          <button onclick="removeFromCart('${storeKey}', '${jsSafe(productName)}')">✕</button>
        `;
        cartDiv.appendChild(item);
      }
    });
  }

  totalDiv.innerText = `Итого: ${total} AMD`;
}

function renderGlobalCart() {
  const cartDiv = document.getElementById("global-cart-items");
  const totalDiv = document.getElementById("global-cart-total");
  const deliveryDiv = document.getElementById("delivery-total");
  const grandTotalDiv = document.getElementById("grand-total");
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

  const district = document.getElementById("district").value;
  const delivery = getDeliveryPrice(district);

  deliveryDiv.innerText = `Доставка: ${delivery} AMD`;
  grandTotalDiv.innerText = `Итого: ${total + delivery} AMD`;
}

/* ============================================
   ПОИСК (как у тебя)
============================================ */
const searchInput = document.getElementById("searchInput");
searchInput.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase().trim();

  if (!query) {
    if (currentStore) openStore(currentStore);
    else goHome();
    return;
  }

  hideAllPages();
  document.getElementById("store-page").classList.remove("hidden");
  document.getElementById("store-title").innerText = "Результаты поиска";
  document.getElementById("categories-block").classList.add("hidden");

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

  let foundCount = 0;
  Object.keys(stores).forEach(storeKey => {
    stores[storeKey].products.forEach(product => {
      if (product.name.toLowerCase().includes(query)) {
        foundCount++;
        const div = document.createElement("div");
        div.className = "product";

        const safeName = jsSafe(product.name);
        const imageSrc = getProductImage(product.photo);

        div.innerHTML = `
          <div style="display:flex; gap:12px; align-items:center; flex:1;">
            <img src="${imageSrc}"
                 alt="${product.name}"
                 onclick="showImageModal('${imageSrc}', '${jsSafe(product.name)}')"
                 style="cursor: pointer;"
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

  if (foundCount === 0) {
    const noResults = document.createElement("p");
    noResults.style.cssText = "text-align:center; color: var(--text-muted); margin-top: 40px;";
    noResults.innerText = "Ничего не найдено";
    container.appendChild(noResults);
  }
});

document.getElementById("district").addEventListener("change", renderGlobalCart);

/* ============================================
   TELEGRAM WORKER (отправка заказа)
============================================ */
async function sendOrderToWorker(payload) {
  try {
    const r = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
      },
      body: JSON.stringify(payload)
    });

    // не ломаем UX: если воркер упал — WhatsApp всё равно откроется
    if (!r.ok) {
      console.warn("Worker error:", r.status);
      return { ok: false, status: r.status };
    }
    const data = await r.json().catch(() => ({}));
    return data;
  } catch (e) {
    console.warn("Worker fetch failed:", e);
    return { ok: false, error: "network" };
  }
}

function getStoresFromCarts(cartsObj) {
  const storesList = [];
  Object.keys(cartsObj || {}).forEach(storeKey => {
    const hasItems = Object.values(cartsObj[storeKey] || {}).some(qty => qty > 0);
    if (hasItems && stores[storeKey]) {
      storesList.push({ key: storeKey, name: stores[storeKey].name });
    }
  });
  return storesList;
}

function getProductsDetails(cartsObj) {
  const productsList = [];
  Object.keys(cartsObj || {}).forEach(storeKey => {
    Object.keys(cartsObj[storeKey] || {}).forEach(productName => {
      const qty = cartsObj[storeKey][productName];
      if (qty > 0) {
        const product = stores?.[storeKey]?.products?.find(p => p.name === productName);
        if (product) {
          productsList.push({
            name: productName,
            quantity: qty,
            unitPrice: product.price,
            totalPrice: product.price * qty,
            storeName: stores[storeKey].name,
            storeKey
          });
        }
      }
    });
  });
  return productsList;
}

/* ============================================
   ОПЛАТА ПЕРЕВОДОМ НА КАРТУ (как у тебя)
============================================ */
function showCardTransferModal(orderData) {
  const amount = orderData.total;

  const modal = document.createElement("div");
  modal.id = "card-transfer-modal";
  modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;";

  modal.innerHTML = `
    <div style="background: var(--bg-glass); border-radius: 20px; padding: 30px; max-width: 400px; width: 100%; border: 1px solid var(--border-glass); box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
      <h2 style="color: var(--accent-gold); margin: 0 0 20px 0; text-align: center;">💳 Перевод на карту</h2>

      <div style="background: var(--bg-card); border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid var(--border-glass);">
        <div style="text-align: center; margin-bottom: 15px;">
          <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">Сумма к оплате:</div>
          <div style="font-size: 32px; font-weight: 700; color: var(--accent-gold);">${amount} AMD</div>
        </div>

        <div style="margin-bottom: 15px;">
          <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">Номер карты ACBA:</div>
          <div style="display: flex; gap: 8px;">
            <input id="cardNumberField" value="${CARD_NUMBER}" readonly
                   style="flex: 1; padding: 10px; border: 1px solid var(--border-glass); border-radius: 8px; background: var(--bg-secondary); color: var(--text-main); font-size: 16px; font-family: monospace;">
            <button onclick="copyCardNumber(event)"
                    style="padding: 10px 14px; background: linear-gradient(135deg, #2ecc71, #6df0a0); color: #0f1115; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
              📋
            </button>
          </div>
        </div>

        <div style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">
          ✅ Переведите <strong style="color: var(--accent-gold);">${amount} AMD</strong> на карту<br>
          ✅ После перевода нажмите "Я оплатил"<br>
          ✅ Мы свяжемся с вами для подтверждения
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button onclick="closeCardModal()"
                style="flex: 1; padding: 14px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-glass); border-radius: 12px; cursor: pointer; font-weight: 600;">
          Отмена
        </button>
        <button onclick="confirmCardPayment()"
                style="flex: 1; padding: 14px; background: linear-gradient(135deg, #2ecc71, #6df0a0); color: #0f1115; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; box-shadow: 0 8px 24px rgba(46,204,113,0.35);">
          ✅ Я оплатил
        </button>
      </div>
    </div>
  `;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeCardModal();
  });

  document.body.appendChild(modal);
  window.pendingCardOrder = orderData;
}

function copyCardNumber(event) {
  const cardField = document.getElementById("cardNumberField");
  cardField.select();
  cardField.setSelectionRange(0, 99999);

  try {
    document.execCommand("copy");
    const btn = event?.target?.closest("button") || event?.target;
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = "✅";
      setTimeout(() => (btn.innerHTML = original), 1200);
    }
  } catch {
    alert("Не удалось скопировать. Скопируйте вручную: " + CARD_NUMBER);
  }
}

function closeCardModal() {
  const modal = document.getElementById("card-transfer-modal");
  if (modal) modal.remove();
  window.pendingCardOrder = null;
}

function confirmCardPayment() {
  const orderData = window.pendingCardOrder;
  if (!orderData) return;

  const itemsTotal = orderData.total - getDeliveryPrice(orderData.district);

  sendOrderToWorker({
    createdAt: new Date().toISOString(),
    name: orderData.name,
    phone: orderData.phone,
    address: orderData.address,
    district: orderData.district,
    payment: "Перевод на карту (ожидает проверки)",
    comment: orderData.comment,
    carts: orderData.carts,
    stores: getStoresFromCarts(orderData.carts),
    products: getProductsDetails(orderData.carts),
    totals: { itemsTotal, delivery: getDeliveryPrice(orderData.district), grandTotal: orderData.total }
  });

  let message = `🛒 *Новый заказ — Artik Food*%0A%0A`;
  message += `👤 Имя: ${encodeURIComponent(orderData.name)}%0A`;
  message += `📞 Телефон: ${encodeURIComponent(orderData.phone)}%0A`;
  message += `📍 Адрес: ${encodeURIComponent(orderData.address)}%0A`;
  message += `🏘 Район: ${encodeURIComponent(orderData.district)}%0A`;
  message += `💳 Оплата: Перевод на карту ACBA%0A`;
  if (orderData.comment) message += `📝 Комментарий: ${encodeURIComponent(orderData.comment)}%0A`;
  message += `%0A💰 *Сумма: ${orderData.total} AMD*%0A`;
  message += `%0A⚠️ Клиент сообщил что оплатил. Проверьте поступление перевода на карту ${CARD_NUMBER}`;

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank");

  saveOrderToHistory({
    date: new Date().toISOString(),
    name: orderData.name,
    phone: orderData.phone,
    address: orderData.address,
    district: orderData.district,
    carts: JSON.parse(JSON.stringify(orderData.carts)),
    total: orderData.total
  });

  closeCardModal();
  carts = {};
  renderGlobalCart();
  createConfetti();

  alert("✅ Спасибо!\n\nВаш заказ отправлен.\n\nМы проверим поступление перевода и свяжемся с вами для подтверждения доставки.");
}

/* ============================================
   WHATSAPP (основная отправка заказа)
============================================ */
function getDeliveryPrice(district) {
  if (district === "Артик") return 500;
  if (district === "Арич") return 700;
  if (district === "Нор-Кянк") return 1000;
  if (district === "Пемзашен") return 1000;
  return 0;
}

function sendFormToWhatsApp() {
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const address = document.getElementById("address").value;
  const district = document.getElementById("district").value;
  const payment = document.getElementById("payment").value;
  const comment = document.getElementById("comment").value;

  if (!name || !phone || !address || !district) {
    alert("Пожалуйста, заполните все обязательные поля!");
    return;
  }

  let message = `🛒 *Новый заказ — Artik Food*%0A%0A`;
  message += `👤 Имя: ${encodeURIComponent(name)}%0A`;
  message += `📞 Телефон: ${encodeURIComponent(phone)}%0A`;
  message += `📍 Адрес: ${encodeURIComponent(address)}%0A`;
  message += `🏘 Район: ${encodeURIComponent(district)}%0A`;
  message += `💳 Оплата: ${encodeURIComponent(payment)}%0A`;
  if (comment) message += `📝 Комментарий: ${encodeURIComponent(comment)}%0A`;
  message += `%0A📦 *Товары:*%0A`;

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

        message += `• ${encodeURIComponent(productName)} × ${qty} (${price} AMD) — ${encodeURIComponent(stores[storeKey].name)}%0A`;
      }
    });
  });

  if (!hasItems) {
    alert("Корзина пуста! Добавьте товары перед оформлением заказа.");
    return;
  }

  if (total < 3000) {
    alert("Минимальная сумма заказа 3000 AMD.\nТекущая сумма товаров: " + total + " AMD");
    return;
  }

  const delivery = getDeliveryPrice(district);
  const grandTotal = total + delivery;

  message += `%0A🚚 Доставка: ${delivery} AMD%0A`;
  message += `💰 *Итого: ${grandTotal} AMD*`;

  if (payment === "Перевод на карту") {
    showCardTransferModal({
      name, phone, address, district, payment, comment,
      carts,
      total: grandTotal
    });
    return;
  }

  // отправка в воркер (параллельно)
  sendOrderToWorker({
    createdAt: new Date().toISOString(),
    name,
    phone,
    address,
    district,
    payment,
    comment,
    carts,
    stores: getStoresFromCarts(carts),
    products: getProductsDetails(carts),
    totals: { itemsTotal: total, delivery, grandTotal }
  });

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank");

  createConfetti();

  saveOrderToHistory({
    date: new Date().toISOString(),
    name,
    phone,
    address,
    district,
    carts: JSON.parse(JSON.stringify(carts)),
    total: grandTotal
  });

  carts = {};
  renderGlobalCart();

  setTimeout(() => {
    alert("✅ Заказ отправлен! Ожидайте звонка от магазина.\n\nКорзина очищена.");
  }, 500);
}

/* ============================================
   ИСТОРИЯ ЗАКАЗОВ (как у тебя)
============================================ */
function saveOrderToHistory(order) {
  let history = JSON.parse(localStorage.getItem("orderHistory") || "[]");
  history.unshift(order);
  if (history.length > 10) history = history.slice(0, 10);
  localStorage.setItem("orderHistory", JSON.stringify(history));
}

function getOrderHistory() {
  return JSON.parse(localStorage.getItem("orderHistory") || "[]");
}

function showOrderHistory() {
  const history = getOrderHistory();

  if (history.length === 0) {
    alert("История заказов пуста");
    return;
  }

  let html = '<div style="max-width: 600px; margin: 20px auto; padding: 20px; background: var(--bg-glass); border-radius: 16px; border: 1px solid var(--border-glass); position: relative;">';
  html += '<button onclick="document.getElementById(\'history-modal\').remove();" style="position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-card); border: 1px solid var(--border-glass); color: var(--text-main); font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">✕</button>';
  html += '<h3 style="color: var(--accent-gold); margin-top: 0;">📱 История заказов</h3>';

  history.forEach((order, index) => {
    const date = new Date(order.date);
    const dateStr = date.toLocaleDateString("ru-RU") + " " + date.toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"});

    html += `<div style="padding: 12px; margin-bottom: 10px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-glass);">`;
    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
    html += `<div style="font-size: 12px; color: var(--text-muted);">${dateStr}</div>`;
    html += `<div style="font-weight: 600; color: var(--accent-gold);">${order.total} AMD</div>`;
    html += `</div>`;
    html += `<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${order.address}</div>`;
    html += `<button onclick="repeatOrder(${index}); document.getElementById('history-modal').remove();" style="width: 100%; padding: 8px; background: linear-gradient(135deg, #2ecc71, #6df0a0); color: #0f1115; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">⚡ Повторить заказ</button>`;
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

  // обновим цифры qty на странице магазина/поиска когда пользователь туда зайдёт
  alert("✅ Корзина восстановлена из истории. Проверьте корзину и оформляйте заказ.");
}

function fillFromLastOrder() {
  const history = getOrderHistory();
  if (!history.length) {
    alert("Нет сохранённых заказов.");
    return;
  }
  const last = history[0];
  document.getElementById("name").value = last.name || "";
  document.getElementById("phone").value = last.phone || "";
  document.getElementById("address").value = last.address || "";
  document.getElementById("district").value = last.district || "";
  renderGlobalCart();
}

/* ============================================
   ОТЗЫВЫ (localStorage)
============================================ */
let currentRating = 0;

function saveReviews(reviews) {
  localStorage.setItem("reviews", JSON.stringify(reviews));
}
function loadReviews() {
  return JSON.parse(localStorage.getItem("reviews") || "[]");
}

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

    const div = document.createElement("div");
    div.style.cssText = "padding: 14px; margin-bottom: 12px; background: var(--bg-glass); border-radius: 14px; border: 1px solid var(--border-glass);";

    let starsHTML = "";
    for (let i = 1; i <= 5; i++) {
      starsHTML += i <= (review.rating || 0)
        ? "<span style='color: #f9ca24;'>★</span>"
        : "<span style='color: var(--text-muted);'>☆</span>";
    }

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div>
          <div style="font-weight: 600; color: var(--text-main);">${review.name || "Гость"}</div>
          <div style="font-size: 20px; margin-top: 4px;">${starsHTML}</div>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">${dateStr}</div>
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
  if (!currentRating) {
    alert("Поставьте оценку звёздами 🙂");
    return;
  }
  const name = document.getElementById("review-name").value.trim() || "Гость";
  const comment = document.getElementById("review-comment").value.trim();

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

/* ============================================
   ТЕМА
============================================ */
function toggleTheme() {
  document.body.classList.toggle("light-theme");
  const icon = document.querySelector(".theme-toggle");
  if (document.body.classList.contains("light-theme")) icon.innerText = "☀️";
  else icon.innerText = "🌙";
}

/* ============================================
   КОНФЕТТИ (как у тебя)
============================================ */
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

/* ============================================
   МОДАЛКА КАРТИНКИ (без изменения дизайна)
============================================ */
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

/* ============================================
   ИНИЦИАЛИЗАЦИЯ
============================================ */
document.addEventListener("DOMContentLoaded", async () => {
  // рейтинг
  document.querySelectorAll("#star-rating .star").forEach(star => {
    star.addEventListener("click", () => setRating(Number(star.getAttribute("data-rating"))));
  });

  renderReviews();
  await loadStores();
});

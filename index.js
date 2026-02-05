/* =========================================================
   НАСТРОЙКИ (КОНФИГУРАЦИЯ)
========================================================= */

// Автоматическое определение базового пути (для GitHub Pages /meronq/)
const BASE_PATH = location.pathname.endsWith("/")
  ? location.pathname
  : location.pathname.replace(/\/[^/]*$/, "/");

const STORES_INDEX_URL = `${BASE_PATH}stores/index.json`;
const WORKER_URL = "https://meronq.edulik844.workers.dev";
const API_KEY = "meronq_Secret_2026!"; // Должен совпадать с кодом в Cloudflare
const MIN_ITEMS_TOTAL = 3000;

/* =========================================================
   ГЛОБАЛЬНЫЕ ДАННЫЕ
========================================================= */
let stores = {};      // Данные о магазинах
let carts = {};       // Корзины: { storeKey: { productName: {qty, price} } }
let currentStore = null;

/* =========================================================
   УТИЛИТЫ
========================================================= */

// Функция для формирования правильных путей к файлам
function assetUrl(p) {
  if (!p) return "";
  if (p.startsWith("http") || p.startsWith("data:")) return p;
  const clean = p.startsWith("/") ? p.slice(1) : p;
  return `${BASE_PATH}${clean}`;
}

// Загрузка CSV и парсинг (с учетом префиксов магазина)
async function loadStoreMenuCSV(storeKey) {
  // Новая логика: ищем файл вида stores/million/million_menu.csv
  const fileName = `${storeKey}_menu.csv`;
  const url = assetUrl(`stores/${storeKey}/${fileName}`);
  
  console.log(`[System] Загрузка меню: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      // Если файл с префиксом не найден, пробуем стандартный menu.csv
      console.warn(`[System] Файл ${fileName} не найден, пробуем menu.csv`);
      const fallbackUrl = assetUrl(`stores/${storeKey}/menu.csv`);
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) throw new Error("Файл меню отсутствует");
      return await fallbackRes.text();
    }
    return await response.text();
  } catch (e) {
    console.error(`[Error] Ошибка загрузки магазина ${storeKey}:`, e);
    return null;
  }
}

/* =========================================================
   ЛОГИКА МАГАЗИНОВ И МЕНЮ
========================================================= */

async function loadStores() {
  const resp = await fetch(STORES_INDEX_URL);
  const data = await resp.json();
  
  const container = document.getElementById("shops-list");
  if (!container) return;
  container.innerHTML = "";

  for (const s of data.stores) {
    if (!s.enabled) continue;
    stores[s.id] = s;
    
    const div = document.createElement("div");
    div.className = "shop-card";
    div.onclick = () => openStore(s.id);
    div.innerHTML = `
      <img src="${assetUrl(s.logo)}" onerror="this.src='https://via.placeholder.com/300x150?text=No+Logo'">
      <div class="shop-card-content">
        <h3>${s.name}</h3>
        <p>🕙 ${s.workingHours.open} - ${s.workingHours.close}</p>
      </div>
    `;
    container.appendChild(div);
  }
}

async function openStore(storeKey) {
  currentStore = storeKey;
  const store = stores[storeKey];
  document.getElementById("store-overlay").style.display = "flex";
  document.getElementById("overlay-title").innerText = store.name;
  
  const container = document.getElementById("product-container");
  container.innerHTML = "<div class='loader'>Загрузка товаров...</div>";

  const csvText = await loadStoreMenuCSV(storeKey);
  if (!csvText) {
    container.innerHTML = "<p style='padding:20px;'>Меню временно недоступно</p>";
    return;
  }

  const rows = csvText.split("\n").filter(r => r.trim().length > 5);
  container.innerHTML = "";

  rows.forEach(row => {
    // Умный сплит CSV (учитывает кавычки)
    const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (cols.length < 5) return;

    const pName = cols[2].replace(/"/g, "").trim();
    const pPrice = parseInt(cols[4].replace(/\D/g, "")) || 0;
    const pImg = assetUrl(`stores/${storeKey}/images/${pName}.jpg`);

    const qty = (carts[storeKey] && carts[storeKey][pName]) ? carts[storeKey][pName].qty : 0;

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${pImg}" onerror="this.src='https://via.placeholder.com/150?text=No+Photo'">
      <div class="product-info">
        <h4>${pName}</h4>
        <p class="price">${pPrice} AMD</p>
        <div class="qty-control">
          <button onclick="updateQty('${storeKey}', '${pName}', ${pPrice}, -1, this)">-</button>
          <span class="qty-val">${qty}</span>
          <button onclick="updateQty('${storeKey}', '${pName}', ${pPrice}, 1, this)">+</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   КОРЗИНА И ЗАКАЗ
========================================================= */

function updateQty(sId, pName, price, delta, btn) {
  if (!carts[sId]) carts[sId] = {};
  if (!carts[sId][pName]) carts[sId][pName] = { qty: 0, price: price };

  carts[sId][pName].qty += delta;

  if (carts[sId][pName].qty <= 0) {
    delete carts[sId][pName];
  }

  const qtyEl = btn.parentElement.querySelector(".qty-val");
  if (qtyEl) qtyEl.innerText = carts[sId][pName]?.qty || 0;

  updateCartBadge();
  localStorage.setItem("meronq_carts", JSON.stringify(carts));
}

function updateCartBadge() {
  let total = 0;
  for (let s in carts) {
    for (let p in carts[s]) {
      total += carts[s][p].qty;
    }
  }
  const badge = document.getElementById("cart-badge");
  if (badge) badge.innerText = total;
}

async function sendOrder() {
  const name = document.getElementById("order-name")?.value;
  const phone = document.getElementById("order-phone")?.value;
  const address = document.getElementById("order-address")?.value;

  if (!name || !phone || !address) {
    alert("Пожалуйста, заполните все поля!");
    return;
  }

  const products = [];
  let grandTotal = 0;

  for (let sId in carts) {
    for (let pName in carts[sId]) {
      const item = carts[sId][pName];
      products.push({
        storeKey: sId,
        name: pName,
        quantity: item.qty,
        unitPrice: item.price
      });
      grandTotal += item.qty * item.price;
    }
  }

  if (products.length === 0) return alert("Корзина пуста");

  const orderData = {
    name,
    phone,
    address,
    products,
    totals: { grandTotal }
  };

  try {
    const resp = await fetch(`${WORKER_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
      },
      body: JSON.stringify(orderData)
    });

    const result = await resp.json();

    if (resp.ok) {
      // ИСПОЛЬЗУЕМ result.id (как в воркере)
      alert(`✅ Заказ успешно отправлен! ID: ${result.id.slice(-6)}`);
      localStorage.removeItem("meronq_carts");
      location.reload();
    } else {
      alert("Ошибка: " + result.error);
    }
  } catch (e) {
    alert("Ошибка сети. Проверьте соединение.");
  }
}

/* =========================================================
   СТАРТ
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  // Загрузка корзины из памяти
  const saved = localStorage.getItem("meronq_carts");
  if (saved) carts = JSON.parse(saved);
  
  updateCartBadge();
  loadStores();
  
  // Глобальные функции для HTML кнопок
  window.closeStore = () => document.getElementById("store-overlay").style.display = "none";
  window.sendOrder = sendOrder;
});
